/** Comprueba perfiles, popularidad, catálogo y seguridad del audio. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  RECORDING_GENRES,
  storeRecordings,
  ARTISTS_PER_GENRE,
  TRACKS_PER_ARTIST,
} from '../../servidor/servicios/musica/catalogo.js';
import { resolveRecordingPreview } from '../../servidor/servicios/musica/deezer.js';
import {
  parseRecordings,
  safeRecordingAudio,
  fetchArtistRecordings,
} from '../../servidor/servicios/musica/deezer.js';
import { REMOVED_MUSIC_GENRES } from '../../compartido/musica.js';

test('cada uno de los nueve géneros tiene 35 artistas principales distintos y cinco canciones por artista', () => {
  assert.equal(RECORDING_GENRES.length, 9);
  assert.equal(ARTISTS_PER_GENRE, 35);
  assert.equal(TRACKS_PER_ARTIST, 5);
  const all = new Set<string>();
  for (const genre of RECORDING_GENRES) {
    assert.equal(genre.artists.length, 35, genre.name);
    for (const name of genre.artists) {
      const key = name.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
      assert.equal(all.has(key), false, `Artista repetido: ${name}`);
      all.add(key);
    }
  }
  assert.equal(all.size, 315);
});

test('las categorías retiradas no se sincronizan ni se pueden reactivar al importar', async () => {
  for (const genre of REMOVED_MUSIC_GENRES) {
    assert.equal(
      RECORDING_GENRES.some((item) => item.name === genre),
      false,
    );
    await assert.rejects(() => storeRecordings(genre.toLowerCase(), []), /categoría fue retirada/);
  }
});

const recording = {
  id: 676183,
  title: 'In the End',
  title_short: 'In the End',
  artist: { id: 92, name: 'Linkin Park' },
  album: { id: 81763 },
  readable: true,
  preview: 'https://cdnt-preview.dzcdn.net/api/1/1/sample.mp3',
};
test('el catálogo exige artista original, muestra pública y canciones únicas', () => {
  const tracks = parseRecordings(
    {
      data: [
        recording,
        recording,
        { ...recording, id: 2, readable: false },
        { ...recording, id: 3, preview: '' },
        { ...recording, id: 4, artist: { id: 999, name: 'Linkin Park Tribute' } },
        { ...recording, id: 5, title_version: '(Live)' },
        { ...recording, id: 6, preview: 'https://127.0.0.1/private' },
      ],
    },
    92,
  );
  assert.deepEqual(
    tracks.map((item) => item.id),
    [676183],
  );
  assert.throws(() => parseRecordings({ unexpected: [] }));
});
test('solo se aceptan HTTPS y CDN oficiales en todas las redirecciones', () => {
  assert.equal(safeRecordingAudio(recording.preview).protocol, 'https:');
  for (const url of [
    'http://cdnt-preview.dzcdn.net/',
    'https://127.0.0.1/',
    'https://cdnt-preview.dzcdn.net.evil.test/',
    'https://cdnt-preview.dzcdn.net:8080/',
    'https://user:pass@cdnt-preview.dzcdn.net/',
    'https://api.audius.co/',
  ])
    assert.throws(() => safeRecordingAudio(url));
});
test('la búsqueda encuentra el perfil exacto aunque un tributo aparezca primero', async () => {
  const tracks = await fetchArtistRecordings('Linkin Park', async (input) => {
    const url = new URL(String(input));
    if (url.pathname === '/search/artist') {
      assert.equal(url.searchParams.get('q'), 'Linkin Park');
      assert.equal(url.searchParams.get('limit'), '100');
      return Response.json({
        data: [
          { id: 999, name: 'Linkin Park Tribute', nb_fan: 500 },
          { id: 888, name: 'Linkin Park', nb_fan: 5 },
          { id: 777, name: 'x'.repeat(151), nb_fan: 10 },
          { ...recording.artist, nb_fan: 12000000 },
        ],
      });
    }
    if (url.pathname === '/artist/92/top') return Response.json({ data: [recording] });
    assert.equal(url.pathname, '/album/81763');
    return Response.json({ release_date: '2000-10-24' });
  });
  assert.equal(tracks[0].artist.name, 'Linkin Park');
  assert.equal(tracks[0].release_date, '2000-10-24');
  await assert.rejects(
    () =>
      fetchArtistRecordings('Linkin Park', async () =>
        Response.json({ data: [{ id: 999, name: 'Linkin Park Tribute' }] }),
      ),
    /perfil original/,
  );
});
test('elige solo cinco éxitos por popularidad, sin duplicados ni canciones de otros intérpretes', async () => {
  const source = Array.from({ length: 7 }, (_, i) => ({
    ...recording,
    id: 900 + i,
    title: `Hit ${i}`,
    title_short: `Hit ${i}`,
    rank: 100 - i,
  }));
  const tracks = await fetchArtistRecordings('Linkin Park', async (input) => {
    const url = new URL(String(input));
    if (url.pathname === '/search/artist') return Response.json({ data: [recording.artist] });
    if (url.pathname === '/artist/92/top') {
      assert.equal(url.searchParams.get('limit'), '100');
      return Response.json({
        data: [
          ...[...source].reverse(),
          { ...source[0], id: 999, rank: 50 },
          { ...recording, id: 1000, rank: 1000, title_version: 'Live' },
          { ...recording, id: 1001, rank: 2000, readable: false },
          { ...recording, id: 1002, rank: 3000, artist: { id: 999, name: 'Tributo' } },
        ],
      });
    }
    return Response.json({ release_date: '2000-10-24' });
  });
  assert.deepEqual(
    tracks.map((track) => track.id),
    [900, 901, 902, 903, 904],
  );
});
test('se resuelve una muestra vigente en cada reproducción y no se aceptan pistas bloqueadas ni otros identificadores', async () => {
  let version = 0;
  const fetcher: typeof fetch = async () =>
    Response.json({ ...recording, preview: `https://cdnt-preview.dzcdn.net/${++version}.mp3` });
  const reference = 'https://api.deezer.com/track/676183';
  assert.notEqual(
    (await resolveRecordingPreview(reference, fetcher)).href,
    (await resolveRecordingPreview(reference, fetcher)).href,
  );
  await assert.rejects(
    () =>
      resolveRecordingPreview(reference, async () =>
        Response.json({ ...recording, readable: false }),
      ),
    /muestra disponible/,
  );
  await assert.rejects(
    () => resolveRecordingPreview(reference, async () => Response.json({ ...recording, id: 123 })),
    /muestra disponible/,
  );
  await assert.rejects(
    () => resolveRecordingPreview('https://evil.test/track/676183', fetcher),
    /Referencia/,
  );
  await assert.rejects(
    () => resolveRecordingPreview(reference, async () => new Response('', { status: 503 })),
    /Deezer/,
  );
});
