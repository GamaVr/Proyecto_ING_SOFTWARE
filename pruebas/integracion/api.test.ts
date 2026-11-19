import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import { crearAplicacion } from '../../servidor/aplicacion.js';
import { conexiones, consultar, escribir } from '../../servidor/datos/base-datos.js';
import { avanzarPartida } from '../../servidor/servicios/partidas.js';
import {
  CONFIGURACION_PREDETERMINADA,
  PREFERENCIAS_PREDETERMINADAS,
  type EstadoPartida,
  type EstadoSala,
  type Usuario,
} from '../../compartido/tipos.js';

let servidor: Server,
  base = '';
const usuarios: { usuario: Usuario; cookie: string; contrasena: string }[] = [],
  partidas: string[] = [],
  salas: string[] = [];
/** Envía una solicitud HTTP a la API de pruebas con su conexión MySQL real. */
async function solicitar<T>(
  rutaDestino: string,
  metodo = 'GET',
  cuerpo?: unknown,
  cookie = '',
): Promise<{ estado: number; datos: T; cookie: string }> {
  const respuestaHttp = await fetch(`${base}/api${rutaDestino}`, {
    method: metodo,
    headers: {
      ...(cuerpo !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(cookie ? { cookie } : {}),
    },
    ...(cuerpo !== undefined ? { body: JSON.stringify(cuerpo) } : {}),
  });
  return {
    estado: respuestaHttp.status,
    datos: respuestaHttp.status === 204 ? (undefined as T) : ((await respuestaHttp.json()) as T),
    cookie: respuestaHttp.headers.get('set-cookie') || '',
  };
}
before(async () => {
  servidor = createServer(crearAplicacion());
  await new Promise<void>((resolve) => servidor.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(servidor.address() as { port: number }).port}`;
});
after(async () => {
  // Solo elimina los UUID y códigos creados por esta ejecución.
  for (const codigo of salas) await escribir('DELETE FROM salas WHERE codigo=?', [codigo]);
  for (const id of partidas) await escribir('DELETE FROM partidas WHERE id=?', [id]);
  for (const elemento of usuarios)
    await escribir('DELETE FROM usuarios WHERE id=?', [elemento.usuario.id]);
  await conexiones.end();
  await new Promise<void>((resolve) => servidor.close(() => resolve()));
});
test('API y MySQL: identidad, puntuación, aislamiento y salas de cuatro personas', async (t) => {
  await t.test('usa MySQL oficial y exige sesión', async () => {
    const salud = await solicitar<{ version: string }>('/estado');
    assert.equal(salud.estado, 200);
    assert.match(salud.datos.version, /^8\./);
    assert.doesNotMatch(salud.datos.version, /MariaDB/);
    assert.equal((await solicitar('/perfil')).estado, 401);
    assert.equal(
      (
        await solicitar('/autenticacion/registro', 'POST', {
          nombre: 'A',
          correo: 'bad',
          contrasena: '123',
        })
      ).estado,
      422,
    );
    for (let i = 0; i < 4; i++) {
      const correo = `qa-${randomUUID()}@example.test`,
        contrasena = `Prueba-${randomUUID()}`;
      const resultado = await solicitar<{ usuario: Usuario }>('/autenticacion/registro', 'POST', {
        nombre: `QA ${i + 1}`,
        correo,
        contrasena,
        codigoRecuperacion: '1234',
      });
      assert.equal(resultado.estado, 201);
      assert.match(resultado.cookie, /HttpOnly/);
      assert.match(resultado.cookie, /SameSite=Lax/);
      usuarios.push({
        usuario: resultado.datos.usuario,
        cookie: resultado.cookie.split(';')[0],
        contrasena,
      });
    }
    assert.equal(
      (
        await solicitar('/autenticacion/registro', 'POST', {
          ...usuarios[0].usuario,
          contrasena: usuarios[0].contrasena,
          codigoRecuperacion: '1234',
        })
      ).estado,
      409,
    );
    assert.equal(
      (
        await solicitar('/autenticacion/iniciar-sesion', 'POST', {
          correo: usuarios[0].usuario.correo,
          contrasena: 'incorrecta',
        })
      ).estado,
      401,
    );
    assert.equal(
      (
        await solicitar('/autenticacion/iniciar-sesion', 'POST', {
          correo: usuarios[0].usuario.correo,
          contrasena: usuarios[0].contrasena,
          recordar: true,
        })
      ).estado,
      200,
    );
  });
  await t.test('guarda preferencias y rechaza orígenes externos', async () => {
    const preferencias = { ...PREFERENCIAS_PREDETERMINADAS, volumen: 41, interfazGrande: true };
    assert.equal(
      (await solicitar('/preferencias', 'PUT', preferencias, usuarios[0].cookie)).estado,
      200,
    );
    assert.deepEqual(
      (
        await solicitar<{ preferencias: unknown }>(
          '/preferencias',
          'GET',
          undefined,
          usuarios[0].cookie,
        )
      ).datos.preferencias,
      preferencias,
    );
    assert.equal(
      (
        await solicitar(
          '/preferencias',
          'PUT',
          { ...preferencias, volumen: 200 },
          usuarios[0].cookie,
        )
      ).estado,
      422,
    );
    const respuestaHttp = await fetch(`${base}/api/preferencias`, {
      method: 'PUT',
      headers: {
        Origin: 'https://untrusted.example',
        'Content-Type': 'application/json',
        cookie: usuarios[0].cookie,
      },
      body: JSON.stringify(preferencias),
    });
    assert.equal(respuestaHttp.status, 403);
  });
  await t.test(
    'mantiene respuestas privadas y evita puntuar dos veces y saltar rondas',
    async () => {
      const resultado = await solicitar<EstadoPartida>(
        '/partidas',
        'POST',
        { ...CONFIGURACION_PREDETERMINADA, rondas: 5 },
        usuarios[0].cookie,
      );
      assert.equal(resultado.estado, 201);
      const partida = resultado.datos;
      partidas.push(partida.id);
      assert.equal('song_ids' in partida, false);
      assert.equal(partida.resultados.length, 0);
      assert.equal(
        (await solicitar(`/partidas/${partida.id}`, 'GET', undefined, usuarios[1].cookie)).estado,
        403,
      );
      assert.equal(
        (await solicitar(`/partidas/${partida.id}/audio`, 'GET', undefined, usuarios[1].cookie))
          .estado,
        403,
      );
      assert.equal(
        (
          await solicitar(
            `/partidas/${partida.id}/siguiente`,
            'POST',
            { ronda: 0 },
            usuarios[0].cookie,
          )
        ).estado,
        409,
      );
      for (let ronda = 0; ronda < 5; ronda++) {
        await escribir('UPDATE partidas SET ronda_iniciada_en=? WHERE id=?', [
          Date.now() - 100,
          partida.id,
        ]);
        const [cancion] = await consultar<{ titulo: string }>(
          'SELECT s.titulo FROM partidas g JOIN canciones s ON s.id=JSON_UNQUOTE(JSON_EXTRACT(g.canciones_ids,?)) WHERE g.id=?',
          [`$[${ronda}]`, partida.id],
        );
        const respuesta = await solicitar<EstadoPartida>(
          `/partidas/${partida.id}/respuesta`,
          'POST',
          { ronda, respuesta: cancion.titulo, puntos: 9999999 },
          usuarios[0].cookie,
        );
        assert.equal(respuesta.estado, 200);
        assert.equal(respuesta.datos.resultados.at(-1)?.correcta, true);
        assert.ok(respuesta.datos.resultados.at(-1)!.puntos <= 1200);
        assert.equal(
          (
            await solicitar(
              `/partidas/${partida.id}/respuesta`,
              'POST',
              { ronda, respuesta: cancion.titulo },
              usuarios[0].cookie,
            )
          ).estado,
          409,
        );
        const avanzar = await solicitar<EstadoPartida>(
          `/partidas/${partida.id}/siguiente`,
          'POST',
          { ronda },
          usuarios[0].cookie,
        );
        assert.equal(avanzar.estado, 200);
        if (ronda < 4)
          assert.equal(
            (
              await solicitar(
                `/partidas/${partida.id}/respuesta`,
                'POST',
                { ronda, respuesta: cancion.titulo },
                usuarios[0].cookie,
              )
            ).estado,
            409,
          );
        if (ronda === 4) assert.equal(avanzar.datos.estado, 'terminada');
      }
      const yo = await solicitar<{ estadisticas: { jugadas: number; mejorRacha: number } }>(
        '/perfil',
        'GET',
        undefined,
        usuarios[0].cookie,
      );
      assert.equal(yo.datos.estadisticas.jugadas, 1);
      assert.equal(yo.datos.estadisticas.mejorRacha, 5);
    },
  );
  await t.test('sincroniza cuatro jugadores, chat, equipos y permisos del anfitrión', async () => {
    const creada = await solicitar<EstadoSala>(
      '/salas',
      'POST',
      {
        nombre: 'Sala QA',
        modo: 'equipos',
        configuracion: { ...CONFIGURACION_PREDETERMINADA, rondas: 5 },
      },
      usuarios[0].cookie,
    );
    assert.equal(creada.estado, 201);
    const codigo = creada.datos.codigo;
    salas.push(codigo);
    for (const usuario of usuarios.slice(1))
      assert.equal(
        (await solicitar('/salas/unirse', 'POST', { codigo }, usuario.cookie)).estado,
        200,
      );
    const estadoActual = await solicitar<EstadoSala>(
      `/salas/${codigo}`,
      'GET',
      undefined,
      usuarios[0].cookie,
    );
    assert.equal(estadoActual.datos.jugadores.length, 4);
    assert.equal(estadoActual.datos.jugadores.filter((p) => p.equipo === 0).length, 2);
    assert.equal(
      (await solicitar(`/salas/${codigo}/iniciar`, 'POST', undefined, usuarios[0].cookie)).estado,
      409,
    );
    assert.equal(
      (await solicitar(`/salas/${codigo}/iniciar`, 'POST', undefined, usuarios[1].cookie)).estado,
      403,
    );
    for (const usuario of usuarios)
      assert.equal(
        (
          await solicitar(
            `/salas/${codigo}/jugador`,
            'PATCH',
            { accion: 'listo', listo: true },
            usuario.cookie,
          )
        ).estado,
        200,
      );
    await solicitar(
      `/salas/${codigo}/mensajes`,
      'POST',
      { texto: 'Mensaje de prueba <b>literal</b>' },
      usuarios[0].cookie,
    );
    const chat = await solicitar<EstadoSala>(
      `/salas/${codigo}`,
      'GET',
      undefined,
      usuarios[1].cookie,
    );
    assert.equal(chat.datos.mensajes[0].texto, 'Mensaje de prueba <b>literal</b>');
    const inicio = await solicitar<{ partidaId: string }>(
      `/salas/${codigo}/iniciar`,
      'POST',
      undefined,
      usuarios[0].cookie,
    );
    assert.equal(inicio.estado, 200);
    partidas.push(inicio.datos.partidaId);
    for (const usuario of usuarios) {
      const partida = await solicitar<EstadoPartida>(
        `/partidas/${inicio.datos.partidaId}`,
        'GET',
        undefined,
        usuario.cookie,
      );
      assert.equal(partida.datos.id, inicio.datos.partidaId);
      assert.equal(partida.datos.jugadores.length, 4);
    }
    for (let ronda = 0; ronda < 5; ronda++) {
      await escribir('UPDATE partidas SET ronda_iniciada_en=? WHERE id=?', [
        // Tiempo de ronda agotado más la pausa de 2,2 s entre rondas.
        Date.now() - (CONFIGURACION_PREDETERMINADA.segundos * 1000 + 3000),
        inicio.datos.partidaId,
      ]);
      await avanzarPartida(inicio.datos.partidaId);
    }
    assert.equal(
      (
        await solicitar<EstadoPartida>(
          `/partidas/${inicio.datos.partidaId}`,
          'GET',
          undefined,
          usuarios[0].cookie,
        )
      ).datos.estado,
      'terminada',
    );
  });
  await t.test('duelo privado exige confirmación de ambos y comienzo del anfitrión', async () => {
    const creada = await solicitar<EstadoSala>(
      '/salas',
      'POST',
      {
        nombre: 'Duelo privado QA',
        modo: 'duelo',
        configuracion: { ...CONFIGURACION_PREDETERMINADA, rondas: 5 },
      },
      usuarios[0].cookie,
    );
    assert.equal(creada.estado, 201);
    const codigo = creada.datos.codigo;
    salas.push(codigo);
    const unido = await solicitar<EstadoSala>(
      '/salas/unirse',
      'POST',
      { codigo },
      usuarios[1].cookie,
    );
    assert.equal(unido.estado, 200);
    assert.equal(unido.datos.partidaId, null);
    assert.ok(unido.datos.jugadores.every((jugador) => !jugador.listo));
    assert.equal(
      (await solicitar(`/salas/${codigo}/iniciar`, 'POST', undefined, usuarios[0].cookie)).estado,
      409,
    );
    for (const usuario of usuarios.slice(0, 2))
      assert.equal(
        (
          await solicitar(
            `/salas/${codigo}/jugador`,
            'PATCH',
            { accion: 'listo', listo: true },
            usuario.cookie,
          )
        ).estado,
        200,
      );
    assert.equal(
      (await solicitar(`/salas/${codigo}/iniciar`, 'POST', undefined, usuarios[1].cookie)).estado,
      403,
    );
    const iniciada = await solicitar<{ partidaId: string }>(
      `/salas/${codigo}/iniciar`,
      'POST',
      undefined,
      usuarios[0].cookie,
    );
    assert.equal(iniciada.estado, 200);
    partidas.push(iniciada.datos.partidaId);
    for (let ronda = 0; ronda < 5; ronda++) {
      await escribir('UPDATE partidas SET ronda_iniciada_en=? WHERE id=?', [
        // Tiempo de ronda agotado más la pausa de 2,2 s entre rondas.
        Date.now() - (CONFIGURACION_PREDETERMINADA.segundos * 1000 + 3000),
        iniciada.datos.partidaId,
      ]);
      await avanzarPartida(iniciada.datos.partidaId);
    }
    const perfil = await solicitar<{ estadisticas: Record<string, number> }>(
      '/perfil',
      'GET',
      undefined,
      usuarios[0].cookie,
    );
    assert.deepEqual(Object.keys(perfil.datos.estadisticas).sort(), [
      'jugadas',
      'mejorPuntuacion',
      'mejorRacha',
    ]);
  });
  await t.test('revoca la sesión al cerrar sesión', async () => {
    assert.equal(
      (await solicitar('/autenticacion/cerrar-sesion', 'POST', undefined, usuarios[0].cookie))
        .estado,
      204,
    );
    assert.equal((await solicitar('/perfil', 'GET', undefined, usuarios[0].cookie)).estado, 401);
  });
});
