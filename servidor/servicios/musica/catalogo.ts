/** Consulta Deezer, sincroniza canciones y entrega el audio autorizado. */
import { createHash } from 'node:crypto';
import { query, write, transaction, type Database } from '../../datos/base-datos.js';
import { env } from '../../configuracion.js';
import { HttpError } from '../../errores.js';
import { REMOVED_MUSIC_GENRES, type MusicOptions } from '../../../compartido/musica.js';
import { RECORDING_GENRES, ARTISTS_PER_GENRE, TRACKS_PER_ARTIST } from './artistas.js';
import { DEEZER_TERMS, fetchArtistRecordings, type MusicFetch, type Recording } from './deezer.js';
export { RECORDING_GENRES, ARTISTS_PER_GENRE, TRACKS_PER_ARTIST } from './artistas.js';

const running = new Map<string, Promise<void>>(),
  lastSuccess = new Map<string, number>(),
  lastFailure = new Map<string, number>();
let backgroundRefresh: Promise<void> | undefined;

/** Reúne un género conservando a los artistas disponibles si falla otro perfil. */
async function fetchRecordings(genre: string, fetcher: MusicFetch = fetch): Promise<Recording[]> {
  const mapping = RECORDING_GENRES.find((item) => item.name === genre);
  if (!mapping) throw new HttpError(422, 'Ese género no está disponible.');
  const tracks: Recording[] = [];
  const selected = new Set<number>();
  for (const name of [...mapping.artists, ...mapping.alternates]) {
    if (selected.size === ARTISTS_PER_GENRE) break;
    try {
      const songs = await fetchArtistRecordings(name, fetcher);
      if (songs.length !== TRACKS_PER_ARTIST)
        throw new Error(`solo ${songs.length} muestras disponibles`);
      if (selected.has(songs[0].artist.id)) continue;
      selected.add(songs[0].artist.id);
      tracks.push(...songs);
    } catch (error) {
      if (fetcher === fetch)
        console.warn(
          `Catálogo pendiente: ${name}`,
          error instanceof Error ? error.message : 'proveedor',
        );
    }
  }
  if (
    selected.size !== ARTISTS_PER_GENRE ||
    new Set(tracks.map((track) => track.id)).size !== ARTISTS_PER_GENRE * TRACKS_PER_ARTIST
  )
    throw new HttpError(
      502,
      `${genre}: solo se encontraron ${selected.size}/${ARTISTS_PER_GENRE} artistas con cinco canciones oficiales disponibles.`,
    );
  return tracks;
}

/** Persiste referencias y metadatos; las URL firmadas de audio se resuelven al reproducir cada ronda. */
export async function storeRecordings(
  genre: string,
  tracks: Recording[],
  connection?: Database,
): Promise<void> {
  if (REMOVED_MUSIC_GENRES.some((removed) => removed.toLowerCase() === genre.trim().toLowerCase()))
    throw new HttpError(422, 'Esta categoría fue retirada del juego.');
  /** Escribe un lote con la misma transacción para no publicar catálogos parciales. */
  async function store(db: Database): Promise<void> {
    for (const track of tracks) {
      const id = `deezer-${track.id}`,
        year = Number(track.release_date?.slice(0, 4)) || 0;
      const aliases = JSON.stringify(
        track.title_short && track.title_short !== track.title ? [track.title_short] : [],
      );
      await write(
        'INSERT INTO songs(id,title,artist,aliases,genre,release_year,audio_file) VALUES (?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE title=VALUES(title),artist=VALUES(artist),aliases=VALUES(aliases),genre=VALUES(genre),release_year=VALUES(release_year)',
        [id, track.title, track.artist.name, aliases, genre, year, `${id}.mp3`],
        db,
      );
      await write(
        "INSERT INTO song_media(song_id,source,external_id,audio_url,license_url,source_url,enabled,clip_start,duration) VALUES (?,'deezer',?,?,?,?,TRUE,0,30) ON DUPLICATE KEY UPDATE enabled=TRUE,audio_url=VALUES(audio_url),license_url=VALUES(license_url),source_url=VALUES(source_url),clip_start=0,duration=30,updated_at=CURRENT_TIMESTAMP",
        [
          id,
          String(track.id),
          `https://api.deezer.com/track/${track.id}`,
          DEEZER_TERMS,
          `https://www.deezer.com/track/${track.id}`,
        ],
        db,
      );
    }
  }
  if (connection) await store(connection);
  else await transaction(store);
}

