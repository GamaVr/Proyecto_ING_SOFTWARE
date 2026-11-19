/** Gestiona salas privadas, participantes, equipos y chat. */
import { randomBytes } from 'node:crypto';
import {
  consultar,
  escribir,
  transaccion,
  conexiones,
  type BaseDatos,
} from '../datos/base-datos.js';
import { ErrorHttp } from '../errores.js';
import { interpretarJson } from './puntuacion.js';
import { crearPartida } from './partidas.js';
import type { ConfiguracionPartida, EstadoSala, Jugador } from '../../compartido/tipos.js';

interface FilaSala {
  codigo: string;
  nombre: string;
  modo: 'duelo' | 'equipos';
  anfitrion_id: string;
  configuracion: ConfiguracionPartida | string;
  partida_id: string | null;
}

/** Recupera una sala por su código y opcionalmente bloquea cambios simultáneos. */
async function cargarSala(
  codigo: string,
  bd: BaseDatos = conexiones,
  bloquear = false,
): Promise<FilaSala> {
  const [sala] = await consultar<FilaSala>(
    `SELECT * FROM salas WHERE codigo=?${bloquear ? ' FOR UPDATE' : ''}`,
    [codigo],
    bd,
  );
  if (!sala) throw new ErrorHttp(404, 'Ese código no corresponde a una sala.');
  return sala;
}

/** Devuelve los miembros reales y sus equipos sin inventar rivales ni estados de conexión. */
async function cargarJugadores(codigo: string, bd: BaseDatos = conexiones): Promise<Jugador[]> {
  const jugadores = await consultar<Jugador>(
    'SELECT u.id,u.nombre,rp.equipo,rp.listo,0 AS puntuacion FROM jugadores_sala rp JOIN usuarios u ON u.id=rp.usuario_id WHERE rp.sala_codigo=? ORDER BY rp.equipo,u.nombre',
    [codigo],
    bd,
  );
  return jugadores.map((jugador) => ({ ...jugador, listo: !!jugador.listo }));
}

/** Devuelve la sala y los últimos 50 mensajes únicamente a sus miembros. */
export async function obtenerSala(codigo: string, usuarioId: string): Promise<EstadoSala> {
  const sala = await cargarSala(codigo),
    jugadores = await cargarJugadores(codigo);
  if (!jugadores.some((jugador) => jugador.id === usuarioId))
    throw new ErrorHttp(403, 'Primero entra a esta sala.');
  const mensajes = await consultar<{ id: number; nombre: string; texto: string }>(
    'SELECT m.id,u.nombre,m.mensaje AS texto FROM mensajes_sala m JOIN usuarios u ON u.id=m.usuario_id WHERE sala_codigo=? ORDER BY m.id DESC LIMIT 50',
    [codigo],
  );
  return {
    codigo,
    nombre: sala.nombre,
    modo: sala.modo,
    anfitrionId: sala.anfitrion_id,
    jugadores,
    configuracion: interpretarJson(sala.configuracion),
    partidaId: sala.partida_id,
    mensajes: mensajes.reverse(),
  };
}

/** Crea una sala con un código aleatorio no predecible y registra al anfitrión. */
export async function crearSala(
  usuarioId: string,
  nombre: string,
  modo: 'duelo' | 'equipos',
  configuracion: ConfiguracionPartida,
): Promise<string> {
  return transaccion(async (bd) => {
    const codigo = randomBytes(3).toString('hex').toUpperCase();
    await escribir(
      'INSERT INTO salas(codigo,nombre,modo,anfitrion_id,configuracion) VALUES (?,?,?,?,?)',
      [codigo, nombre, modo, usuarioId, JSON.stringify(configuracion)],
      bd,
    );
    await escribir(
      'INSERT INTO jugadores_sala(sala_codigo,usuario_id,equipo,listo) VALUES (?,?,0,FALSE)',
      [codigo, usuarioId],
      bd,
    );
    return codigo;
  });
}

/** Añade un jugador bajo bloqueo para evitar exceder los dos o cuatro lugares disponibles. */
export async function unirseASala(codigo: string, usuarioId: string): Promise<void> {
  await transaccion((bd) => unirseASalaEnTransaccion(codigo, usuarioId, bd));
}

