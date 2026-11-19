/** Consulta Deezer, sincroniza canciones y entrega el audio autorizado. */
import { Router, type Request, type Response } from 'express';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { z } from 'zod';
import { createHash } from 'node:crypto';
import { query, write, transaction, type Database } from './base-datos.js';
import { env } from './configuracion.js';
import { HttpError } from './errores.js';
import { REMOVED_MUSIC_GENRES, type MusicOptions } from '../shared/musica.js';
import { RECORDING_GENRES, ARTISTS_PER_GENRE, TRACKS_PER_ARTIST } from './catalogo-musical.js';
export { RECORDING_GENRES, ARTISTS_PER_GENRE, TRACKS_PER_ARTIST } from './catalogo-musical.js';

export type MusicFetch = typeof fetch;
const artistSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().trim().min(1).max(150),
  nb_fan: z.number().int().nonnegative().optional().default(0),
});
const recordingSchema = z.object({
  id: z.number().int().positive(),
  title: z.string().trim().min(1).max(150),
  title_short: z.string().trim().min(1).max(150).optional(),
  title_version: z.string().optional(),
  artist: artistSchema,
  album: z.object({ id: z.number().int().positive() }),
  readable: z.literal(true),
  preview: z.string().url(),
  release_date: z.string().optional(),
  rank: z.number().int().nonnegative().optional().default(0),
});
type Recording = z.infer<typeof recordingSchema>;
const DEEZER_TERMS = 'https://developers.deezer.com/termsofuse';
const running = new Map<string, Promise<void>>(),
  lastSuccess = new Map<string, number>(),
  lastFailure = new Map<string, number>();
const albumDates = new Map<number, Promise<string | undefined>>();
let nextRequest = 0;
let backgroundRefresh: Promise<void> | undefined;

/** Normaliza nombres para exigir el perfil exacto y excluir artistas de covers o tributos. */
function artistKey(name: string): string {
  return name
    .replace(/[Яя]/g, 'r')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/** Acepta exclusivamente el CDN HTTPS de muestras de Deezer, sin credenciales ni puertos alternativos. */
export function safeRecordingAudio(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new HttpError(502, 'Dirección de audio inválida.');
  }
  if (
    url.protocol !== 'https:' ||
    !url.hostname.endsWith('.dzcdn.net') ||
    url.username ||
    url.password ||
    (url.port && url.port !== '443')
  )
    throw new HttpError(502, 'Destino de audio no autorizado por el proveedor.');
  return url;
}

