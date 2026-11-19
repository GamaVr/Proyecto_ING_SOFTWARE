/** Verifica el catálogo y el audio de los modos de juego con MySQL. */
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import { crearAplicacion } from '../../servidor/aplicacion.js';
import { consultar, escribir, conexiones } from '../../servidor/datos/base-datos.js';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { almacenarGrabaciones } from '../../servidor/servicios/musica/catalogo.js';
import { importarListas } from '../../servidor/servicios/musica/listas.js';
import { type ConsultaMusica, type Grabacion } from '../../servidor/servicios/musica/deezer.js';
import { CONFIGURACION_PREDETERMINADA, type EstadoPartida } from '../../compartido/tipos.js';
import { GENEROS_RETIRADOS } from '../../compartido/musica.js';

let servidor: Server,
  base = '';
const usuarios: { id: string; cookie: string }[] = [],
  canciones: string[] = [],
  partidas: string[] = [],
  salas: string[] = [];
const prefijo = String(Date.now() * 100 + Math.floor(Math.random() * 100)),
  genero = `Pop QA ${prefijo}`;
let redireccionInsegura = false;
/** Simula únicamente la frontera del proveedor; permisos, selección y persistencia usan la API y MySQL reales. */
const proveedor: ConsultaMusica = async (entrada, init) => {
  const url = new URL(String(entrada));
  if (url.pathname.startsWith('/album/')) return Response.json({ release_date: '2024-01-01' });
  if (url.pathname.startsWith('/track/'))
    return Response.json({
      id: Number(url.pathname.split('/').pop()),
      readable: true,
      preview: 'https://cdnt-preview.dzcdn.net/qa.mp3',
    });
  if (redireccionInsegura)
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
async function llamar(rutaDestino: string, metodo = 'GET', cuerpo?: unknown, usuario = 0) {
  const respuestaHttp = await fetch(`${base}/api${rutaDestino}`, {
    method: metodo,
    headers: {
      cookie: usuarios[usuario]?.cookie || '',
      ...(cuerpo === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(cuerpo === undefined ? {} : { body: JSON.stringify(cuerpo) }),
  });
  return {
    estado: respuestaHttp.status,
    datos: respuestaHttp.status === 204 ? null : await respuestaHttp.json(),
  };
}
before(async () => {
  const pistas: Grabacion[] = Array.from({ length: 5 }, (_, i) => ({
    id: Number(`${prefijo}${i}`),
    title: `Canción de prueba ${i}`,
    artist: { id: 92, name: 'Linkin Park', nb_fan: 0 },
    album: { id: 999999 },
    readable: true,
    preview: 'https://cdnt-preview.dzcdn.net/qa.mp3',
    release_date: '2024-01-01',
    rank: 0,
  }));
  await almacenarGrabaciones(genero, pistas);
  canciones.push(...pistas.map((pista) => `deezer-${pista.id}`));
  await escribir(
    'INSERT INTO canciones(id,titulo,artista,alias,genero,anio_lanzamiento) VALUES (?,?,?,?,?,?)',
    [`old-${prefijo}`, 'Melodía anterior', 'Sintetizada', '[]', genero, 2024],
  );
  canciones.push(`old-${prefijo}`);
  await escribir(
    "INSERT INTO medios_cancion(cancion_id,fuente,habilitada) VALUES (?,'integrado',TRUE)",
    [`old-${prefijo}`],
  );
  // Simula datos antiguos reactivados: la selección y las opciones deben excluirlos igualmente.
  for (const [indice, eliminado] of GENEROS_RETIRADOS.entries()) {
    for (let i = 0; i < 5; i++) {
      const id = `removed-${prefijo}-${indice}-${i}`;
      await escribir(
        'INSERT INTO canciones(id,titulo,artista,alias,genero,anio_lanzamiento) VALUES (?,?,?,?,?,?)',
        [id, 'Canción retirada QA', 'Artista QA', '[]', eliminado, 2024],
      );
      canciones.push(id);
      await escribir(
        "INSERT INTO medios_cancion(cancion_id,fuente,id_externo,habilitada) VALUES (?,'deezer',?,TRUE)",
        [id, String(Number(prefijo) + 1000 + indice * 5 + i)],
      );
    }
  }
  servidor = createServer(crearAplicacion(() => {}, proveedor));
  await new Promise<void>((resolve) => servidor.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(servidor.address() as { port: number }).port}`;
  for (let i = 0; i < 4; i++) {
    const respuestaHttp = await fetch(`${base}/api/autenticacion/registro`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nombre: `Audio QA ${i}`,
        correo: `audio-${randomUUID()}@example.test`,
        contrasena: `Qa-${randomUUID()}`,
        codigoRecuperacion: '1234',
      }),
    });
    assert.equal(respuestaHttp.status, 201);
    const { usuario } = await respuestaHttp.json();
    usuarios.push({
      id: usuario.id,
      cookie: respuestaHttp.headers.get('set-cookie')!.split(';')[0],
    });
  }
});
after(async () => {
  for (const codigo of salas) await escribir('DELETE FROM salas WHERE codigo=?', [codigo]);
  for (const id of partidas) await escribir('DELETE FROM partidas WHERE id=?', [id]);
  for (const id of canciones) await escribir('DELETE FROM canciones WHERE id=?', [id]);
  for (const usuario of usuarios) await escribir('DELETE FROM usuarios WHERE id=?', [usuario.id]);
  await conexiones.end();
  await new Promise<void>((resolve) => servidor.close(() => resolve()));
});
test('las grabaciones reales se usan solo en los modos de juego', async (t) => {
  await t.test(
    'importar listas reemplaza el catálogo y reparte cada canción por el género de su álbum',
    async () => {
      const previo = await consultar<{ cancion_id: string; habilitada: number }>(
        "SELECT cancion_id,habilitada FROM medios_cancion WHERE fuente='deezer'",
      );
      const carpeta = await mkdtemp(path.join(tmpdir(), 'listas-qa-'));
      const ids = { rock: Number(prefijo) * 10 + 7, metal: Number(prefijo) * 10 + 8 };
      const creada = [`deezer-${ids.rock}`, `deezer-${ids.metal}`];
      try {
        await writeFile(
          path.join(carpeta, 'qa.json'),
          JSON.stringify({
            nombre: 'QA',
            generoPredeterminado: 'Rock, Metal y Alternativa',
            generosPermitidos: ['Rock, Metal y Alternativa', 'Pop'],
            pistas: [
              { titulo: 'Tema Rock QA - Remastered', artista: 'Banda QA' },
              { titulo: 'Tema Metal QA', artista: 'Banda QA' },
              { titulo: 'Tema Rock QA', artista: 'Banda QA' },
              { titulo: 'No Existe', artista: 'Nadie QA' },
            ],
          }),
        );
        const pista = (id: number, titulo: string, album: number) => ({
          id,
          title: titulo,
          title_short: titulo,
          artist: { id: 4242, name: 'Banda QA' },
          album: { id: album },
          readable: true,
          preview: 'https://cdnt-preview.dzcdn.net/qa.mp3',
        });
        const resumen = await importarListas(async (entrada) => {
          const url = new URL(String(entrada));
          if (url.pathname === '/album/1')
            return Response.json({ genres: { data: [{ id: 152 }] } });
          if (url.pathname === '/album/2')
            return Response.json({ genres: { data: [{ id: 132 }] } });
          const consulta = url.searchParams.get('q') ?? '';
          if (consulta.includes('Rock'))
            return Response.json({ data: [pista(ids.rock, 'Tema Rock QA', 1)] });
          if (consulta.includes('Metal'))
            return Response.json({ data: [pista(ids.metal, 'Tema Metal QA', 2)] });
          return Response.json({ data: [] });
        }, carpeta);
        assert.deepEqual(resumen.porGenero, { 'Rock, Metal y Alternativa': 1, Pop: 1 });
        assert.equal(resumen.repetidas, 1);
        assert.deepEqual(resumen.noEncontradas, ['Nadie QA – No Existe']);
        const guardadas = await consultar<{ id: string; genero: string; habilitada: number }>(
          'SELECT s.id,s.genero,m.habilitada FROM canciones s JOIN medios_cancion m ON m.cancion_id=s.id WHERE s.id IN (?,?) ORDER BY s.genero',
          creada,
        );
        assert.deepEqual(
          guardadas.map((fila) => [fila.genero, !!fila.habilitada]),
          [
            ['Pop', true],
            ['Rock, Metal y Alternativa', true],
          ],
        );
        const [restantes] = await consultar<{ cantidad: number }>(
          "SELECT COUNT(*) AS cantidad FROM medios_cancion WHERE fuente='deezer' AND habilitada=1 AND cancion_id NOT IN (?,?)",
          creada,
        );
        assert.equal(Number(restantes.cantidad), 0);
      } finally {
        await rm(carpeta, { recursive: true, force: true });
        for (const id of creada) await escribir('DELETE FROM canciones WHERE id=?', [id]);
        for (const elemento of previo)
          await escribir('UPDATE medios_cancion SET habilitada=? WHERE cancion_id=?', [
            !!elemento.habilitada,
            elemento.cancion_id,
          ]);
      }
    },
  );
  await t.test('se retiraron biblioteca, carga, configuración y vistas previas', async () => {
    for (const rutaDestino of [
      '/musica',
      '/musica/jamendo/buscar',
      '/musica/abc/audio',
      '/catalog',
    ])
      assert.equal((await llamar(rutaDestino)).estado, 404);
    assert.equal((await llamar('/musica/upload', 'POST', {})).estado, 404);
  });
  await t.test(
    'los géneros cuentan solo grabaciones reales, sin melodías sintetizadas',
    async () => {
      const resultado = await llamar('/musica/opciones');
      assert.equal(resultado.estado, 200);
      assert.equal(
        resultado.datos.generos.find((elemento: { nombre: string }) => elemento.nombre === genero)
          .cantidad,
        5,
      );
    },
  );
  await t.test(
    'Blues, Jazz y Country no aparecen ni se pueden seleccionar aunque existan pistas activas antiguas',
    async () => {
      const opciones = await llamar('/musica/opciones');
      for (const eliminado of GENEROS_RETIRADOS) {
        assert.equal(
          opciones.datos.generos.some(
            (elemento: { nombre: string }) => elemento.nombre === eliminado,
          ),
          false,
        );
        assert.equal(
          (
            await llamar('/partidas', 'POST', {
              ...CONFIGURACION_PREDETERMINADA,
              genero: eliminado,
              rondas: 5,
            })
          ).estado,
          422,
        );
      }
      const mezclado = await llamar('/partidas', 'POST', {
        ...CONFIGURACION_PREDETERMINADA,
        rondas: 5,
      });
      assert.equal(mezclado.estado, 201);
      partidas.push(mezclado.datos.id);
      const [elegido] = await consultar<{ cantidad: number }>(
        'SELECT COUNT(*) AS cantidad FROM partidas g JOIN canciones s ON JSON_CONTAINS(g.canciones_ids,JSON_QUOTE(s.id)) WHERE g.id=? AND s.genero IN (?,?,?)',
        [mezclado.datos.id, ...GENEROS_RETIRADOS],
      );
      assert.equal(Number(elegido.cantidad), 0);
    },
  );
  await t.test('individual, duelo y equipos seleccionan grabaciones según el género', async () => {
    for (const modo of ['individual', 'duelo', 'equipos'] as const) {
      let partida: EstadoPartida;
      if (modo === 'individual') {
        const resultado = await llamar('/partidas', 'POST', {
          ...CONFIGURACION_PREDETERMINADA,
          genero,
          rondas: 5,
        });
        assert.equal(resultado.estado, 201);
        partida = resultado.datos;
      } else {
        const creada = await llamar('/salas', 'POST', {
          nombre: 'Audio real QA',
          modo,
          configuracion: { ...CONFIGURACION_PREDETERMINADA, genero, rondas: 5 },
        });
        assert.equal(creada.estado, 201);
        const codigo = creada.datos.codigo;
        salas.push(codigo);
        const capacidad = modo === 'duelo' ? 2 : 4;
        for (let i = 0; i < capacidad; i++) {
          if (i) assert.equal((await llamar('/salas/unirse', 'POST', { codigo }, i)).estado, 200);
          assert.equal(
            (await llamar(`/salas/${codigo}/jugador`, 'PATCH', { accion: 'listo', listo: true }, i))
              .estado,
            200,
          );
        }
        const iniciada = await llamar(`/salas/${codigo}/iniciar`, 'POST');
        assert.equal(iniciada.estado, 200);
        partida = (await llamar(`/partidas/${iniciada.datos.partidaId}`)).datos;
      }
      partidas.push(partida.id);
      assert.equal(partida.fuenteAudio, 'deezer');
      assert.equal(partida.inicioAudio, 0);
      assert.equal(partida.duracionAudio, 12);
      assert.equal(partida.configuracion.genero, genero);
      assert.deepEqual(partida.resultados, []);
      const [almacenado] = await consultar<{ canciones_ids: string[] }>(
        'SELECT canciones_ids FROM partidas WHERE id=?',
        [partida.id],
      );
      assert.ok(almacenado.canciones_ids.every((id) => id.startsWith(`deezer-${prefijo}`)));
      const audio = await fetch(`${base}/api/partidas/${partida.id}/audio`, {
        headers: { cookie: usuarios[0].cookie, Range: 'bytes=0-63' },
      });
      assert.equal(audio.status, 206);
      assert.equal(audio.headers.get('Content-Type'), 'audio/mpeg');
      assert.equal((await audio.arrayBuffer()).byteLength, 64);
    }
  });
  await t.test('el audio mantiene permisos y rechaza redirecciones inseguras', async () => {
    const denegado = await fetch(`${base}/api/partidas/${partidas[0]}/audio`, {
      headers: { cookie: usuarios[1].cookie },
    });
    assert.equal(denegado.status, 403);
    redireccionInsegura = true;
    const bloqueado = await fetch(`${base}/api/partidas/${partidas[0]}/audio`, {
      headers: { cookie: usuarios[0].cookie },
    });
    assert.equal(bloqueado.status, 502);
    redireccionInsegura = false;
  });
});
