import { randomUUID } from 'node:crypto';
import { consultar, escribir, transaccion, type BaseDatos } from '../datos/base-datos.js';
import { ErrorHttp } from '../errores.js';
import { unirseASalaEnTransaccion } from './salas.js';
import type {
  UsuarioPublico,
  InvitacionSala,
  EstadoSocial,
  ResultadoBusquedaUsuario,
} from '../../compartido/tipos.js';

interface FilaAmistad {
  solicitante_id: string;
  estado: 'pendiente' | 'aceptada';
}
interface FilaInvitacion {
  id: string;
  sala_codigo: string;
  remitente_id: string;
  destinatario_id: string;
  estado: string;
  expira_en: string;
}

/** Ordena un par de usuarios para representar una amistad con una sola clave única. */
function par(usuarioId: string, otroId: string): [string, string] {
  if (usuarioId === otroId) throw new ErrorHttp(422, 'Elige a otro usuario.');
  return [usuarioId, otroId].sort() as [string, string];
}

/** Obtiene y opcionalmente bloquea la relación compartida entre dos usuarios. */
async function amistad(
  usuarioId: string,
  otroId: string,
  bd: BaseDatos,
  bloquear = false,
): Promise<FilaAmistad | undefined> {
  const [bajo, alto] = par(usuarioId, otroId);
  const [fila] = await consultar<FilaAmistad>(
    `SELECT solicitante_id,estado FROM amistades WHERE usuario_menor=? AND usuario_mayor=?${bloquear ? ' FOR UPDATE' : ''}`,
    [bajo, alto],
    bd,
  );
  return fila;
}

/** Busca por nombre o correo exacto; escapa comodines y devuelve solo perfiles públicos. */
export async function buscarUsuarios(
  usuarioId: string,
  termino: string,
): Promise<ResultadoBusquedaUsuario[]> {
  const patron = `%${termino.replace(/[=%_]/g, '=$&')}%`;
  return consultar<ResultadoBusquedaUsuario>(
    "SELECT u.id,u.nombre,CASE WHEN f.estado='aceptada' THEN 'amigo' WHEN f.solicitante_id=? THEN 'enviada' WHEN f.estado='pendiente' THEN 'recibida' ELSE 'ninguna' END AS relacion FROM usuarios u LEFT JOIN amistades f ON f.usuario_menor=LEAST(u.id,?) AND f.usuario_mayor=GREATEST(u.id,?) WHERE u.id<>? AND (u.nombre LIKE ? ESCAPE '=' OR u.correo=?) ORDER BY u.nombre,u.id LIMIT 20",
    [usuarioId, usuarioId, usuarioId, usuarioId, patron, termino.toLowerCase()],
  );
}

/** Crea una solicitud única; una solicitud recíproca confirma la amistad existente. */
export async function solicitarAmistad(usuarioId: string, otroId: string): Promise<void> {
  const [bajo, alto] = par(usuarioId, otroId);
  await transaccion(async (bd) => {
    const [destino] = await consultar('SELECT id FROM usuarios WHERE id=?', [otroId], bd);
    if (!destino) throw new ErrorHttp(404, 'No encontramos a ese usuario.');
    const insertado = await escribir(
      "INSERT IGNORE INTO amistades(usuario_menor,usuario_mayor,solicitante_id,estado) VALUES (?,?,?,'pendiente')",
      [bajo, alto, usuarioId],
      bd,
    );
    const relacion = await amistad(usuarioId, otroId, bd, true);
    if (!relacion) throw new ErrorHttp(409, 'No se pudo crear la solicitud. Inténtalo de nuevo.');
    if (relacion.estado === 'aceptada') throw new ErrorHttp(409, 'Ya están en tu lista de amigos.');
    if (relacion.solicitante_id !== usuarioId)
      await escribir(
        "UPDATE amistades SET estado='aceptada' WHERE usuario_menor=? AND usuario_mayor=?",
        [bajo, alto],
        bd,
      );
    else if (!insertado.affectedRows)
      throw new ErrorHttp(409, 'Ya enviaste una solicitud a este usuario.');
  });
}

/** Permite aceptar una solicitud únicamente a quien la recibió. */
export async function aceptarAmistad(usuarioId: string, otroId: string): Promise<void> {
  const [bajo, alto] = par(usuarioId, otroId);
  await transaccion(async (bd) => {
    const relacion = await amistad(usuarioId, otroId, bd, true);
    if (!relacion) throw new ErrorHttp(404, 'La solicitud ya no está disponible.');
    if (relacion.estado === 'aceptada') return;
    if (relacion.solicitante_id === usuarioId)
      throw new ErrorHttp(403, 'Solo el destinatario puede aceptar la solicitud.');
    await escribir(
      "UPDATE amistades SET estado='aceptada' WHERE usuario_menor=? AND usuario_mayor=?",
      [bajo, alto],
      bd,
    );
  });
}