/** Valida pistas originales del perfil seleccionado y descarta muestras ausentes, bloqueadas o inseguras. */
export function parseRecordings(data: unknown, artistId?: number): Recording[] {
  const result = z.object({ data: z.array(z.unknown()).max(100) }).safeParse(data);
  if (!result.success) throw new HttpError(502, 'Deezer devolvió un catálogo inválido.');
  const seen = new Set<string>();
  return result.data.data
    .flatMap((value) => {
      const parsed = recordingSchema.safeParse(value);
      if (!parsed.success) return [];
      const track = parsed.data;
      if (artistId !== undefined && track.artist.id !== artistId) return [];
      if (/\b(live|remix|karaoke|tribute)\b/i.test(track.title_version || '')) return [];
      try {
        safeRecordingAudio(track.preview);
      } catch {
        return [];
      }
      return [track];
    })
    .sort((a, b) => b.rank - a.rank)
    .filter((track) => {
      const key = `${track.artist.id}:${artistKey(track.title_short || track.title)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

/** Consulta JSON oficial con tiempo límite y separa llamadas reales para evitar ráfagas. */
async function providerJson(path: string, fetcher: MusicFetch): Promise<unknown> {
  if (fetcher === fetch) {
    const start = Math.max(Date.now(), nextRequest);
    nextRequest = start + 140;
    if (start > Date.now()) await new Promise((resolve) => setTimeout(resolve, start - Date.now()));
  }
  try {
    const response = await fetcher(new URL(path, 'https://api.deezer.com'), {
      signal: AbortSignal.timeout(15000),
      redirect: 'error',
    });
    if (!response.ok) throw new Error('provider');
    const data: unknown = await response.json();
    if (typeof data === 'object' && data !== null && 'error' in data) throw new Error('provider');
    return data;
  } catch {
    throw new HttpError(
      502,
      'No pudimos consultar las canciones oficiales de Deezer. Comprueba Internet y vuelve a intentar.',
    );
  }
}

/** Reutiliza la fecha del álbum publicada por Deezer; no inventa fechas si faltan metadatos. */
async function albumDate(id: number, fetcher: MusicFetch): Promise<string | undefined> {
  const previous = albumDates.get(id);
  if (previous) return previous;
  const operation = providerJson(`/album/${id}`, fetcher)
    .then((data) => {
      const parsed = z
        .object({ release_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) })
        .safeParse(data);
      return parsed.success ? parsed.data.release_date : undefined;
    })
    .catch(() => {
      albumDates.delete(id);
      return undefined;
    });
  albumDates.set(id, operation);
  return operation;
}

/** Obtiene canciones del artista original, sin aceptar coincidencias aproximadas con otros intérpretes. */
export async function fetchArtistRecordings(
  name: string,
  fetcher: MusicFetch = fetch,
): Promise<Recording[]> {
  const response = await providerJson(
    `/search/artist?q=${encodeURIComponent(name)}&limit=100&order=RANKING`,
    fetcher,
  );
  const artists = z.object({ data: z.array(z.unknown()).max(100) }).safeParse(response);
  const artist = artists.success
    ? artists.data.data
        .flatMap((value) => {
          const parsed = artistSchema.safeParse(value);
          return parsed.success ? [parsed.data] : [];
        })
        .filter((item) => artistKey(item.name) === artistKey(name))
        .sort((a, b) => b.nb_fan - a.nb_fan)[0]
    : undefined;
  if (!artist) throw new HttpError(502, `No se encontró el perfil original de ${name}.`);
  const tracks = parseRecordings(
    await providerJson(`/artist/${artist.id}/top?limit=100`, fetcher),
    artist.id,
  ).slice(0, TRACKS_PER_ARTIST);
  return Promise.all(
    tracks.map(async (track) => ({
      ...track,
      release_date: await albumDate(track.album.id, fetcher),
    })),
  );
}

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
async function musicOptions(fetcher: MusicFetch = fetch): Promise<MusicOptions> {
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

/** Resuelve una muestra vigente desde el identificador oficial, evitando enlaces firmados caducados. */
export async function resolveRecordingPreview(
  value: string,
  fetcher: MusicFetch = fetch,
): Promise<URL> {
  const match = /^https:\/\/api\.deezer\.com\/track\/(\d+)$/.exec(value);
  if (!match) throw new HttpError(502, 'Referencia de canción oficial inválida.');
  const data = await providerJson(`/track/${match[1]}`, fetcher);
  const parsed = z
    .object({
      id: z.number().int().positive(),
      readable: z.literal(true),
      preview: z.string().url(),
    })
    .safeParse(data);
  if (!parsed.success || String(parsed.data.id) !== match[1])
    throw new HttpError(502, 'Esta canción no tiene una muestra disponible en tu región.');
  return safeRecordingAudio(parsed.data.preview);
}

/** Transmite la muestra oficial solo para una ronda autorizada y valida cada redirección del CDN. */
export async function serveMusicAudio(
  media: { url: string | null },
  req: Request,
  res: Response,
  fetcher: MusicFetch = fetch,
): Promise<void> {
  if (!media.url)
    throw new HttpError(409, 'Esta partida usa el catálogo anterior. Crea una partida nueva.');
  let url = await resolveRecordingPreview(media.url, fetcher);
  res.set('Cache-Control', 'private, no-store');
  for (let redirect = 0; redirect < 5; redirect++) {
    let upstream: globalThis.Response;
    try {
      upstream = await fetcher(url, {
        redirect: 'manual',
        signal: AbortSignal.timeout(30000),
        headers: { ...(req.headers.range ? { Range: req.headers.range } : {}) },
      });
    } catch {
      throw new HttpError(
        502,
        'La muestra oficial no está disponible. Comprueba Internet e inténtalo nuevamente.',
      );
    }
    if ([301, 302, 303, 307, 308].includes(upstream.status)) {
      const target = upstream.headers.get('location');
      await upstream.body?.cancel();
      if (!target) break;
      url = safeRecordingAudio(new URL(target, url).href);
      continue;
    }
    if (
      ![200, 206, 416].includes(upstream.status) ||
      (upstream.status !== 416 && !/^audio\//i.test(upstream.headers.get('content-type') || ''))
    ) {
      await upstream.body?.cancel();
      throw new HttpError(502, 'Deezer no pudo reproducir esta muestra oficial.');
    }
    res.status(upstream.status);
    for (const header of ['content-type', 'content-length', 'content-range', 'accept-ranges']) {
      const value = upstream.headers.get(header);
      if (value) res.set(header, value);
    }
    if (upstream.body)
      await pipeline(
        Readable.fromWeb(upstream.body as Parameters<typeof Readable.fromWeb>[0]),
        res,
      );
    else res.end();
    return;
  }
  throw new HttpError(502, 'No se pudo resolver la muestra oficial de la ronda.');
}

/** Expone opciones de partida y búsquedas con muestras breves de las canciones del catálogo. */
export function musicRouter(fetcher: MusicFetch = fetch): Router {
  const router = Router();
  router.get('/options', async (_req, res) => {
    res.json(await musicOptions(fetcher));
  });
  router.get('/search', async (req, res) => {
    const { q } = z.object({ q: z.string().trim().min(2).max(80) }).parse(req.query);
    const term = `%${q}%`;
    const tracks = await query<{ id: string; title: string; artist: string }>(
      `SELECT s.id,s.title,s.artist
       FROM songs s JOIN song_media m ON m.song_id=s.id
       WHERE m.source='deezer' AND m.enabled=TRUE
         AND (s.title LIKE ? OR s.artist LIKE ?)
       ORDER BY CASE WHEN LOWER(s.title)=LOWER(?) THEN 0
                     WHEN LOWER(s.artist)=LOWER(?) THEN 1 ELSE 2 END,
                s.title
       LIMIT 12`,
      [term, term, q, q],
    );
    res.json({ tracks });
  });
  router.get('/search/:id/audio', async (req, res) => {
    const id = z.string().min(1).max(40).parse(req.params.id);
    const [media] = await query<{ external_id: string | null }>(
      "SELECT external_id FROM song_media WHERE song_id=? AND source='deezer' AND enabled=TRUE",
      [id],
    );
    if (!media?.external_id || !/^\d+$/.test(media.external_id))
      throw new HttpError(404, 'No hay una muestra disponible para esta canción.');
    await serveMusicAudio(
      { url: `https://api.deezer.com/track/${media.external_id}` },
      req,
      res,
      fetcher,
    );
  });
  return router;
}
