/** Controla rondas, respuestas, pistas, resultados y estadísticas. */
import { randomUUID } from 'node:crypto';
import {
  consultar,
  escribir,
  transaccion,
  conexiones,
  type BaseDatos,
} from '../datos/base-datos.js';
import { calcularPuntos, esRespuestaCorrecta, interpretarJson, barajado } from './puntuacion.js';
import { ErrorHttp } from '../errores.js';
import { GENEROS_RETIRADOS } from '../../compartido/musica.js';
import type {
  ConfiguracionPartida,
  EstadoPartida,
  Jugador,
  ResultadoRonda,
  Estadisticas,
} from '../../compartido/tipos.js';

interface FilaPartida {
  id: string;
  modo: EstadoPartida['modo'];
  estado: EstadoPartida['estado'];
  configuracion: ConfiguracionPartida | string;
  canciones_ids: string[] | string;
  ronda_actual: number;
  ronda_iniciada_en: string;
}
interface FilaCancion {
  id: string;
  titulo: string;
  artista: string;
  alias: string[] | string;
  anio_lanzamiento: number;
  url_audio: string | null;
  inicio_fragmento: number;
  duracion: number;
  fuente: 'integrado' | 'local' | 'jamendo' | 'audius' | 'deezer';
}

/** Carga una partida y opcionalmente bloquea su fila durante una transacción. */
async function cargarPartida(id: string, bd: BaseDatos, bloquear = false): Promise<FilaPartida> {
  const [partida] = await consultar<FilaPartida>(
    `SELECT * FROM partidas WHERE id=?${bloquear ? ' FOR UPDATE' : ''}`,
    [id],
    bd,
  );
  if (!partida) throw new ErrorHttp(404, 'No encontramos esta partida.');
  return partida;
}

/** Comprueba que el usuario participa antes de entregar datos o modificar una partida. */
async function verificarParticipacion(id: string, usuarioId: string, bd: BaseDatos): Promise<void> {
  const [miembro] = await consultar<{ id: string }>(
    'SELECT usuario_id AS id FROM jugadores_partida WHERE partida_id=? AND usuario_id=?',
    [id, usuarioId],
    bd,
  );
  if (!miembro) throw new ErrorHttp(403, 'No participas en esta partida.');
}

/** Recupera exclusivamente la canción de la ronda actual desde el catálogo privado. */
async function cancionActual(partida: FilaPartida, bd: BaseDatos): Promise<FilaCancion> {
  const ids = interpretarJson<string[]>(partida.canciones_ids);
  const [cancion] = await consultar<FilaCancion>(
    "SELECT s.*,m.url_audio,COALESCE(m.inicio_fragmento,0) AS inicio_fragmento,COALESCE(m.duracion,12) AS duracion,COALESCE(m.fuente,'integrado') AS fuente FROM canciones s LEFT JOIN medios_cancion m ON m.cancion_id=s.id WHERE s.id=?",
    [ids[Math.min(partida.ronda_actual, ids.length - 1)]],
    bd,
  );
  if (!cancion) throw new ErrorHttp(409, 'El catálogo de esta partida ya no está disponible.');
  return cancion;
}

/** Crea una partida persistida y sus participantes sin enviar títulos ni identificadores de canciones al navegador. */
export async function crearPartida(
  configuracion: ConfiguracionPartida,
  modo: EstadoPartida['modo'],
  jugadores: { id: string; equipo: number }[],
  bd: BaseDatos,
): Promise<string> {
  const canciones = await consultar<{ id: string }>(
    `SELECT s.id FROM canciones s JOIN medios_cancion m ON m.cancion_id=s.id WHERE m.habilitada=1 AND m.fuente='deezer' AND s.genero NOT IN (?,?,?) AND (?='Todas' OR s.genero=?)`,
    [...GENEROS_RETIRADOS, configuracion.genero, configuracion.genero],
    bd,
  );
  if (canciones.length < configuracion.rondas)
    throw new ErrorHttp(
      422,
      'No hay suficientes canciones oficiales para esos filtros. Elige otro género o menos rondas.',
    );
  const id = randomUUID();
  await escribir(
    'INSERT INTO partidas(id,modo,configuracion,canciones_ids,ronda_iniciada_en) VALUES (?,?,?,?,?)',
    [
      id,
      modo,
      JSON.stringify(configuracion),
      JSON.stringify(
        barajado(canciones)
          .slice(0, configuracion.rondas)
          .map((cancion) => cancion.id),
      ),
      Date.now() + 1500,
    ],
    bd,
  );
  for (const jugador of jugadores)
    await escribir(
      'INSERT INTO jugadores_partida(partida_id,usuario_id,equipo) VALUES (?,?,?)',
      [id, jugador.id, jugador.equipo],
      bd,
    );
  return id;
}