/** Reutiliza el bloqueo de sala para entrar por código o aceptar una invitación de forma atómica. */
export async function unirseASalaEnTransaccion(
  codigo: string,
  usuarioId: string,
  bd: BaseDatos,
): Promise<void> {
  const sala = await cargarSala(codigo, bd, true),
    jugadores = await cargarJugadores(codigo, bd);
  if (jugadores.some((jugador) => jugador.id === usuarioId)) return;
  if (sala.partida_id || jugadores.length >= (sala.modo === 'duelo' ? 2 : 4))
    throw new ErrorHttp(409, 'La sala está completa o ya comenzó.');
  const conteos = [
    jugadores.filter((p) => p.equipo === 0).length,
    jugadores.filter((p) => p.equipo === 1).length,
  ];
  const equipo = conteos[0] <= conteos[1] ? 0 : 1;
  await escribir(
    'INSERT INTO jugadores_sala(sala_codigo,usuario_id,equipo,listo) VALUES (?,?,?,FALSE)',
    [codigo, usuarioId, equipo],
    bd,
  );
}

/** Inicia una partida solo cuando los equipos están completos y todos confirmaron. */
export async function iniciarSala(codigo: string, usuarioId: string): Promise<string> {
  return transaccion(async (bd) => {
    const sala = await cargarSala(codigo, bd, true),
      jugadores = await cargarJugadores(codigo, bd);
    if (sala.anfitrion_id !== usuarioId)
      throw new ErrorHttp(403, 'Solo el anfitrión puede iniciar.');
    if (sala.partida_id) return sala.partida_id;
    const capacidad = sala.modo === 'duelo' ? 2 : 4;
    if (jugadores.length !== capacidad || !jugadores.every((jugador) => jugador.listo))
      throw new ErrorHttp(409, 'Faltan jugadores o confirmaciones.');
    if (jugadores.filter((jugador) => jugador.equipo === 0).length !== capacidad / 2)
      throw new ErrorHttp(409, 'Los equipos deben estar equilibrados.');
    const partidaId = await crearPartida(
      interpretarJson(sala.configuracion),
      sala.modo,
      jugadores,
      bd,
    );
    await escribir('UPDATE salas SET partida_id=? WHERE codigo=?', [partidaId, codigo], bd);
    return partidaId;
  });
}

/** Actualiza la confirmación o cambia a un equipo con espacio; una partida empezada es inmutable. */
export async function actualizarJugadorSala(
  codigo: string,
  usuarioId: string,
  accion: 'listo' | 'equipo',
  listo?: boolean,
): Promise<void> {
  await transaccion(async (bd) => {
    const sala = await cargarSala(codigo, bd, true),
      jugadores = await cargarJugadores(codigo, bd);
    const jugador = jugadores.find((miembro) => miembro.id === usuarioId);
    if (!jugador) throw new ErrorHttp(403, 'No estás en esta sala.');
    if (sala.partida_id) throw new ErrorHttp(409, 'La partida ya empezó.');
    if (accion === 'equipo') {
      if (
        sala.modo !== 'equipos' ||
        jugadores.filter((miembro) => miembro.equipo !== jugador.equipo).length >= 2
      )
        throw new ErrorHttp(409, 'El otro equipo está completo.');
      await escribir(
        'UPDATE jugadores_sala SET equipo=?,listo=FALSE WHERE sala_codigo=? AND usuario_id=?',
        [1 - jugador.equipo, codigo, usuarioId],
        bd,
      );
    } else
      await escribir(
        'UPDATE jugadores_sala SET listo=? WHERE sala_codigo=? AND usuario_id=?',
        [!!listo, codigo, usuarioId],
        bd,
      );
  });
}

/** Sale de una sala y transfiere el rol de anfitrión; elimina salas vacías en cascada. */
export async function salirDeSala(codigo: string, usuarioId: string): Promise<void> {
  await transaccion(async (bd) => {
    const sala = await cargarSala(codigo, bd, true);
    await escribir(
      'DELETE FROM jugadores_sala WHERE sala_codigo=? AND usuario_id=?',
      [codigo, usuarioId],
      bd,
    );
    const jugadores = await cargarJugadores(codigo, bd);
    if (!jugadores.length) await escribir('DELETE FROM salas WHERE codigo=?', [codigo], bd);
    else if (sala.anfitrion_id === usuarioId)
      await escribir(
        'UPDATE salas SET anfitrion_id=? WHERE codigo=?',
        [jugadores[0].id, codigo],
        bd,
      );
  });
}

/** Guarda un mensaje validado del chat después de comprobar la pertenencia a la sala. */
export async function enviarMensajeSala(
  codigo: string,
  usuarioId: string,
  texto: string,
): Promise<void> {
  await obtenerSala(codigo, usuarioId);
  await escribir('INSERT INTO mensajes_sala(sala_codigo,usuario_id,mensaje) VALUES (?,?,?)', [
    codigo,
    usuarioId,
    texto,
  ]);
}
