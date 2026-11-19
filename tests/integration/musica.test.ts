/** Verifica el catálogo y el audio de los modos de juego con MySQL. */
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import { createApp } from '../../server/aplicacion.js';
import { query, write, pool } from '../../server/base-datos.js';
import {
  storeRecordings,
  fetchArtistRecordings,
  ensureRecordingGenre,
  RECORDING_GENRES,
  type MusicFetch,
} from '../../server/musica.js';
import { DEFAULT_CONFIG, type GameSnapshot } from '../../shared/tipos.js';
import { REMOVED_MUSIC_GENRES } from '../../shared/musica.js';

let server: Server,
  base = '';
const users: { id: string; cookie: string }[] = [],
  songs: string[] = [],
  games: string[] = [],
  rooms: string[] = [];
const prefix = String(Date.now() * 100 + Math.floor(Math.random() * 100)),
  genre = `Pop QA ${prefix}`;
let unsafeRedirect = false;
/** Simula únicamente la frontera del proveedor; permisos, selección y persistencia usan la API y MySQL reales. */
const provider: MusicFetch = async (input, init) => {
  const url = new URL(String(input));
  if (url.pathname === '/search/artist')
    return Response.json({ data: [{ id: 92, name: 'Linkin Park' }] });
  if (url.pathname.startsWith('/album/')) return Response.json({ release_date: '2024-01-01' });
  if (url.pathname.startsWith('/track/'))
    return Response.json({
      id: Number(url.pathname.split('/').pop()),
      readable: true,
      preview: 'https://cdnt-preview.dzcdn.net/qa.mp3',
    });
  if (url.pathname === '/artist/92/top')
    return Response.json({
      data: Array.from({ length: 10 }, (_, i) => ({
        id: Number(`${prefix}${i}`),
        title: `Canción de prueba ${i}`,
        artist: { id: 92, name: 'Linkin Park' },
        album: { id: 999999 },
        readable: true,
        preview: 'https://cdnt-preview.dzcdn.net/qa.mp3',
        duration: 180,
        permalink: `/qa/track-${i}`,
        release_date: '2024-01-01',
        is_streamable: true,
        is_available: true,
        is_stream_gated: false,
      })),
    });
  if (unsafeRedirect)
    return new Response(null, { status: 302, headers: { Location: 'https://127.0.0.1/private' } });
  assert.equal(new Headers(init?.headers).get('Range'), 'bytes=0-63');
  return new Response(new Uint8Array(64).fill(255), {
    status: 206,
    headers: {
      'Content-Type': 'audio/mpeg',
      'Content-Range': 'bytes 0-63/100000',
      'Content-Length': '64',
    },
  });
};
/** Llama a una ruta con la sesión del participante de prueba elegido. */
async function call(route: string, method = 'GET', body?: unknown, user = 0) {
  const response = await fetch(`${base}/api${route}`, {
    method,
    headers: {
      cookie: users[user]?.cookie || '',
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: response.status, data: response.status === 204 ? null : await response.json() };
}
before(async () => {
  const tracks = await fetchArtistRecordings('Linkin Park', provider);
  await storeRecordings(genre, tracks);
  songs.push(...tracks.map((track) => `deezer-${track.id}`));
  await write(
    'INSERT INTO songs(id,title,artist,aliases,genre,release_year,audio_file) VALUES (?,?,?,?,?,?,?)',
    [`old-${prefix}`, 'Melodía anterior', 'Sintetizada', '[]', genre, 2024, 'old.wav'],
  );
  songs.push(`old-${prefix}`);
  await write("INSERT INTO song_media(song_id,source,enabled) VALUES (?,'builtin',TRUE)", [
    `old-${prefix}`,
  ]);
  // Simula datos antiguos reactivados: la selección y las opciones deben excluirlos igualmente.
  for (const [index, removed] of REMOVED_MUSIC_GENRES.entries()) {
    for (let i = 0; i < 5; i++) {
      const id = `removed-${prefix}-${index}-${i}`;
      await write(
        'INSERT INTO songs(id,title,artist,aliases,genre,release_year,audio_file) VALUES (?,?,?,?,?,?,?)',
        [id, 'Canción retirada QA', 'Artista QA', '[]', removed, 2024, 'qa.mp3'],
      );
      songs.push(id);
      await write(
        "INSERT INTO song_media(song_id,source,external_id,enabled) VALUES (?,'deezer',?,TRUE)",
        [id, String(Number(prefix) + 1000 + index * 5 + i)],
      );
    }
  }
  server = createServer(createApp(() => {}, provider));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  for (let i = 0; i < 4; i++) {
    const response = await fetch(`${base}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: `Audio QA ${i}`,
        email: `audio-${randomUUID()}@example.test`,
        password: `Qa-${randomUUID()}`,
      }),
    });
    assert.equal(response.status, 201);
    const { user } = await response.json();
    users.push({ id: user.id, cookie: response.headers.get('set-cookie')!.split(';')[0] });
  }
});
after(async () => {
  for (const code of rooms) await write('DELETE FROM rooms WHERE code=?', [code]);
  for (const id of games) await write('DELETE FROM games WHERE id=?', [id]);
  for (const id of songs) await write('DELETE FROM songs WHERE id=?', [id]);
  for (const user of users) await write('DELETE FROM users WHERE id=?', [user.id]);
  await pool.end();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});
test('las grabaciones reales se usan solo en los modos de juego', async (t) => {
  await t.test(
    'un fallo de disponibilidad no reemplaza el catálogo anterior y un lote completo publica 35 artistas con cinco canciones',
    async () => {
      const mapping = RECORDING_GENRES.find((item) => item.name === 'Rock')!;
      const names = [...mapping.artists, ...mapping.alternates];
      const previous = await query<{ song_id: string; enabled: number }>(
        "SELECT m.song_id,m.enabled FROM song_media m JOIN songs s ON s.id=m.song_id WHERE s.genre='Rock' AND m.source='deezer'",
      );
      const previousSync = await query<{
        genre: string;
        version: string;
        artist_count: number;
        track_count: number;
        updated_at: Date;
      }>("SELECT * FROM music_catalog_sync WHERE genre='Rock'");
      const created: string[] = [];
      const fullProvider: MusicFetch = async (input) => {
        const url = new URL(String(input));
        if (url.pathname === '/search/artist') {
          const name = url.searchParams.get('q')!;
          return Response.json({
            data: [{ id: Number(prefix) + 1000 + names.indexOf(name), name, nb_fan: 100000 }],
          });
        }
        const match = /^\/artist\/(\d+)\/top$/.exec(url.pathname);
        if (match) {
          const artistId = Number(match[1]);
          return Response.json({
            data: Array.from({ length: 7 }, (_, i) => ({
              id: artistId * 10 + i,
              title: `Éxito ${i}`,
              title_short: `Éxito ${i}`,
              rank: 100 - i,
              artist: { id: artistId, name: names[artistId - Number(prefix) - 1000] },
              album: { id: 55555555 },
              readable: true,
              preview: 'https://cdnt-preview.dzcdn.net/test.mp3',
            })),
          });
        }
        return Response.json({ release_date: '2024-01-01' });
      };
      const unavailable: MusicFetch = async (input, init) => {
        const url = new URL(String(input)),
          name = url.searchParams.get('q');
        if (
          url.pathname === '/search/artist' &&
          (name === 'Linkin Park' || mapping.alternates.includes(name!))
        )
          return Response.json({ data: [] });
        return fullProvider(input, init);
      };
      try {
        await assert.rejects(
          () => ensureRecordingGenre('Rock', unavailable, true),
          /34\/35 artistas/,
        );
        assert.deepEqual(
          await query(
            "SELECT m.song_id,m.enabled FROM song_media m JOIN songs s ON s.id=m.song_id WHERE s.genre='Rock' AND m.source='deezer'",
          ),
          previous,
        );
        for (let i = 0; i < 35; i++)
          for (let j = 0; j < 5; j++)
            created.push(`deezer-${(Number(prefix) + 1000 + i) * 10 + j}`);
        await ensureRecordingGenre('Rock', fullProvider, true);
        const artists = await query<{ count: number }>(
          "SELECT s.artist,COUNT(*) AS count FROM songs s JOIN song_media m ON m.song_id=s.id WHERE s.genre='Rock' AND m.source='deezer' AND m.enabled=1 GROUP BY s.artist",
        );
        assert.equal(artists.length, 35);
        assert.ok(artists.every((item) => Number(item.count) === 5));
        const options = await call('/music/options');
        assert.equal(
          options.data.genres.find((item: { name: string }) => item.name === 'Rock').artists,
          35,
        );
        assert.equal(
          options.data.genres.find((item: { name: string }) => item.name === 'Rock').count,
          175,
        );
        const old = await query<{ song_id: string; enabled: number }>(
          `SELECT song_id,enabled FROM song_media WHERE song_id IN (${previous.map(() => '?').join(',')})`,
          previous.map((item) => item.song_id),
        );
        assert.equal(old.length, previous.length);
        assert.ok(old.every((item) => !item.enabled));
      } finally {
        for (const id of created) await write('DELETE FROM songs WHERE id=?', [id]);
        for (const item of previous)
          await write('UPDATE song_media SET enabled=? WHERE song_id=?', [
            !!item.enabled,
            item.song_id,
          ]);
        await write("DELETE FROM music_catalog_sync WHERE genre='Rock'");
        for (const item of previousSync)
          await write(
            'INSERT INTO music_catalog_sync(genre,version,artist_count,track_count,updated_at) VALUES (?,?,?,?,?)',
            [item.genre, item.version, item.artist_count, item.track_count, item.updated_at],
          );
      }
    },
  );
  await t.test('se retiraron biblioteca, carga, configuración y vistas previas', async () => {
    for (const route of ['/music', '/music/jamendo/search', '/music/abc/audio', '/catalog'])
      assert.equal((await call(route)).status, 404);
    assert.equal((await call('/music/upload', 'POST', {})).status, 404);
  });
  await t.test(
    'los géneros cuentan solo grabaciones reales, sin melodías sintetizadas',
    async () => {
      const result = await call('/music/options');
      assert.equal(result.status, 200);
      assert.equal(
        result.data.genres.find((item: { name: string }) => item.name === genre).count,
        5,
      );
    },
  );
  await t.test(
    'Blues, Jazz y Country no aparecen ni se pueden seleccionar aunque existan pistas activas antiguas',
    async () => {
      const options = await call('/music/options');
      for (const removed of REMOVED_MUSIC_GENRES) {
        assert.equal(
          options.data.genres.some((item: { name: string }) => item.name === removed),
          false,
        );
        assert.equal(
          (await call('/games', 'POST', { ...DEFAULT_CONFIG, genre: removed, rounds: 5 })).status,
          422,
        );
      }
      const mixed = await call('/games', 'POST', { ...DEFAULT_CONFIG, rounds: 5 });
      assert.equal(mixed.status, 201);
      games.push(mixed.data.id);
      const [chosen] = await query<{ count: number }>(
        'SELECT COUNT(*) AS count FROM games g JOIN songs s ON JSON_CONTAINS(g.song_ids,JSON_QUOTE(s.id)) WHERE g.id=? AND s.genre IN (?,?,?)',
        [mixed.data.id, ...REMOVED_MUSIC_GENRES],
      );
      assert.equal(Number(chosen.count), 0);
    },
  );
  await t.test(
    'individual, duelo y equipos seleccionan grabaciones según el género',
    async () => {
      for (const mode of ['solo', 'duel', 'teams'] as const) {
        let game: GameSnapshot;
        if (mode === 'solo') {
          const result = await call('/games', 'POST', {
            ...DEFAULT_CONFIG,
            genre,
            rounds: 5,
          });
          assert.equal(result.status, 201);
          game = result.data;
        } else {
          const created = await call('/rooms', 'POST', {
            name: 'Audio real QA',
            mode,
            config: { ...DEFAULT_CONFIG, genre, rounds: 5 },
          });
          assert.equal(created.status, 201);
          const code = created.data.code;
          rooms.push(code);
          const capacity = mode === 'duel' ? 2 : 4;
          for (let i = 0; i < capacity; i++) {
            if (i) assert.equal((await call('/rooms/join', 'POST', { code }, i)).status, 200);
            assert.equal(
              (await call(`/rooms/${code}/player`, 'PATCH', { action: 'ready', ready: true }, i))
                .status,
              200,
            );
          }
          const started = await call(`/rooms/${code}/start`, 'POST');
          assert.equal(started.status, 200);
          game = (await call(`/games/${started.data.gameId}`)).data;
        }
        games.push(game.id);
        assert.equal(game.audioSource, 'deezer');
        assert.equal(game.audioStart, 0);
        assert.equal(game.audioDuration, 12);
        assert.equal(game.config.genre, genre);
        assert.deepEqual(game.results, []);
        const [stored] = await query<{ song_ids: string[] }>(
          'SELECT song_ids FROM games WHERE id=?',
          [game.id],
        );
        assert.ok(stored.song_ids.every((id) => id.startsWith(`deezer-${prefix}`)));
        const audio = await fetch(`${base}/api/games/${game.id}/audio`, {
          headers: { cookie: users[0].cookie, Range: 'bytes=0-63' },
        });
        assert.equal(audio.status, 206);
        assert.equal(audio.headers.get('Content-Type'), 'audio/mpeg');
        assert.equal((await audio.arrayBuffer()).byteLength, 64);
      }
    },
  );
  await t.test('el audio mantiene permisos y rechaza redirecciones inseguras', async () => {
    const denied = await fetch(`${base}/api/games/${games[0]}/audio`, {
      headers: { cookie: users[1].cookie },
    });
    assert.equal(denied.status, 403);
    unsafeRedirect = true;
    const blocked = await fetch(`${base}/api/games/${games[0]}/audio`, {
      headers: { cookie: users[0].cookie },
    });
    assert.equal(blocked.status, 502);
    unsafeRedirect = false;
  });
});