/** Compone un estado autorizado; solo revela respuestas propias o de rondas ya terminadas. */
export async function obtenerPartida(id: string, usuarioId: string): Promise<EstadoPartida> {
  const partida = await cargarPartida(id, conexiones);
  await verificarParticipacion(id, usuarioId, conexiones);
  const jugadores = await consultar<Jugador>(
    'SELECT u.id,u.nombre,gp.equipo,COALESCE(SUM(a.puntos),0) AS puntuacion,TRUE AS listo FROM jugadores_partida gp JOIN usuarios u ON u.id=gp.usuario_id LEFT JOIN respuestas a ON a.partida_id=gp.partida_id AND a.usuario_id=gp.usuario_id WHERE gp.partida_id=? GROUP BY u.id,u.nombre,gp.equipo',
    [id],
  );
  const configuracion = interpretarJson<ConfiguracionPartida>(partida.configuracion),
    ids = interpretarJson<string[]>(partida.canciones_ids);
  const resultados = await consultar<ResultadoRonda & { transcurrido: number }>(
    "SELECT a.indice_ronda AS ronda,s.titulo,s.artista,a.respuesta,a.correcta,a.puntos,a.transcurrido_ms AS transcurrido,a.usuario_id AS usuarioId,m.url_fuente AS urlFuente,m.url_licencia AS urlLicencia FROM respuestas a JOIN canciones s ON s.id=JSON_UNQUOTE(JSON_EXTRACT(?,CONCAT('$[',a.indice_ronda,']'))) LEFT JOIN medios_cancion m ON m.cancion_id=s.id WHERE a.partida_id=? AND (a.usuario_id=? OR a.indice_ronda<? OR ?<>'en_curso') ORDER BY a.indice_ronda,a.usuario_id",
    [JSON.stringify(ids), id, usuarioId, partida.ronda_actual, partida.estado],
  );
  const [respuesta] = await consultar<{ n: number }>(
    'SELECT COUNT(*) AS n FROM respuestas WHERE partida_id=? AND usuario_id=? AND indice_ronda=?',
    [id, usuarioId, partida.ronda_actual],
  );
  const medio = await cancionActual(partida, conexiones);
  return {
    id,
    modo: partida.modo,
    estado: partida.estado,
    configuracion,
    ronda: partida.ronda_actual,
    total: ids.length,
    iniciadaEn: Number(partida.ronda_iniciada_en),
    ahoraServidor: Date.now(),
    jugadores: jugadores.map((jugador) => ({
      ...jugador,
      puntuacion: Number(jugador.puntuacion),
      listo: true,
    })),
    resultados: resultados.map((resultado) => ({
      ...resultado,
      correcta: !!resultado.correcta,
      transcurrido: Number(resultado.transcurrido),
    })),
    respondida: respuesta.n > 0,
    inicioAudio: Number(medio.inicio_fragmento),
    duracionAudio: Math.min(12, medio.duracion),
    fuenteAudio: medio.fuente,
  };
}

/** Evalúa una respuesta una sola vez bajo bloqueo de fila y usa únicamente el reloj del servidor. */
export async function responderPartida(
  id: string,
  usuarioId: string,
  respuesta: string,
  rondaEsperada: number,
): Promise<void> {
  await transaccion(async (bd) => {
    const partida = await cargarPartida(id, bd, true);
    await verificarParticipacion(id, usuarioId, bd);
    if (partida.estado !== 'en_curso') throw new ErrorHttp(409, 'La partida ya terminó.');
    if (partida.ronda_actual !== rondaEsperada)
      throw new ErrorHttp(409, 'La ronda cambió. Actualiza la partida.');
    if (Date.now() < Number(partida.ronda_iniciada_en))
      throw new ErrorHttp(409, 'La ronda está a punto de comenzar.');
    const [existente] = await consultar(
      'SELECT 1 FROM respuestas WHERE partida_id=? AND usuario_id=? AND indice_ronda=?',
      [id, usuarioId, partida.ronda_actual],
      bd,
    );
    if (existente) throw new ErrorHttp(409, 'Ya enviaste una respuesta en esta ronda.');
    const configuracion = interpretarJson<ConfiguracionPartida>(partida.configuracion),
      cancion = await cancionActual(partida, bd);
    const transcurrido = Math.max(0, Date.now() - Number(partida.ronda_iniciada_en));
    const correcta =
      transcurrido <= configuracion.segundos * 1000 &&
      esRespuestaCorrecta(
        respuesta,
        cancion.titulo,
        interpretarJson(cancion.alias),
        cancion.artista,
        configuracion.modoRespuesta,
      );
    await escribir(
      'INSERT INTO respuestas(partida_id,usuario_id,indice_ronda,respuesta,correcta,puntos,transcurrido_ms) VALUES (?,?,?,?,?,?,?)',
      [
        id,
        usuarioId,
        partida.ronda_actual,
        respuesta,
        correcta,
        calcularPuntos(correcta, transcurrido, configuracion),
        Math.min(transcurrido, 2147483647),
      ],
      bd,
    );
  });
}

