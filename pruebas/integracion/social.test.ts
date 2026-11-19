import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import { crearAplicacion } from '../../servidor/aplicacion.js';
import { consultar, escribir, conexiones } from '../../servidor/datos/base-datos.js';
import {
  CONFIGURACION_PREDETERMINADA,
  type EstadoSala,
  type EstadoSocial,
  type Usuario,
  type ResultadoBusquedaUsuario,
} from '../../compartido/tipos.js';

let servidor: Server,
  base = '';
const usuarios: { usuario: Usuario; cookie: string }[] = [],
  salas: string[] = [];

/** Llama a la API de prueba con la cookie de la cuenta elegida. */
async function llamar<T>(
  ruta: string,
  metodo = 'GET',
  cuerpo?: unknown,
  cuenta = 0,
): Promise<{ estado: number; datos: T }> {
  const respuestaHttp = await fetch(`${base}/api${ruta}`, {
    method: metodo,
    headers: {
      ...(cuerpo !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(usuarios[cuenta] ? { cookie: usuarios[cuenta].cookie } : {}),
    },
    ...(cuerpo !== undefined ? { body: JSON.stringify(cuerpo) } : {}),
  });
  return {
    estado: respuestaHttp.status,
    datos: respuestaHttp.status === 204 ? (undefined as T) : ((await respuestaHttp.json()) as T),
  };
}

/** Crea una amistad aceptada entre dos cuentas de prueba. */
async function conectar(desde: number, hacia: number): Promise<void> {
  assert.equal(
    (await llamar('/amigos', 'POST', { usuarioId: usuarios[hacia].usuario.id }, desde)).estado,
    201,
  );
  assert.equal(
    (await llamar(`/amigos/${usuarios[desde].usuario.id}/aceptar`, 'POST', undefined, hacia))
      .estado,
    200,
  );
}

/** Crea una sala aislada y registra su código para retirarla al terminar. */
async function sala(modo: 'duelo' | 'equipos'): Promise<EstadoSala> {
  const resultado = await llamar<EstadoSala>('/salas', 'POST', {
    nombre: 'Social QA',
    modo,
    configuracion: { ...CONFIGURACION_PREDETERMINADA, rondas: 5 },
  });
  assert.equal(resultado.estado, 201);
  salas.push(resultado.datos.codigo);
  return resultado.datos;
}

/** Envía una invitación desde el anfitrión a un amigo y devuelve el buzón de este último. */
async function invitar(codigo: string, destinatario: number): Promise<EstadoSocial> {
  assert.equal(
    (
      await llamar(`/salas/${codigo}/invitaciones`, 'POST', {
        usuarioId: usuarios[destinatario].usuario.id,
      })
    ).estado,
    201,
  );
  return (await llamar<EstadoSocial>('/social', 'GET', undefined, destinatario)).datos;
}

before(async () => {
  servidor = createServer(crearAplicacion());
  await new Promise<void>((resolve) => servidor.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(servidor.address() as { port: number }).port}`;
  for (let i = 0; i < 6; i++) {
    const respuestaHttp = await fetch(`${base}/api/autenticacion/registro`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nombre: `Social QA ${i}`,
        correo: `social-${randomUUID()}@example.test`,
        contrasena: `Prueba-${randomUUID()}`,
        codigoRecuperacion: '1234',
      }),
    });
    assert.equal(respuestaHttp.status, 201);
    const resultado = (await respuestaHttp.json()) as { usuario: Usuario };
    usuarios.push({
      usuario: resultado.usuario,
      cookie: respuestaHttp.headers.get('set-cookie')!.split(';')[0],
    });
  }
});
after(async () => {
  for (const codigo of salas) await escribir('DELETE FROM salas WHERE codigo=?', [codigo]);
  for (const { usuario } of usuarios)
    await escribir('DELETE FROM usuarios WHERE id=?', [usuario.id]);
  await conexiones.end();
  await new Promise<void>((resolve) => servidor.close(() => resolve()));
});

test('amigos e invitaciones usan MySQL y respetan destinatarios y capacidad', async (t) => {
  await t.test('la búsqueda limita datos públicos y escapa comodines', async () => {
    const resultado = await llamar<{ usuarios: ResultadoBusquedaUsuario[] }>(
      `/usuarios/buscar?q=${encodeURIComponent(usuarios[1].usuario.correo)}`,
    );
    assert.equal(resultado.estado, 200);
    assert.equal(resultado.datos.usuarios[0].id, usuarios[1].usuario.id);
    assert.ok(
      resultado.datos.usuarios.every(
        (usuario) => !('email' in usuario) && usuario.id !== usuarios[0].usuario.id,
      ),
    );
    assert.equal((await llamar('/usuarios/buscar?q=x')).estado, 422);
    assert.deepEqual(
      (await llamar<{ usuarios: ResultadoBusquedaUsuario[] }>('/usuarios/buscar?q=__')).datos
        .usuarios,
      [],
    );
  });
  await t.test('una solicitud no puede aceptarse desde la cuenta que la envió', async () => {
    assert.equal(
      (await llamar('/amigos', 'POST', { usuarioId: usuarios[0].usuario.id })).estado,
      422,
    );
    assert.equal((await llamar('/amigos', 'POST', { usuarioId: randomUUID() })).estado, 404);
    assert.equal(
      (await llamar('/amigos', 'POST', { usuarioId: usuarios[1].usuario.id })).estado,
      201,
    );
    assert.equal(
      (await llamar('/amigos', 'POST', { usuarioId: usuarios[1].usuario.id })).estado,
      409,
    );
    assert.equal((await llamar(`/amigos/${usuarios[1].usuario.id}/aceptar`, 'POST')).estado, 403);
    assert.equal(
      (await llamar(`/amigos/${usuarios[0].usuario.id}/aceptar`, 'POST', undefined, 5)).estado,
      404,
    );
    assert.equal(
      (await llamar<EstadoSocial>('/social', 'GET', undefined, 1)).datos.solicitudesRecibidas[0].id,
      usuarios[0].usuario.id,
    );
    assert.equal(
      (await llamar(`/amigos/${usuarios[0].usuario.id}/aceptar`, 'POST', undefined, 1)).estado,
      200,
    );
    assert.equal(
      (await llamar<EstadoSocial>('/social')).datos.amigos[0].id,
      usuarios[1].usuario.id,
    );
    for (const i of [2, 3, 4]) await conectar(0, i);
    assert.equal((await llamar<EstadoSocial>('/social')).datos.amigos.length, 4);
  });
  await t.test(
    'solo amigos e integrantes pueden enviar invitaciones; duplicados y caducidad se validan',
    async () => {
      const creada = await sala('duelo');
      assert.equal(
        (
          await llamar(`/salas/${creada.codigo}/invitaciones`, 'POST', {
            usuarioId: usuarios[5].usuario.id,
          })
        ).estado,
        403,
      );
      assert.equal(
        (
          await llamar(
            `/salas/${creada.codigo}/invitaciones`,
            'POST',
            { usuarioId: usuarios[0].usuario.id },
            2,
          )
        ).estado,
        403,
      );
      const recibido = await invitar(creada.codigo, 1),
        idAnterior = recibido.invitaciones[0].id;
      assert.equal(recibido.invitaciones[0].modo, 'duelo');
      assert.equal(
        (
          await llamar(`/salas/${creada.codigo}/invitaciones`, 'POST', {
            usuarioId: usuarios[1].usuario.id,
          })
        ).estado,
        409,
      );
      assert.equal(
        (await llamar<EstadoSocial>('/social', 'GET', undefined, 2)).datos.invitaciones.length,
        0,
      );
      assert.equal(
        (await llamar(`/invitaciones/${idAnterior}/responder`, 'POST', { aceptar: true }, 2))
          .estado,
        404,
      );
      await escribir('UPDATE invitaciones_sala SET expira_en=? WHERE id=?', [
        Date.now() - 1,
        idAnterior,
      ]);
      assert.equal(
        (await llamar<EstadoSocial>('/social', 'GET', undefined, 1)).datos.invitaciones.length,
        0,
      );
      assert.equal(
        (await llamar(`/invitaciones/${idAnterior}/responder`, 'POST', { aceptar: true }, 1))
          .estado,
        409,
      );
      const renovado = await invitar(creada.codigo, 1),
        id = renovado.invitaciones[0].id;
      assert.notEqual(id, idAnterior);
      assert.equal(
        (await llamar(`/invitaciones/${id}/responder`, 'POST', { aceptar: true }, 1)).estado,
        200,
      );
      assert.equal(
        (await llamar(`/invitaciones/${id}/responder`, 'POST', { aceptar: true }, 1)).estado,
        409,
      );
      const estadoActual = (await llamar<EstadoSala>(`/salas/${creada.codigo}`)).datos;
      assert.equal(estadoActual.jugadores.length, 2);
      assert.equal(estadoActual.partidaId, null);
      assert.ok(estadoActual.jugadores.every((jugador) => !jugador.listo));
      assert.equal(
        (
          await llamar(`/salas/${creada.codigo}/invitaciones`, 'POST', {
            usuarioId: usuarios[2].usuario.id,
          })
        ).estado,
        409,
      );
      assert.equal(
        (await llamar('/salas/unirse', 'POST', { codigo: creada.codigo }, 2)).estado,
        409,
      );
    },
  );
  await t.test('aceptaciones simultáneas no superan los cuatro lugares de equipos', async () => {
    const creada = await sala('equipos'),
      invitaciones: { id: string; cuenta: number }[] = [];
    for (const cuenta of [1, 2, 3, 4]) {
      const bandeja = await invitar(creada.codigo, cuenta);
      invitaciones.push({
        id: bandeja.invitaciones.find((elemento) => elemento.codigoSala === creada.codigo)!.id,
        cuenta,
      });
    }
    const resultados = await Promise.all(
      invitaciones.map((elemento) =>
        llamar(
          `/invitaciones/${elemento.id}/responder`,
          'POST',
          { aceptar: true },
          elemento.cuenta,
        ),
      ),
    );
    assert.equal(resultados.filter((resultado) => resultado.estado === 200).length, 3);
    assert.equal(resultados.filter((resultado) => resultado.estado === 409).length, 1);
    const estadoActual = (await llamar<EstadoSala>(`/salas/${creada.codigo}`)).datos;
    assert.equal(estadoActual.jugadores.length, 4);
    assert.equal(estadoActual.jugadores.filter((jugador) => jugador.equipo === 0).length, 2);
    assert.equal(estadoActual.partidaId, null);
    const perdedor = invitaciones[resultados.findIndex((resultado) => resultado.estado === 409)];
    assert.equal(
      (
        await llamar(
          `/invitaciones/${perdedor.id}/responder`,
          'POST',
          { aceptar: false },
          perdedor.cuenta,
        )
      ).estado,
      200,
    );
  });
  await t.test(
    'rechazar, retirar amistad y cancelar solicitudes invalidan sus acciones pendientes',
    async () => {
      const creada = await sala('equipos');
      let bandeja = await invitar(creada.codigo, 4),
        id = bandeja.invitaciones.find((elemento) => elemento.codigoSala === creada.codigo)!.id;
      assert.equal(
        (await llamar(`/invitaciones/${id}/responder`, 'POST', { aceptar: false }, 4)).estado,
        200,
      );
      bandeja = await invitar(creada.codigo, 4);
      id = bandeja.invitaciones.find((elemento) => elemento.codigoSala === creada.codigo)!.id;
      await llamar(`/amigos/${usuarios[4].usuario.id}`, 'DELETE', undefined, 1);
      assert.ok(
        (await llamar<EstadoSocial>('/social')).datos.amigos.some(
          (amigo) => amigo.id === usuarios[4].usuario.id,
        ),
      );
      assert.equal((await llamar(`/amigos/${usuarios[4].usuario.id}`, 'DELETE')).estado, 204);
      assert.ok(
        !(await llamar<EstadoSocial>('/social', 'GET', undefined, 4)).datos.invitaciones.some(
          (elemento) => elemento.id === id,
        ),
      );
      assert.equal(
        (await llamar(`/invitaciones/${id}/responder`, 'POST', { aceptar: true }, 4)).estado,
        409,
      );
      await llamar('/amigos', 'POST', { usuarioId: usuarios[1].usuario.id }, 5);
      assert.equal(
        (await llamar(`/amigos/${usuarios[5].usuario.id}`, 'DELETE', undefined, 1)).estado,
        204,
      );
      assert.equal(
        (await llamar(`/amigos/${usuarios[5].usuario.id}/aceptar`, 'POST', undefined, 1)).estado,
        404,
      );
      await llamar('/amigos', 'POST', { usuarioId: usuarios[4].usuario.id }, 5);
      await llamar('/amigos', 'POST', { usuarioId: usuarios[5].usuario.id }, 4);
      assert.ok(
        (await llamar<EstadoSocial>('/social', 'GET', undefined, 5)).datos.amigos.some(
          (amigo) => amigo.id === usuarios[4].usuario.id,
        ),
      );
    },
  );
  await t.test(
    'los datos retirados no forman parte de la respuesta ni del esquema activo',
    async () => {
      assert.deepEqual(
        Object.keys(
          (await llamar<{ estadisticas: unknown }>('/perfil')).datos.estadisticas as object,
        ).sort(),
        ['jugadas', 'mejorPuntuacion', 'mejorRacha'],
      );
      const tablas = await consultar<{ TABLE_NAME: string }>(
        "SELECT TABLE_NAME FROM information_schema.tables WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN ('player_ratings','matchmaking_queue','matchmaking_mutex')",
      );
      assert.equal(tablas.length, 0);
    },
  );
});