/** Rechaza, cancela o retira la propia relación e invalida sus invitaciones pendientes. */
export async function eliminarAmistad(usuarioId: string, otroId: string): Promise<void> {
  const [bajo, alto] = par(usuarioId, otroId);
  await transaccion(async (bd) => {
    await amistad(usuarioId, otroId, bd, true);
    await escribir(
      'DELETE FROM amistades WHERE usuario_menor=? AND usuario_mayor=?',
      [bajo, alto],
      bd,
    );
    await escribir(
      "UPDATE invitaciones_sala SET estado='rechazada' WHERE estado='pendiente' AND ((remitente_id=? AND destinatario_id=?) OR (remitente_id=? AND destinatario_id=?))",
      [usuarioId, otroId, otroId, usuarioId],
      bd,
    );
  });
}

/** Devuelve una lista de invitaciones vigentes recibidas o enviadas por la propia cuenta. */
async function listarInvitaciones(usuarioId: string, recibida: boolean): Promise<InvitacionSala[]> {
  const filas = await consultar<{
    id: string;
    codigoSala: string;
    nombreSala: string;
    modo: 'duelo' | 'equipos';
    remitenteId: string;
    nombreRemitente: string;
    destinatarioId: string;
    nombreDestinatario: string;
    expiraEn: string;
  }>(
    `SELECT i.id,i.sala_codigo AS codigoSala,r.nombre AS nombreSala,r.modo,s.id AS remitenteId,s.nombre AS nombreRemitente,t.id AS destinatarioId,t.nombre AS nombreDestinatario,i.expira_en AS expiraEn FROM invitaciones_sala i JOIN salas r ON r.codigo=i.sala_codigo JOIN usuarios s ON s.id=i.remitente_id JOIN usuarios t ON t.id=i.destinatario_id WHERE i.${recibida ? 'destinatario_id' : 'remitente_id'}=? AND i.estado='pendiente' AND i.expira_en>? AND r.partida_id IS NULL ORDER BY i.creado_en DESC`,
    [usuarioId, Date.now()],
  );
  return filas.map((fila) => ({
    id: fila.id,
    codigoSala: fila.codigoSala,
    nombreSala: fila.nombreSala,
    modo: fila.modo,
    remitente: { id: fila.remitenteId, nombre: fila.nombreRemitente },
    destinatario: { id: fila.destinatarioId, nombre: fila.nombreDestinatario },
    expiraEn: Number(fila.expiraEn),
  }));
}

/** Reúne amigos, solicitudes e invitaciones; todos los datos se filtran por el usuario autenticado. */
export async function obtenerSocial(usuarioId: string): Promise<EstadoSocial> {
  const relaciones = await consultar<UsuarioPublico & FilaAmistad>(
    'SELECT u.id,u.nombre,f.solicitante_id,f.estado FROM amistades f JOIN usuarios u ON u.id=CASE WHEN f.usuario_menor=? THEN f.usuario_mayor ELSE f.usuario_menor END WHERE f.usuario_menor=? OR f.usuario_mayor=? ORDER BY u.nombre,u.id',
    [usuarioId, usuarioId, usuarioId],
  );
  const perfilPublico = (fila: UsuarioPublico): UsuarioPublico => ({
    id: fila.id,
    nombre: fila.nombre,
  });
  const [invitaciones, invitacionesEnviadas] = await Promise.all([
    listarInvitaciones(usuarioId, true),
    listarInvitaciones(usuarioId, false),
  ]);
  return {
    amigos: relaciones.filter((fila) => fila.estado === 'aceptada').map(perfilPublico),
    solicitudesRecibidas: relaciones
      .filter((fila) => fila.estado === 'pendiente' && fila.solicitante_id !== usuarioId)
      .map(perfilPublico),
    solicitudesEnviadas: relaciones
      .filter((fila) => fila.estado === 'pendiente' && fila.solicitante_id === usuarioId)
      .map(perfilPublico),
    invitaciones,
    invitacionesEnviadas,
  };
}

