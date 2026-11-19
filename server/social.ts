import { randomUUID } from 'node:crypto';
import { query, write, transaction, type Database } from './base-datos.js';
import { HttpError } from './errores.js';
import { joinRoomWithinTransaction } from './salas.js';
import type {
  PublicUser,
  RoomInvitation,
  SocialSnapshot,
  UserSearchResult,
} from '../shared/tipos.js';

interface FriendshipRow {
  requester_id: string;
  status: 'pending' | 'accepted';
}
interface InvitationRow {
  id: string;
  room_code: string;
  sender_id: string;
  recipient_id: string;
  status: string;
  expires_at: string;
}

/** Ordena un par de usuarios para representar una amistad con una sola clave única. */
function pair(userId: string, otherId: string): [string, string] {
  if (userId === otherId) throw new HttpError(422, 'Elige a otro usuario.');
  return [userId, otherId].sort() as [string, string];
}

/** Obtiene y opcionalmente bloquea la relación compartida entre dos usuarios. */
async function friendship(
  userId: string,
  otherId: string,
  db: Database,
  lock = false,
): Promise<FriendshipRow | undefined> {
  const [low, high] = pair(userId, otherId);
  const [row] = await query<FriendshipRow>(
    `SELECT requester_id,status FROM friendships WHERE user_low=? AND user_high=?${lock ? ' FOR UPDATE' : ''}`,
    [low, high],
    db,
  );
  return row;
}

/** Busca por nombre o correo exacto; escapa comodines y devuelve solo perfiles públicos. */
export async function searchUsers(userId: string, term: string): Promise<UserSearchResult[]> {
  const pattern = `%${term.replace(/[=%_]/g, '=$&')}%`;
  return query<UserSearchResult>(
    "SELECT u.id,u.name,CASE WHEN f.status='accepted' THEN 'friend' WHEN f.requester_id=? THEN 'outgoing' WHEN f.status='pending' THEN 'incoming' ELSE 'none' END AS relationship FROM users u LEFT JOIN friendships f ON f.user_low=LEAST(u.id,?) AND f.user_high=GREATEST(u.id,?) WHERE u.id<>? AND (u.name LIKE ? ESCAPE '=' OR u.email=?) ORDER BY u.name,u.id LIMIT 20",
    [userId, userId, userId, userId, pattern, term.toLowerCase()],
  );
}

/** Crea una solicitud única; una solicitud recíproca confirma la amistad existente. */
export async function requestFriend(userId: string, otherId: string): Promise<void> {
  const [low, high] = pair(userId, otherId);
  await transaction(async (db) => {
    const [target] = await query('SELECT id FROM users WHERE id=?', [otherId], db);
    if (!target) throw new HttpError(404, 'No encontramos a ese usuario.');
    const inserted = await write(
      "INSERT IGNORE INTO friendships(user_low,user_high,requester_id,status) VALUES (?,?,?,'pending')",
      [low, high, userId],
      db,
    );
    const relation = await friendship(userId, otherId, db, true);
    if (!relation) throw new HttpError(409, 'No se pudo crear la solicitud. Inténtalo de nuevo.');
    if (relation.status === 'accepted') throw new HttpError(409, 'Ya están en tu lista de amigos.');
    if (relation.requester_id !== userId)
      await write(
        "UPDATE friendships SET status='accepted' WHERE user_low=? AND user_high=?",
        [low, high],
        db,
      );
    else if (!inserted.affectedRows)
      throw new HttpError(409, 'Ya enviaste una solicitud a este usuario.');
  });
}

/** Permite aceptar una solicitud únicamente a quien la recibió. */
export async function acceptFriend(userId: string, otherId: string): Promise<void> {
  const [low, high] = pair(userId, otherId);
  await transaction(async (db) => {
    const relation = await friendship(userId, otherId, db, true);
    if (!relation) throw new HttpError(404, 'La solicitud ya no está disponible.');
    if (relation.status === 'accepted') return;
    if (relation.requester_id === userId)
      throw new HttpError(403, 'Solo el destinatario puede aceptar la solicitud.');
    await write(
      "UPDATE friendships SET status='accepted' WHERE user_low=? AND user_high=?",
      [low, high],
      db,
    );
  });
}

/** Rechaza, cancela o retira la propia relación e invalida sus invitaciones pendientes. */
export async function removeFriend(userId: string, otherId: string): Promise<void> {
  const [low, high] = pair(userId, otherId);
  await transaction(async (db) => {
    await friendship(userId, otherId, db, true);
    await write('DELETE FROM friendships WHERE user_low=? AND user_high=?', [low, high], db);
    await write(
      "UPDATE room_invitations SET status='declined' WHERE status='pending' AND ((sender_id=? AND recipient_id=?) OR (sender_id=? AND recipient_id=?))",
      [userId, otherId, otherId, userId],
      db,
    );
  });
}

/** Devuelve una lista de invitaciones vigentes recibidas o enviadas por la propia cuenta. */
async function listInvitations(userId: string, incoming: boolean): Promise<RoomInvitation[]> {
  const rows = await query<{
    id: string;
    roomCode: string;
    roomName: string;
    mode: 'duel' | 'teams';
    senderId: string;
    senderName: string;
    recipientId: string;
    recipientName: string;
    expiresAt: string;
  }>(
    `SELECT i.id,i.room_code AS roomCode,r.name AS roomName,r.mode,s.id AS senderId,s.name AS senderName,t.id AS recipientId,t.name AS recipientName,i.expires_at AS expiresAt FROM room_invitations i JOIN rooms r ON r.code=i.room_code JOIN users s ON s.id=i.sender_id JOIN users t ON t.id=i.recipient_id WHERE i.${incoming ? 'recipient_id' : 'sender_id'}=? AND i.status='pending' AND i.expires_at>? AND r.game_id IS NULL ORDER BY i.created_at DESC`,
    [userId, Date.now()],
  );
  return rows.map((row) => ({
    id: row.id,
    roomCode: row.roomCode,
    roomName: row.roomName,
    mode: row.mode,
    sender: { id: row.senderId, name: row.senderName },
    recipient: { id: row.recipientId, name: row.recipientName },
    expiresAt: Number(row.expiresAt),
  }));
}

