/** Gestiona salas privadas, participantes, equipos y chat. */
import { randomBytes } from 'node:crypto';
import { query, write, transaction, pool, type Database } from '../datos/base-datos.js';
import { HttpError } from '../errores.js';
import { parseJson } from './puntuacion.js';
import { createGame } from './partidas.js';
import type { GameConfig, RoomSnapshot, Player } from '../../compartido/tipos.js';

interface RoomRow {
  code: string;
  name: string;
  mode: 'duel' | 'teams';
  host_id: string;
  config: GameConfig | string;
  game_id: string | null;
}

/** Recupera una sala por su código y opcionalmente bloquea cambios simultáneos. */
async function loadRoom(code: string, db: Database = pool, lock = false): Promise<RoomRow> {
  const [room] = await query<RoomRow>(
    `SELECT * FROM rooms WHERE code=?${lock ? ' FOR UPDATE' : ''}`,
    [code],
    db,
  );
  if (!room) throw new HttpError(404, 'Ese código no corresponde a una sala.');
  return room;
}

/** Devuelve los miembros reales y sus equipos sin inventar rivales ni estados de conexión. */
async function loadPlayers(code: string, db: Database = pool): Promise<Player[]> {
  const players = await query<Player>(
    'SELECT u.id,u.name,rp.team,rp.ready,0 AS score FROM room_players rp JOIN users u ON u.id=rp.user_id WHERE rp.room_code=? ORDER BY rp.team,u.name',
    [code],
    db,
  );
  return players.map((player) => ({ ...player, ready: !!player.ready }));
}

/** Devuelve la sala y los últimos 50 mensajes únicamente a sus miembros. */
export async function getRoom(code: string, userId: string): Promise<RoomSnapshot> {
  const room = await loadRoom(code),
    players = await loadPlayers(code);
  if (!players.some((player) => player.id === userId))
    throw new HttpError(403, 'Primero entra a esta sala.');
  const messages = await query<{ id: number; name: string; text: string }>(
    'SELECT m.id,u.name,m.message AS text FROM room_messages m JOIN users u ON u.id=m.user_id WHERE room_code=? ORDER BY m.id DESC LIMIT 50',
    [code],
  );
  return {
    code,
    name: room.name,
    mode: room.mode,
    hostId: room.host_id,
    players,
    config: parseJson(room.config),
    gameId: room.game_id,
    messages: messages.reverse(),
  };
}

/** Crea una sala con un código aleatorio no predecible y registra al anfitrión. */
export async function createRoom(
  userId: string,
  name: string,
  mode: 'duel' | 'teams',
  config: GameConfig,
): Promise<string> {
  return transaction(async (db) => {
    const code = randomBytes(3).toString('hex').toUpperCase();
    await write(
      'INSERT INTO rooms(code,name,mode,host_id,config) VALUES (?,?,?,?,?)',
      [code, name, mode, userId, JSON.stringify(config)],
      db,
    );
    await write(
      'INSERT INTO room_players(room_code,user_id,team,ready) VALUES (?,?,0,FALSE)',
      [code, userId],
      db,
    );
    return code;
  });
}

/** Añade un jugador bajo bloqueo para evitar exceder los dos o cuatro lugares disponibles. */
export async function joinRoom(code: string, userId: string): Promise<void> {
  await transaction((db) => joinRoomWithinTransaction(code, userId, db));
}

/** Reutiliza el bloqueo de sala para entrar por código o aceptar una invitación de forma atómica. */
export async function joinRoomWithinTransaction(
  code: string,
  userId: string,
  db: Database,
): Promise<void> {
  const room = await loadRoom(code, db, true),
    players = await loadPlayers(code, db);
  if (players.some((player) => player.id === userId)) return;
  if (room.game_id || players.length >= (room.mode === 'duel' ? 2 : 4))
    throw new HttpError(409, 'La sala está completa o ya comenzó.');
  const counts = [
    players.filter((p) => p.team === 0).length,
    players.filter((p) => p.team === 1).length,
  ];
  const team = counts[0] <= counts[1] ? 0 : 1;
  await write(
    'INSERT INTO room_players(room_code,user_id,team,ready) VALUES (?,?,?,FALSE)',
    [code, userId, team],
    db,
  );
}

/** Inicia una partida solo cuando los equipos están completos y todos confirmaron. */
export async function startRoom(code: string, userId: string): Promise<string> {
  return transaction(async (db) => {
    const room = await loadRoom(code, db, true),
      players = await loadPlayers(code, db);
    if (room.host_id !== userId) throw new HttpError(403, 'Solo el anfitrión puede iniciar.');
    if (room.game_id) return room.game_id;
    const capacity = room.mode === 'duel' ? 2 : 4;
    if (players.length !== capacity || !players.every((player) => player.ready))
      throw new HttpError(409, 'Faltan jugadores o confirmaciones.');
    if (players.filter((player) => player.team === 0).length !== capacity / 2)
      throw new HttpError(409, 'Los equipos deben estar equilibrados.');
    const gameId = await createGame(parseJson(room.config), room.mode, players, db);
    await write('UPDATE rooms SET game_id=? WHERE code=?', [gameId, code], db);
    return gameId;
  });
}

/** Actualiza la confirmación o cambia a un equipo con espacio; una partida empezada es inmutable. */
export async function updateRoomPlayer(
  code: string,
  userId: string,
  action: 'ready' | 'team',
  ready?: boolean,
): Promise<void> {
  await transaction(async (db) => {
    const room = await loadRoom(code, db, true),
      players = await loadPlayers(code, db);
    const player = players.find((member) => member.id === userId);
    if (!player) throw new HttpError(403, 'No estás en esta sala.');
    if (room.game_id) throw new HttpError(409, 'La partida ya empezó.');
    if (action === 'team') {
      if (
        room.mode !== 'teams' ||
        players.filter((member) => member.team !== player.team).length >= 2
      )
        throw new HttpError(409, 'El otro equipo está completo.');
      await write(
        'UPDATE room_players SET team=?,ready=FALSE WHERE room_code=? AND user_id=?',
        [1 - player.team, code, userId],
        db,
      );
    } else
      await write(
        'UPDATE room_players SET ready=? WHERE room_code=? AND user_id=?',
        [!!ready, code, userId],
        db,
      );
  });
}

/** Sale de una sala y transfiere el rol de anfitrión; elimina salas vacías en cascada. */
export async function leaveRoom(code: string, userId: string): Promise<void> {
  await transaction(async (db) => {
    const room = await loadRoom(code, db, true);
    await write('DELETE FROM room_players WHERE room_code=? AND user_id=?', [code, userId], db);
    const players = await loadPlayers(code, db);
    if (!players.length) await write('DELETE FROM rooms WHERE code=?', [code], db);
    else if (room.host_id === userId)
      await write('UPDATE rooms SET host_id=? WHERE code=?', [players[0].id, code], db);
  });
}

/** Guarda un mensaje validado del chat después de comprobar la pertenencia a la sala. */
export async function sendRoomMessage(code: string, userId: string, text: string): Promise<void> {
  await getRoom(code, userId);
  await write('INSERT INTO room_messages(room_code,user_id,message) VALUES (?,?,?)', [
    code,
    userId,
    text,
  ]);
}
