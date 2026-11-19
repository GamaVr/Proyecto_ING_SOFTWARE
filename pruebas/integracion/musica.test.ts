/** Verifica el catálogo y el audio de los modos de juego con MySQL. */
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import { crearAplicacion } from '../../servidor/aplicacion.js';
import { consultar, escribir, conexiones } from '../../servidor/datos/base-datos.js';
import {
  almacenarGrabaciones,
  asegurarGeneroGrabaciones,
  RECORDING_GENRES,
} from '../../servidor/servicios/musica/catalogo.js';
import { obtenerGrabacionesArtista } from '../../servidor/servicios/musica/deezer.js';
import { type ConsultaMusica } from '../../servidor/servicios/musica/deezer.js';
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
        id: Number(`${prefijo}${i}`),
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
  const pistas = await obtenerGrabacionesArtista('Linkin Park', proveedor);
  await almacenarGrabaciones(genero, pistas);
  canciones.push(...pistas.map((pista) => `deezer-${pista.id}`));
  await escribir(
    'INSERT INTO canciones(id,titulo,artista,alias,genero,anio_lanzamiento,archivo_audio) VALUES (?,?,?,?,?,?,?)',
    [`old-${prefijo}`, 'Melodía anterior', 'Sintetizada', '[]', genero, 2024, 'old.wav'],
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
        'INSERT INTO canciones(id,titulo,artista,alias,genero,anio_lanzamiento,archivo_audio) VALUES (?,?,?,?,?,?,?)',
        [id, 'Canción retirada QA', 'Artista QA', '[]', eliminado, 2024, 'qa.mp3'],
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
    'un fallo de disponibilidad no reemplaza el catálogo anterior y un lote completo publica 35 artistas con cinco canciones',
    async () => {
      const correspondencia = RECORDING_GENRES.find((elemento) => elemento.nombre === 'Rock')!;
      const nombres = [...correspondencia.artistas, ...correspondencia.alternativos];
      const previo = await consultar<{ cancion_id: string; habilitada: number }>(
        "SELECT m.cancion_id,m.habilitada FROM medios_cancion m JOIN canciones s ON s.id=m.cancion_id WHERE s.genero='Rock' AND m.fuente='deezer'",
      );
      const sincronizacionPrevia = await consultar<{
        genero: string;
        version: string;
        cantidad_artistas: number;
        cantidad_pistas: number;
        actualizado_en: Date;
      }>("SELECT * FROM sincronizacion_catalogo WHERE genero='Rock'");
      const creada: string[] = [];
      const proveedorCompleto: ConsultaMusica = async (entrada) => {
        const url = new URL(String(entrada));
        if (url.pathname === '/search/artist') {
          const nombre = url.searchParams.get('q')!;
          return Response.json({
            data: [
              {
                id: Number(prefijo) + 1000 + nombres.indexOf(nombre),
                name: nombre,
                nb_fan: 100000,
              },
            ],
          });
        }
        const coincidencia = /^\/artist\/(\d+)\/top$/.exec(url.pathname);
        if (coincidencia) {
          const artistaId = Number(coincidencia[1]);
          return Response.json({
            data: Array.from({ length: 7 }, (_, i) => ({
              id: artistaId * 10 + i,
              title: `Éxito ${i}`,
              title_short: `Éxito ${i}`,
              rank: 100 - i,
              artist: { id: artistaId, name: nombres[artistaId - Number(prefijo) - 1000] },
              album: { id: 55555555 },
              readable: true,
              preview: 'https://cdnt-preview.dzcdn.net/test.mp3',
            })),
          });
        }
        return Response.json({ release_date: '2024-01-01' });
      };
      const noDisponible: ConsultaMusica = async (entrada, init) => {
        const url = new URL(String(entrada)),
          nombre = url.searchParams.get('q');
        if (
          url.pathname === '/search/artist' &&
          (nombre === 'Linkin Park' || correspondencia.alternativos.includes(nombre!))
        )
          return Response.json({ data: [] });
        return proveedorCompleto(entrada, init);
      };
      try {
        await assert.rejects(
          () => asegurarGeneroGrabaciones('Rock', noDisponible, true),
          /34\/35 artistas/,
        );
        assert.deepEqual(
          await consultar(
            "SELECT m.cancion_id,m.habilitada FROM medios_cancion m JOIN canciones s ON s.id=m.cancion_id WHERE s.genero='Rock' AND m.fuente='deezer'",
          ),
          previo,
        );
        for (let i = 0; i < 35; i++)
          for (let j = 0; j < 5; j++)
            creada.push(`deezer-${(Number(prefijo) + 1000 + i) * 10 + j}`);
        await asegurarGeneroGrabaciones('Rock', proveedorCompleto, true);
        const artistas = await consultar<{ cantidad: number }>(
          "SELECT s.artista,COUNT(*) AS cantidad FROM canciones s JOIN medios_cancion m ON m.cancion_id=s.id WHERE s.genero='Rock' AND m.fuente='deezer' AND m.habilitada=1 GROUP BY s.artista",
        );
        assert.equal(artistas.length, 35);
        assert.ok(artistas.every((elemento) => Number(elemento.cantidad) === 5));
        const opciones = await llamar('/musica/opciones');
        assert.equal(
          opciones.datos.generos.find((elemento: { nombre: string }) => elemento.nombre === 'Rock')
            .artistas,
          35,
        );
        assert.equal(
          opciones.datos.generos.find((elemento: { nombre: string }) => elemento.nombre === 'Rock')
            .cantidad,
          175,
        );
        const anterior = await consultar<{ cancion_id: string; habilitada: number }>(
          `SELECT cancion_id,habilitada FROM medios_cancion WHERE cancion_id IN (${previo.map(() => '?').join(',')})`,
          previo.map((elemento) => elemento.cancion_id),
        );
        assert.equal(anterior.length, previo.length);
        assert.ok(anterior.every((elemento) => !elemento.habilitada));
      } finally {
        for (const id of creada) await escribir('DELETE FROM canciones WHERE id=?', [id]);
        for (const elemento of previo)
          await escribir('UPDATE medios_cancion SET habilitada=? WHERE cancion_id=?', [
            !!elemento.habilitada,
            elemento.cancion_id,
          ]);
        await escribir("DELETE FROM sincronizacion_catalogo WHERE genero='Rock'");
        for (const elemento of sincronizacionPrevia)
          await escribir(
            'INSERT INTO sincronizacion_catalogo(genero,version,cantidad_artistas,cantidad_pistas,actualizado_en) VALUES (?,?,?,?,?)',
            [
              elemento.genero,
              elemento.version,
              elemento.cantidad_artistas,
              elemento.cantidad_pistas,
              elemento.actualizado_en,
            ],
          );
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