/** Comparte sincronizaciones por género y reutiliza referencias recientes incluso después de reiniciar. */
export async function ensureRecordingGenre(
  genre: string,
  fetcher: MusicFetch = fetch,
  force = false,
): Promise<void> {
  if (!force && env.NODE_ENV === 'test') return;
  const now = Date.now();
  if (!force && now - (lastSuccess.get(genre) || 0) < 12 * 3600000) return;
  if (!force && now - (lastFailure.get(genre) || 0) < 60000) return;
  const pending = running.get(genre);
  if (pending) return pending;
  const operation = (async () => {
    try {
      const mapping = RECORDING_GENRES.find((item) => item.name === genre);
      if (!mapping) throw new HttpError(422, 'Ese género no está disponible.');
      const version = createHash('sha256')
        .update(JSON.stringify({ mapping, tracks: TRACKS_PER_ARTIST, selection: 'rank-v2' }))
        .digest('hex');
      const [cached] = force
        ? []
        : await query<{ genre: string }>(
            'SELECT genre FROM music_catalog_sync WHERE genre=? AND version=? AND updated_at>DATE_SUB(NOW(),INTERVAL 12 HOUR)',
            [genre, version],
          );
      if (!cached) {
        const tracks = await fetchRecordings(genre, fetcher);
        await transaction(async (db) => {
          await write(
            "UPDATE song_media m JOIN songs s ON s.id=m.song_id SET m.enabled=FALSE WHERE m.source='deezer' AND s.genre=?",
            [genre],
            db,
          );
          await storeRecordings(genre, tracks, db);
          await write(
            'INSERT INTO music_catalog_sync(genre,version,artist_count,track_count) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE version=VALUES(version),artist_count=VALUES(artist_count),track_count=VALUES(track_count),updated_at=CURRENT_TIMESTAMP',
            [genre, version, ARTISTS_PER_GENRE, tracks.length],
            db,
          );
        });
        if (fetcher === fetch)
          console.log(
            `${genre}: ${ARTISTS_PER_GENRE} artistas · ${tracks.length} canciones oficiales.`,
          );
      }
      lastSuccess.set(genre, Date.now());
      lastFailure.delete(genre);
    } catch (error) {
      lastFailure.set(genre, Date.now());
      throw error;
    } finally {
      running.delete(genre);
    }
  })();
  running.set(genre, operation);
  return operation;
}

/** Prepara tres géneros simultáneos con un límite global de consultas al proveedor. */
export async function prepareRecordings(fetcher: MusicFetch = fetch, force = false): Promise<void> {
  if (!force && env.NODE_ENV === 'test') return;
  /** Recorre los géneros sin multiplicar las consultas por cada navegador conectado. */
  async function synchronize(): Promise<void> {
    const failures: string[] = [];
    for (let i = 0; i < RECORDING_GENRES.length; i += 3) {
      const group = RECORDING_GENRES.slice(i, i + 3);
      const results = await Promise.allSettled(
        group.map((genre) => ensureRecordingGenre(genre.name, fetcher, force)),
      );
      results.forEach((result, index) => {
        if (result.status === 'rejected') failures.push(group[index].name);
      });
    }
    if (failures.length) console.warn('Géneros pendientes de Deezer:', failures.join(', '));
    if (force && failures.length)
      throw new HttpError(
        502,
        `No se completó el catálogo de: ${failures.join(', ')}. Se conservó el catálogo anterior de esos géneros.`,
      );
  }
  if (force) {
    await synchronize();
    return;
  }
  const [available] = await query<{ count: number }>(
    "SELECT COUNT(*) AS count FROM song_media m JOIN songs s ON s.id=m.song_id WHERE m.source='deezer' AND m.enabled=1 AND s.genre NOT IN (?,?,?)",
    [...REMOVED_MUSIC_GENRES],
  );
  const operation =
    backgroundRefresh ??
    (backgroundRefresh = synchronize().finally(() => {
      backgroundRefresh = undefined;
    }));
  if (Number(available.count) >= 5) {
    // El repertorio publicado sigue disponible mientras se renueva el catálogo grande.
    void operation.catch((error) =>
      console.warn(
        'Actualización musical pendiente:',
        error instanceof Error ? error.message : 'proveedor',
      ),
    );
  } else await operation;
}

/** Ofrece únicamente categorías con suficientes grabaciones oficiales para comenzar una partida. */
export async function musicOptions(fetcher: MusicFetch = fetch): Promise<MusicOptions> {
  await prepareRecordings(fetcher);
  const genres = await query<{ name: string; count: number; artists: number }>(
    "SELECT s.genre AS name,COUNT(*) AS count,COUNT(DISTINCT s.artist) AS artists FROM songs s JOIN song_media m ON m.song_id=s.id WHERE m.enabled=1 AND m.source='deezer' AND s.genre NOT IN (?,?,?) GROUP BY s.genre HAVING COUNT(*)>=5 ORDER BY s.genre",
    [...REMOVED_MUSIC_GENRES],
  );
  const total = genres.reduce((sum, item) => sum + Number(item.count), 0);
  if (!total)
    throw new HttpError(
      503,
      'El catálogo de canciones oficiales aún no está disponible. Comprueba Internet y vuelve a cargar.',
    );
  return {
    genres: genres.map((item) => ({
      ...item,
      count: Number(item.count),
      artists: Number(item.artists),
    })),
    artists: genres.reduce((sum, item) => sum + Number(item.artists), 0),
    total,
  };
}