/** Reúne amigos, solicitudes e invitaciones; todos los datos se filtran por el usuario autenticado. */
export async function getSocial(userId: string): Promise<SocialSnapshot> {
  const relations = await query<PublicUser & FriendshipRow>(
    'SELECT u.id,u.name,f.requester_id,f.status FROM friendships f JOIN users u ON u.id=CASE WHEN f.user_low=? THEN f.user_high ELSE f.user_low END WHERE f.user_low=? OR f.user_high=? ORDER BY u.name,u.id',
    [userId, userId, userId],
  );
  const publicProfile = (row: PublicUser): PublicUser => ({ id: row.id, name: row.name });
  const [invitations, sentInvitations] = await Promise.all([
    listInvitations(userId, true),
    listInvitations(userId, false),
  ]);
  return {
    friends: relations.filter((row) => row.status === 'accepted').map(publicProfile),
    incomingRequests: relations
      .filter((row) => row.status === 'pending' && row.requester_id !== userId)
      .map(publicProfile),
    outgoingRequests: relations
      .filter((row) => row.status === 'pending' && row.requester_id === userId)
      .map(publicProfile),
    invitations,
    sentInvitations,
  };
}

/** Invita a un amigo desde una sala propia con lugares libres, sin duplicar invitaciones vigentes. */
export async function inviteFriend(
  code: string,
  senderId: string,
  recipientId: string,
): Promise<void> {
  await transaction(async (db) => {
    const relation = await friendship(senderId, recipientId, db, true);
    if (relation?.status !== 'accepted')
      throw new HttpError(403, 'Primero deben aceptar la solicitud de amistad.');
    const [room] = await query<{ mode: 'duel' | 'teams'; game_id: string | null }>(
      'SELECT mode,game_id FROM rooms WHERE code=? FOR UPDATE',
      [code],
      db,
    );
    if (!room) throw new HttpError(404, 'La sala ya no existe.');
    const players = await query<{ user_id: string }>(
      'SELECT user_id FROM room_players WHERE room_code=?',
      [code],
      db,
    );
    if (!players.some((player) => player.user_id === senderId))
      throw new HttpError(403, 'Solo los integrantes pueden invitar a esta sala.');
    if (room.game_id || players.length >= (room.mode === 'duel' ? 2 : 4))
      throw new HttpError(409, 'La sala está llena o la partida ya comenzó.');
    if (players.some((player) => player.user_id === recipientId))
      throw new HttpError(409, 'Tu amigo ya está en la sala.');
    const [existing] = await query<InvitationRow>(
      'SELECT * FROM room_invitations WHERE room_code=? AND recipient_id=? FOR UPDATE',
      [code, recipientId],
      db,
    );
    if (existing?.status === 'pending' && Number(existing.expires_at) > Date.now())
      throw new HttpError(409, 'Ya hay una invitación pendiente para este amigo.');
    const id = randomUUID(),
      expires = Date.now() + 15 * 60000;
    if (existing)
      await write(
        "UPDATE room_invitations SET id=?,sender_id=?,status='pending',expires_at=?,created_at=CURRENT_TIMESTAMP WHERE id=?",
        [id, senderId, expires, existing.id],
        db,
      );
    else
      await write(
        'INSERT INTO room_invitations(id,room_code,sender_id,recipient_id,expires_at) VALUES (?,?,?,?,?)',
        [id, code, senderId, recipientId, expires],
        db,
      );
  });
}

/** Acepta o rechaza una invitación propia y agrega al jugador bajo el mismo bloqueo de capacidad. */
export async function respondInvitation(
  id: string,
  userId: string,
  accept: boolean,
): Promise<{ code: string; senderId: string }> {
  const [initial] = await query<InvitationRow>(
    'SELECT * FROM room_invitations WHERE id=? AND recipient_id=?',
    [id, userId],
  );
  if (!initial) throw new HttpError(404, 'La invitación no está disponible para esta cuenta.');
  return transaction(async (db) => {
    const relation = await friendship(userId, initial.sender_id, db, true);
    const [room] = await query<{ game_id: string | null }>(
      'SELECT game_id FROM rooms WHERE code=? FOR UPDATE',
      [initial.room_code],
      db,
    );
    if (!room) throw new HttpError(404, 'La sala ya no existe.');
    const [invitation] = await query<InvitationRow>(
      'SELECT * FROM room_invitations WHERE id=? AND recipient_id=? FOR UPDATE',
      [id, userId],
      db,
    );
    if (!invitation || invitation.status !== 'pending')
      throw new HttpError(409, 'Esta invitación ya fue respondida.');
    if (!accept) {
      await write("UPDATE room_invitations SET status='declined' WHERE id=?", [id], db);
    } else {
      if (relation?.status !== 'accepted')
        throw new HttpError(409, 'La amistad ya no está disponible.');
      if (Number(invitation.expires_at) <= Date.now())
        throw new HttpError(409, 'La invitación caducó. Pide que te envíen otra.');
      if (room.game_id) throw new HttpError(409, 'La partida ya comenzó.');
      await joinRoomWithinTransaction(initial.room_code, userId, db);
      await write("UPDATE room_invitations SET status='accepted' WHERE id=?", [id], db);
    }
    return { code: initial.room_code, senderId: initial.sender_id };
  });
}
