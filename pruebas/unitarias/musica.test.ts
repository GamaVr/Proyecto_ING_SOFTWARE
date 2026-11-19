/** Comprueba las listas de canciones, la búsqueda en Deezer, el catálogo y la seguridad del audio. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir } from 'node:fs/promises';
import { almacenarGrabaciones } from '../../servidor/servicios/musica/catalogo.js';
import {
  CARPETA_LISTAS,
  generoDeAlbum,
  leerLista,
  resolverListas,
  type ListaCanciones,
} from '../../servidor/servicios/musica/listas.js';
import {
  buscarGrabacion,
  claveTitulo,
  interpretarGrabaciones,
  resolverMuestraGrabacion,
  validarAudioGrabacion,
} from '../../servidor/servicios/musica/deezer.js';
import { GENEROS, GENEROS_RETIRADOS } from '../../compartido/musica.js';

test('las listas del proyecto son válidas y solo usan géneros del juego', async () => {
  const archivos = (await readdir(CARPETA_LISTAS)).filter((archivo) => archivo.endsWith('.json'));
  assert.ok(archivos.length > 0);
  for (const archivo of archivos) {
    const lista = await leerLista(`${CARPETA_LISTAS}/${archivo}`);
    assert.ok(lista.generosPermitidos.includes(lista.generoPredeterminado), archivo);
    for (const genero of lista.generosPermitidos) assert.ok(GENEROS.includes(genero), genero);
  }
});

test('las categorías retiradas no se pueden guardar ni asignar al importar', async () => {
  const lista: ListaCanciones = {
    nombre: 'Prueba',
    generoPredeterminado: 'Rock, Metal y Alternativa',
    generosPermitidos: ['Rock, Metal y Alternativa', 'Pop y R&B'],
    pistas: [{ titulo: 'x', artista: 'y' }],
  };
  // 153 = Blues en Deezer: no corresponde a ningún género del juego.
  assert.equal(generoDeAlbum([153], lista), 'Rock, Metal y Alternativa');
  // Rock (152), Metal (464) y Alternativo (85) de Deezer van al mismo género del juego.
  for (const id of [152, 464, 85])
    assert.equal(generoDeAlbum([id], lista), 'Rock, Metal y Alternativa');
  assert.equal(generoDeAlbum([132, 152], lista), 'Pop y R&B');
  assert.equal(generoDeAlbum([116], lista), 'Rock, Metal y Alternativa'); // Rap no está permitido en esta lista.
  for (const separado of ['Rock', 'Metal', 'Alternativa'])
    assert.equal((GENEROS as readonly string[]).includes(separado), false);
  for (const genero of GENEROS_RETIRADOS) {
    assert.equal((GENEROS as readonly string[]).includes(genero), false);
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
test('los títulos se comparan sin sufijos de edición, paréntesis, signos ni tildes', () => {
  assert.equal(claveTitulo('Bring Me To Life - Remastered 2023'), claveTitulo('Bring Me To Life'));
  assert.equal(
    claveTitulo('Burning Heart - From "Rocky IV" Soundtrack'),
    claveTitulo('Burning Heart'),
  );
  assert.equal(claveTitulo("Rollin' (Air Raid Vehicle)"), claveTitulo('Rollin'));
  assert.equal(claveTitulo('Chop Suey!'), 'chopsuey');
  assert.notEqual(claveTitulo('Numb'), claveTitulo('Numb / Encore'));
});

test('la búsqueda exige el mismo artista y título y elige la versión más popular', async () => {
  const consultarProveedor: typeof fetch = async (entrada) => {
    const url = new URL(String(entrada));
    assert.equal(url.pathname, '/search');
    assert.equal(url.searchParams.get('q'), 'Linkin Park In the End');
    return Response.json({
      data: [
        { ...grabacion, id: 1, rank: 9000, artist: { id: 999, name: 'Linkin Park Tribute' } },
        { ...grabacion, id: 2, rank: 8000, title_version: '(Live)' },
        { ...grabacion, id: 3, rank: 7000, readable: false },
        { ...grabacion, id: 4, rank: 6000, title: 'Numb', title_short: 'Numb' },
        { ...grabacion, id: 5, rank: 100 },
        { ...grabacion, id: 6, rank: 500, album: { id: 2 } },
      ],
    });
  };
  const pista = await buscarGrabacion('In the End - Remastered', 'Linkin Park', consultarProveedor);
  assert.equal(pista?.id, 6);
  assert.equal(
    await buscarGrabacion('In the End', 'Linkin Park', async () =>
      Response.json({ data: [{ ...grabacion, artist: { id: 999, name: 'Otro' } }] }),
    ),
    undefined,
  );
});

test('una lista se reparte por el género del álbum, sin repetidas, e informa lo que no existe', async () => {
  const lista: ListaCanciones = {
    nombre: 'Prueba',
    generoPredeterminado: 'Rock, Metal y Alternativa',
    generosPermitidos: ['Rock, Metal y Alternativa', 'Pop y R&B'],
    pistas: [
      { titulo: 'In the End', artista: 'Linkin Park' },
      { titulo: 'Psychosocial', artista: 'Slipknot' },
      { titulo: 'In the End', artista: 'Linkin Park' },
      { titulo: 'Inexistente', artista: 'Nadie' },
    ],
  };
  const slipknot = {
    ...grabacion,
    id: 10,
    title: 'Psychosocial',
    title_short: 'Psychosocial',
    artist: { id: 7, name: 'Slipknot' },
    album: { id: 70 },
  };
  const { porGenero, resumen } = await resolverListas([lista], async (entrada) => {
    const url = new URL(String(entrada));
    if (url.pathname === '/album/81763')
      return Response.json({ release_date: '2000-10-24', genres: { data: [{ id: 85 }] } });
    if (url.pathname === '/album/70')
      return Response.json({ release_date: '2008-06-23', genres: { data: [{ id: 132 }] } });
    const consulta = url.searchParams.get('q') ?? '';
    if (consulta.includes('Slipknot')) return Response.json({ data: [slipknot] });
    if (consulta.includes('Linkin')) return Response.json({ data: [grabacion] });
    return Response.json({ data: [] });
  });
  assert.deepEqual(resumen.porGenero, { 'Rock, Metal y Alternativa': 1, 'Pop y R&B': 1 });
  assert.equal(resumen.repetidas, 1);
  assert.deepEqual(resumen.noEncontradas, ['Nadie – Inexistente']);
  assert.equal(porGenero.get('Rock, Metal y Alternativa')?.[0].release_date, '2000-10-24');
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

test('no acepta remixes ni versiones acústicas o extendidas salvo que la lista las pida', async () => {
  const datos = {
    data: [
      { ...grabacion, id: 1, rank: 900, title: 'In the End (Royksopp Mix)' },
      { ...grabacion, id: 2, rank: 800, title: 'In the End (Acoustic Version)' },
      { ...grabacion, id: 3, rank: 100 },
    ],
  };
  const proveedor: typeof fetch = async () => Response.json(datos);
  assert.equal((await buscarGrabacion('In the End', 'Linkin Park', proveedor))?.id, 3);
  assert.equal((await buscarGrabacion('In the End - Mix', 'Linkin Park', proveedor))?.id, 1);
  assert.equal(
    await buscarGrabacion('In the End', 'Linkin Park', async () =>
      Response.json({ data: [datos.data[1]] }),
    ),
    undefined,
  );
});

test('si el álbum es una banda sonora, el género sale de los álbumes del artista', async () => {
  const lista: ListaCanciones = {
    nombre: 'Prueba',
    generoPredeterminado: 'Pop y R&B',
    generosPermitidos: ['Pop y R&B', 'Hip hop / Rap'],
    pistas: [{ titulo: 'In the End', artista: 'Linkin Park' }],
  };
  const { resumen } = await resolverListas([lista], async (entrada) => {
    const url = new URL(String(entrada));
    if (url.pathname === '/search') return Response.json({ data: [grabacion] });
    // 173 = Películas/Juegos: no corresponde a ningún género del juego.
    if (url.pathname === '/album/81763') return Response.json({ genres: { data: [{ id: 173 }] } });
    if (url.pathname === '/artist/92/top')
      return Response.json({
        data: [{ album: { id: 1 } }, { album: { id: 2 } }, { album: { id: 1 } }],
      });
    return Response.json({ genres: { data: [{ id: 116 }] } });
  });
  assert.deepEqual(resumen.porGenero, { 'Hip hop / Rap': 1 });
});