/** Avanza una ronda finalizada; en multijugador completa los tiempos agotados y sincroniza a todos. */
export async function avanzarPartida(
  id: string,
  usuarioId?: string,
  rondaEsperada?: number,
): Promise<void> {
  await transaccion(async (bd) => {
    const partida = await cargarPartida(id, bd, true);
    if (usuarioId) await verificarParticipacion(id, usuarioId, bd);
    if (partida.estado !== 'en_curso') return;
    if (rondaEsperada !== undefined && partida.ronda_actual !== rondaEsperada)
      throw new ErrorHttp(409, 'Esta ronda ya avanzó.');
    const configuracion = interpretarJson<ConfiguracionPartida>(partida.configuracion);
    const [conteos] = await consultar<{ jugadores: number; respondida: number; ultimo: number }>(
      'SELECT (SELECT COUNT(*) FROM jugadores_partida WHERE partida_id=?) AS jugadores, COUNT(*) AS respondida,COALESCE(MAX(transcurrido_ms),0) AS ultimo FROM respuestas WHERE partida_id=? AND indice_ronda=?',
      [id, id, partida.ronda_actual],
      bd,
    );
    const vencida = Date.now() >= Number(partida.ronda_iniciada_en) + configuracion.segundos * 1000;
    if (conteos.respondida < conteos.jugadores && !vencida) {
      if (usuarioId) throw new ErrorHttp(409, 'Responde o espera a que termine la ronda.');
      return;
    }
    if (
      !usuarioId &&
      Date.now() <
        Number(partida.ronda_iniciada_en) +
          (vencida ? configuracion.segundos * 1000 : Number(conteos.ultimo)) +
          2200
    )
      return;
    await escribir(
      "INSERT IGNORE INTO respuestas(partida_id,usuario_id,indice_ronda,respuesta,correcta,puntos,transcurrido_ms) SELECT partida_id,usuario_id,?,'',FALSE,0,? FROM jugadores_partida WHERE partida_id=?",
      [partida.ronda_actual, configuracion.segundos * 1000, id],
      bd,
    );
    const siguiente = partida.ronda_actual + 1,
      terminada = siguiente >= interpretarJson<string[]>(partida.canciones_ids).length;
    await escribir(
      'UPDATE partidas SET ronda_actual=?,estado=?,ronda_iniciada_en=? WHERE id=?',
      [
        terminada ? partida.ronda_actual : siguiente,
        terminada ? 'terminada' : 'en_curso',
        Date.now() + 1500,
        id,
      ],
      bd,
    );
  });
}

/** Resuelve un audio privado después de verificar la participación en la partida. */
export async function obtenerAudio(id: string, usuarioId: string): Promise<{ url: string | null }> {
  const partida = await cargarPartida(id, conexiones);
  await verificarParticipacion(id, usuarioId, conexiones);
  if (partida.estado !== 'en_curso') throw new ErrorHttp(409, 'La partida ya terminó.');
  const cancion = await cancionActual(partida, conexiones);
  if (cancion.fuente !== 'deezer')
    throw new ErrorHttp(
      409,
      'Esta partida usa el catálogo anterior. Crea una partida nueva para escuchar las canciones oficiales.',
    );
  return { url: cancion.url_audio };
}

/** Cancela la partida de sus participantes conservando el historial en MySQL. */
export async function abandonarPartida(id: string, usuarioId: string): Promise<void> {
  await transaccion(async (bd) => {
    await cargarPartida(id, bd, true);
    await verificarParticipacion(id, usuarioId, bd);
    await escribir(
      "UPDATE partidas SET estado='abandonada' WHERE id=? AND estado='en_curso'",
      [id],
      bd,
    );
  });
}

/** Calcula estadísticas reales usando únicamente partidas completadas. */
export async function obtenerEstadisticas(usuarioId: string): Promise<Estadisticas> {
  const puntuaciones = await consultar<{ puntuacion: number; partida_id: string }>(
    "SELECT gp.partida_id,COALESCE(SUM(a.puntos),0) AS puntuacion FROM jugadores_partida gp JOIN partidas g ON g.id=gp.partida_id LEFT JOIN respuestas a ON a.partida_id=gp.partida_id AND a.usuario_id=gp.usuario_id WHERE gp.usuario_id=? AND g.estado='terminada' GROUP BY gp.partida_id",
    [usuarioId],
  );
  const respuestas = await consultar<{ partida_id: string; correcta: number }>(
    "SELECT a.partida_id,a.correcta FROM respuestas a JOIN partidas g ON g.id=a.partida_id WHERE a.usuario_id=? AND g.estado='terminada' ORDER BY g.creado_en,a.partida_id,a.indice_ronda",
    [usuarioId],
  );
  let racha = 0,
    mejorRacha = 0,
    previo = '';
  for (const respuesta of respuestas) {
    if (previo !== respuesta.partida_id) racha = 0;
    racha = respuesta.correcta ? racha + 1 : 0;
    mejorRacha = Math.max(mejorRacha, racha);
    previo = respuesta.partida_id;
  }
  return {
    jugadas: puntuaciones.length,
    mejorRacha,
    mejorPuntuacion: Math.max(
      0,
      ...puntuaciones.map((puntuacion) => Number(puntuacion.puntuacion)),
    ),
  };
}