/** Invita a un amigo desde una sala propia con lugares libres, sin duplicar invitaciones vigentes. */
export async function invitarAmigo(
  codigo: string,
  remitenteId: string,
  destinatarioId: string,
): Promise<void> {
  await transaccion(async (bd) => {
    const relacion = await amistad(remitenteId, destinatarioId, bd, true);
    if (relacion?.estado !== 'aceptada')
      throw new ErrorHttp(403, 'Primero deben aceptar la solicitud de amistad.');
    const [sala] = await consultar<{ modo: 'duelo' | 'equipos'; partida_id: string | null }>(
      'SELECT modo,partida_id FROM salas WHERE codigo=? FOR UPDATE',
      [codigo],
      bd,
    );
    if (!sala) throw new ErrorHttp(404, 'La sala ya no existe.');
    const jugadores = await consultar<{ usuario_id: string }>(
      'SELECT usuario_id FROM jugadores_sala WHERE sala_codigo=?',
      [codigo],
      bd,
    );
    if (!jugadores.some((jugador) => jugador.usuario_id === remitenteId))
      throw new ErrorHttp(403, 'Solo los integrantes pueden invitar a esta sala.');
    if (sala.partida_id || jugadores.length >= (sala.modo === 'duelo' ? 2 : 4))
      throw new ErrorHttp(409, 'La sala está llena o la partida ya comenzó.');
    if (jugadores.some((jugador) => jugador.usuario_id === destinatarioId))
      throw new ErrorHttp(409, 'Tu amigo ya está en la sala.');
    const [existente] = await consultar<FilaInvitacion>(
      'SELECT * FROM invitaciones_sala WHERE sala_codigo=? AND destinatario_id=? FOR UPDATE',
      [codigo, destinatarioId],
      bd,
    );
    if (existente?.estado === 'pendiente' && Number(existente.expira_en) > Date.now())
      throw new ErrorHttp(409, 'Ya hay una invitación pendiente para este amigo.');
    const id = randomUUID(),
      vence = Date.now() + 15 * 60000;
    if (existente)
      await escribir(
        "UPDATE invitaciones_sala SET id=?,remitente_id=?,estado='pendiente',expira_en=?,creado_en=CURRENT_TIMESTAMP WHERE id=?",
        [id, remitenteId, vence, existente.id],
        bd,
      );
    else
      await escribir(
        'INSERT INTO invitaciones_sala(id,sala_codigo,remitente_id,destinatario_id,expira_en) VALUES (?,?,?,?,?)',
        [id, codigo, remitenteId, destinatarioId, vence],
        bd,
      );
  });
}

/** Acepta o rechaza una invitación propia y agrega al jugador bajo el mismo bloqueo de capacidad. */
export async function responderInvitacion(
  id: string,
  usuarioId: string,
  aceptar: boolean,
): Promise<{ codigo: string; remitenteId: string }> {
  const [inicial] = await consultar<FilaInvitacion>(
    'SELECT * FROM invitaciones_sala WHERE id=? AND destinatario_id=?',
    [id, usuarioId],
  );
  if (!inicial) throw new ErrorHttp(404, 'La invitación no está disponible para esta cuenta.');
  return transaccion(async (bd) => {
    const relacion = await amistad(usuarioId, inicial.remitente_id, bd, true);
    const [sala] = await consultar<{ partida_id: string | null }>(
      'SELECT partida_id FROM salas WHERE codigo=? FOR UPDATE',
      [inicial.sala_codigo],
      bd,
    );
    if (!sala) throw new ErrorHttp(404, 'La sala ya no existe.');
    const [invitacion] = await consultar<FilaInvitacion>(
      'SELECT * FROM invitaciones_sala WHERE id=? AND destinatario_id=? FOR UPDATE',
      [id, usuarioId],
      bd,
    );
    if (!invitacion || invitacion.estado !== 'pendiente')
      throw new ErrorHttp(409, 'Esta invitación ya fue respondida.');
    if (!aceptar) {
      await escribir("UPDATE invitaciones_sala SET estado='rechazada' WHERE id=?", [id], bd);
    } else {
      if (relacion?.estado !== 'aceptada')
        throw new ErrorHttp(409, 'La amistad ya no está disponible.');
      if (Number(invitacion.expira_en) <= Date.now())
        throw new ErrorHttp(409, 'La invitación caducó. Pide que te envíen otra.');
      if (sala.partida_id) throw new ErrorHttp(409, 'La partida ya comenzó.');
      await unirseASalaEnTransaccion(inicial.sala_codigo, usuarioId, bd);
      await escribir("UPDATE invitaciones_sala SET estado='aceptada' WHERE id=?", [id], bd);
    }
    return { codigo: inicial.sala_codigo, remitenteId: inicial.remitente_id };
  });
}
