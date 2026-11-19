/** Comprueba perfiles, popularidad, catálogo y seguridad del audio. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  RECORDING_GENRES,
  almacenarGrabaciones,
  ARTISTS_PER_GENRE,
  TRACKS_PER_ARTIST,
} from '../../servidor/servicios/musica/catalogo.js';
import { resolverMuestraGrabacion } from '../../servidor/servicios/musica/deezer.js';
import {
  interpretarGrabaciones,
  validarAudioGrabacion,
  obtenerGrabacionesArtista,
} from '../../servidor/servicios/musica/deezer.js';
import { GENEROS_RETIRADOS } from '../../compartido/musica.js';

test('cada uno de los nueve géneros tiene 35 artistas principales distintos y cinco canciones por artista', () => {
  assert.equal(RECORDING_GENRES.length, 9);
  assert.equal(ARTISTS_PER_GENRE, 35);
  assert.equal(TRACKS_PER_ARTIST, 5);
  const todos = new Set<string>();
  for (const genero of RECORDING_GENRES) {
    assert.equal(genero.artistas.length, 35, genero.nombre);
    for (const nombre of genero.artistas) {
      const clave = nombre.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
      assert.equal(todos.has(clave), false, `Artista repetido: ${nombre}`);
      todos.add(clave);
    }
  }
  assert.equal(todos.size, 315);
});

test('las categorías retiradas no se sincronizan ni se pueden reactivar al importar', async () => {
  for (const genero of GENEROS_RETIRADOS) {
    assert.equal(
      RECORDING_GENRES.some((elemento) => elemento.nombre === genero),
      false,
    );
    await assert.rejects(
      () => almacenarGrabaciones(genero.toLowerCase(), []),
      /categoría fue retirada/,
    );
  }
});

const grabacion = {
  id: 676183,
  title: 'In the End',
  title_short: 'In the End',
  artist: { id: 92, name: 'Linkin Park' },
  album: { id: 81763 },
  readable: true,
  preview: 'https://cdnt-preview.dzcdn.net/api/1/1/sample.mp3',
};
test('el catálogo exige artista original, muestra pública y canciones únicas', () => {
  const pistas = interpretarGrabaciones(
    {
      data: [
        grabacion,
        grabacion,
        { ...grabacion, id: 2, readable: false },
        { ...grabacion, id: 3, preview: '' },
        { ...grabacion, id: 4, artist: { id: 999, name: 'Linkin Park Tribute' } },
        { ...grabacion, id: 5, title_version: '(Live)' },
        { ...grabacion, id: 6, preview: 'https://127.0.0.1/private' },
      ],
    },
    92,
  );
  assert.deepEqual(
    pistas.map((elemento) => elemento.id),
    [676183],
  );
  assert.throws(() => interpretarGrabaciones({ unexpected: [] }));
});
test('solo se aceptan HTTPS y CDN oficiales en todas las redirecciones', () => {
  assert.equal(validarAudioGrabacion(grabacion.preview).protocol, 'https:');
  for (const url of [
    'http://cdnt-preview.dzcdn.net/',
    'https://127.0.0.1/',
    'https://cdnt-preview.dzcdn.net.evil.test/',
    'https://cdnt-preview.dzcdn.net:8080/',
    'https://user:pass@cdnt-preview.dzcdn.net/',
    'https://api.audius.co/',
  ])
    assert.throws(() => validarAudioGrabacion(url));
});
test('la búsqueda encuentra el perfil exacto aunque un tributo aparezca primero', async () => {
  const pistas = await obtenerGrabacionesArtista('Linkin Park', async (entrada) => {
    const url = new URL(String(entrada));
    if (url.pathname === '/search/artist') {
      assert.equal(url.searchParams.get('q'), 'Linkin Park');
      assert.equal(url.searchParams.get('limit'), '100');
      return Response.json({
        data: [
          { id: 999, name: 'Linkin Park Tribute', nb_fan: 500 },
          { id: 888, name: 'Linkin Park', nb_fan: 5 },
          { id: 777, name: 'x'.repeat(151), nb_fan: 10 },
          { ...grabacion.artist, nb_fan: 12000000 },
        ],
      });
    }
    if (url.pathname === '/artist/92/top') return Response.json({ data: [grabacion] });
    assert.equal(url.pathname, '/album/81763');
    return Response.json({ release_date: '2000-10-24' });
  });
  assert.equal(pistas[0].artist.name, 'Linkin Park');
  assert.equal(pistas[0].release_date, '2000-10-24');
  await assert.rejects(
    () =>
      obtenerGrabacionesArtista('Linkin Park', async () =>
        Response.json({ data: [{ id: 999, name: 'Linkin Park Tribute' }] }),
      ),
    /perfil original/,
  );
});
test('elige solo cinco éxitos por popularidad, sin duplicados ni canciones de otros intérpretes', async () => {
  const fuente = Array.from({ length: 7 }, (_, i) => ({
    ...grabacion,
    id: 900 + i,
    title: `Hit ${i}`,
    title_short: `Hit ${i}`,
    rank: 100 - i,
  }));
  const pistas = await obtenerGrabacionesArtista('Linkin Park', async (entrada) => {
    const url = new URL(String(entrada));
    if (url.pathname === '/search/artist') return Response.json({ data: [grabacion.artist] });
    if (url.pathname === '/artist/92/top') {
      assert.equal(url.searchParams.get('limit'), '100');
      return Response.json({
        data: [
          ...[...fuente].reverse(),
          { ...fuente[0], id: 999, rank: 50 },
          { ...grabacion, id: 1000, rank: 1000, title_version: 'Live' },
          { ...grabacion, id: 1001, rank: 2000, readable: false },
          { ...grabacion, id: 1002, rank: 3000, artist: { id: 999, name: 'Tributo' } },
        ],
      });
    }
    return Response.json({ release_date: '2000-10-24' });
  });
  assert.deepEqual(
    pistas.map((pista) => pista.id),
    [900, 901, 902, 903, 904],
  );
});
test('se resuelve una muestra vigente en cada reproducción y no se aceptan pistas bloqueadas ni otros identificadores', async () => {
  let version = 0;
  const consultarProveedor: typeof fetch = async () =>
    Response.json({ ...grabacion, preview: `https://cdnt-preview.dzcdn.net/${++version}.mp3` });
  const referencia = 'https://api.deezer.com/track/676183';
  assert.notEqual(
    (await resolverMuestraGrabacion(referencia, consultarProveedor)).href,
    (await resolverMuestraGrabacion(referencia, consultarProveedor)).href,
  );
  await assert.rejects(
    () =>
      resolverMuestraGrabacion(referencia, async () =>
        Response.json({ ...grabacion, readable: false }),
      ),
    /muestra disponible/,
  );
  await assert.rejects(
    () =>
      resolverMuestraGrabacion(referencia, async () => Response.json({ ...grabacion, id: 123 })),
    /muestra disponible/,
  );
  await assert.rejects(
    () => resolverMuestraGrabacion('https://evil.test/track/676183', consultarProveedor),
    /Referencia/,
  );
  await assert.rejects(
    () => resolverMuestraGrabacion(referencia, async () => new Response('', { status: 503 })),
    /Deezer/,
  );
});
