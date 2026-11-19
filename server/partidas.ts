/** Controla rondas, respuestas, pistas, resultados y estadísticas. */
import { randomUUID } from 'node:crypto';
import { query, write, transaction, pool, type Database } from './base-datos.js';
import { calculatePoints, isCorrectAnswer, parseJson, shuffled } from './puntuacion.js';
import { HttpError } from './errores.js';
import { REMOVED_MUSIC_GENRES } from '../shared/musica.js';
import type { GameConfig, GameSnapshot, Player, RoundResult, Stats } from '../shared/tipos.js';

interface GameRow {
  id: string;
  mode: GameSnapshot['mode'];
  status: GameSnapshot['status'];
  config: GameConfig | string;
  song_ids: string[] | string;
  current_round: number;
  round_started_at: string;
}
interface SongRow {
  id: string;
  title: string;
  artist: string;
  aliases: string[] | string;
  release_year: number;
  audio_url: string | null;
  clip_start: number;
  duration: number;
  source: 'builtin' | 'local' | 'jamendo' | 'audius' | 'deezer';
}

/** Carga una partida y opcionalmente bloquea su fila durante una transacción. */
async function loadGame(id: string, db: Database, lock = false): Promise<GameRow> {
  const [game] = await query<GameRow>(
    `SELECT * FROM games WHERE id=?${lock ? ' FOR UPDATE' : ''}`,
    [id],
    db,
  );
  if (!game) throw new HttpError(404, 'No encontramos esta partida.');
  return game;
}

/** Comprueba que el usuario participa antes de entregar datos o modificar una partida. */
async function membership(id: string, userId: string, db: Database): Promise<void> {
  const [member] = await query<{ id: string }>(
    'SELECT user_id AS id FROM game_players WHERE game_id=? AND user_id=?',
    [id, userId],
    db,
  );
  if (!member) throw new HttpError(403, 'No participas en esta partida.');
}

/** Recupera exclusivamente la canción de la ronda actual desde el catálogo privado. */
async function currentSong(game: GameRow, db: Database): Promise<SongRow> {
  const ids = parseJson<string[]>(game.song_ids);
  const [song] = await query<SongRow>(
    "SELECT s.*,m.audio_url,COALESCE(m.clip_start,0) AS clip_start,COALESCE(m.duration,12) AS duration,COALESCE(m.source,'builtin') AS source FROM songs s LEFT JOIN song_media m ON m.song_id=s.id WHERE s.id=?",
    [ids[Math.min(game.current_round, ids.length - 1)]],
    db,
  );
  if (!song) throw new HttpError(409, 'El catálogo de esta partida ya no está disponible.');
  return song;
}

/** Crea una partida persistida y sus participantes sin enviar títulos ni identificadores de canciones al navegador. */
export async function createGame(
  config: GameConfig,
  mode: GameSnapshot['mode'],
  players: { id: string; team: number }[],
  db: Database,
): Promise<string> {
  const songs = await query<{ id: string }>(
    `SELECT s.id FROM songs s JOIN song_media m ON m.song_id=s.id WHERE m.enabled=1 AND m.source='deezer' AND s.genre NOT IN (?,?,?) AND (?='Todas' OR s.genre=?)`,
    [...REMOVED_MUSIC_GENRES, config.genre, config.genre],
    db,
  );
  if (songs.length < config.rounds)
    throw new HttpError(
      422,
      'No hay suficientes canciones oficiales para esos filtros. Elige otro género o menos rondas.',
    );
  const id = randomUUID();
  await write(
    'INSERT INTO games(id,mode,config,song_ids,round_started_at) VALUES (?,?,?,?,?)',
    [
      id,
      mode,
      JSON.stringify(config),
      JSON.stringify(
        shuffled(songs)
          .slice(0, config.rounds)
          .map((song) => song.id),
      ),
      Date.now() + 1500,
    ],
    db,
  );
  for (const player of players)
    await write(
      'INSERT INTO game_players(game_id,user_id,team) VALUES (?,?,?)',
      [id, player.id, player.team],
      db,
    );
  return id;
}

/** Compone un estado autorizado; solo revela respuestas propias o de rondas ya terminadas. */
export async function getGame(id: string, userId: string): Promise<GameSnapshot> {
  const game = await loadGame(id, pool);
  await membership(id, userId, pool);
  const players = await query<Player>(
    'SELECT u.id,u.name,gp.team,COALESCE(SUM(a.points),0) AS score,TRUE AS ready FROM game_players gp JOIN users u ON u.id=gp.user_id LEFT JOIN answers a ON a.game_id=gp.game_id AND a.user_id=gp.user_id WHERE gp.game_id=? GROUP BY u.id,u.name,gp.team',
    [id],
  );
  const config = parseJson<GameConfig>(game.config),
    ids = parseJson<string[]>(game.song_ids);
  const results = await query<RoundResult & { elapsed: number }>(
    "SELECT a.round_index AS round,s.title,s.artist,a.answer,a.correct,a.points,a.elapsed_ms AS elapsed,a.user_id AS userId,m.source_url AS sourceUrl,m.license_url AS licenseUrl FROM answers a JOIN songs s ON s.id=JSON_UNQUOTE(JSON_EXTRACT(?,CONCAT('$[',a.round_index,']'))) LEFT JOIN song_media m ON m.song_id=s.id WHERE a.game_id=? AND (a.user_id=? OR a.round_index<? OR ?<>'playing') ORDER BY a.round_index,a.user_id",
    [JSON.stringify(ids), id, userId, game.current_round, game.status],
  );
  const [answer] = await query<{ n: number }>(
    'SELECT COUNT(*) AS n FROM answers WHERE game_id=? AND user_id=? AND round_index=?',
    [id, userId, game.current_round],
  );
  const media = await currentSong(game, pool);
  return {
    id,
    mode: game.mode,
    status: game.status,
    config,
    round: game.current_round,
    total: ids.length,
    startedAt: Number(game.round_started_at),
    serverNow: Date.now(),
    players: players.map((player) => ({ ...player, score: Number(player.score), ready: true })),
    results: results.map((result) => ({
      ...result,
      correct: !!result.correct,
      elapsed: Number(result.elapsed),
    })),
    answered: answer.n > 0,
    audioStart: Number(media.clip_start),
    audioDuration: Math.min(12, media.duration),
    audioSource: media.source,
  };
}

/** Evalúa una respuesta una sola vez bajo bloqueo de fila y usa únicamente el reloj del servidor. */
export async function answerGame(
  id: string,
  userId: string,
  answer: string,
  expectedRound: number,
): Promise<void> {
  await transaction(async (db) => {
    const game = await loadGame(id, db, true);
    await membership(id, userId, db);
    if (game.status !== 'playing') throw new HttpError(409, 'La partida ya terminó.');
    if (game.current_round !== expectedRound)
      throw new HttpError(409, 'La ronda cambió. Actualiza la partida.');
    if (Date.now() < Number(game.round_started_at))
      throw new HttpError(409, 'La ronda está a punto de comenzar.');
    const [existing] = await query(
      'SELECT 1 FROM answers WHERE game_id=? AND user_id=? AND round_index=?',
      [id, userId, game.current_round],
      db,
    );
    if (existing) throw new HttpError(409, 'Ya enviaste una respuesta en esta ronda.');
    const config = parseJson<GameConfig>(game.config),
      song = await currentSong(game, db);
    const elapsed = Math.max(0, Date.now() - Number(game.round_started_at));
    const correct =
      elapsed <= config.seconds * 1000 &&
      isCorrectAnswer(answer, song.title, parseJson(song.aliases), song.artist, config.answerMode);
    await write(
      'INSERT INTO answers(game_id,user_id,round_index,answer,correct,points,elapsed_ms) VALUES (?,?,?,?,?,?,?)',
      [
        id,
        userId,
        game.current_round,
        answer,
        correct,
        calculatePoints(correct, elapsed, config),
        Math.min(elapsed, 2147483647),
      ],
      db,
    );
  });
}

/** Avanza una ronda finalizada; en multijugador completa los tiempos agotados y sincroniza a todos. */
export async function advanceGame(
  id: string,
  userId?: string,
  expectedRound?: number,
): Promise<void> {
  await transaction(async (db) => {
    const game = await loadGame(id, db, true);
    if (userId) await membership(id, userId, db);
    if (game.status !== 'playing') return;
    if (expectedRound !== undefined && game.current_round !== expectedRound)
      throw new HttpError(409, 'Esta ronda ya avanzó.');
    const config = parseJson<GameConfig>(game.config);
    const [counts] = await query<{ players: number; answered: number; last: number }>(
      'SELECT (SELECT COUNT(*) FROM game_players WHERE game_id=?) AS players, COUNT(*) AS answered,COALESCE(MAX(elapsed_ms),0) AS last FROM answers WHERE game_id=? AND round_index=?',
      [id, id, game.current_round],
      db,
    );
    const expired = Date.now() >= Number(game.round_started_at) + config.seconds * 1000;
    if (counts.answered < counts.players && !expired) {
      if (userId) throw new HttpError(409, 'Responde o espera a que termine la ronda.');
      return;
    }
    if (
      !userId &&
      Date.now() <
        Number(game.round_started_at) +
          (expired ? config.seconds * 1000 : Number(counts.last)) +
          2200
    )
      return;
    await write(
      "INSERT IGNORE INTO answers(game_id,user_id,round_index,answer,correct,points,elapsed_ms) SELECT game_id,user_id,?,'',FALSE,0,? FROM game_players WHERE game_id=?",
      [game.current_round, config.seconds * 1000, id],
      db,
    );
    const next = game.current_round + 1,
      finished = next >= parseJson<string[]>(game.song_ids).length;
    await write(
      'UPDATE games SET current_round=?,status=?,round_started_at=? WHERE id=?',
      [
        finished ? game.current_round : next,
        finished ? 'finished' : 'playing',
        Date.now() + 1500,
        id,
      ],
      db,
    );
  });
}

/** Resuelve un audio privado después de verificar la participación en la partida. */
export async function getAudioFile(id: string, userId: string): Promise<{ url: string | null }> {
  const game = await loadGame(id, pool);
  await membership(id, userId, pool);
  if (game.status !== 'playing') throw new HttpError(409, 'La partida ya terminó.');
  const song = await currentSong(game, pool);
  if (song.source !== 'deezer')
    throw new HttpError(
      409,
      'Esta partida usa el catálogo anterior. Crea una partida nueva para escuchar las canciones oficiales.',
    );
  return { url: song.audio_url };
}

/** Cancela la partida de sus participantes conservando el historial en MySQL. */
export async function abandonGame(id: string, userId: string): Promise<void> {
  await transaction(async (db) => {
    await loadGame(id, db, true);
    await membership(id, userId, db);
    await write("UPDATE games SET status='abandoned' WHERE id=? AND status='playing'", [id], db);
  });
}

/** Calcula estadísticas reales usando únicamente partidas completadas. */
export async function getStats(userId: string): Promise<Stats> {
  const scores = await query<{ score: number; game_id: string }>(
    "SELECT gp.game_id,COALESCE(SUM(a.points),0) AS score FROM game_players gp JOIN games g ON g.id=gp.game_id LEFT JOIN answers a ON a.game_id=gp.game_id AND a.user_id=gp.user_id WHERE gp.user_id=? AND g.status='finished' GROUP BY gp.game_id",
    [userId],
  );
  const answers = await query<{ game_id: string; correct: number }>(
    "SELECT a.game_id,a.correct FROM answers a JOIN games g ON g.id=a.game_id WHERE a.user_id=? AND g.status='finished' ORDER BY g.created_at,a.game_id,a.round_index",
    [userId],
  );
  let streak = 0,
    bestStreak = 0,
    previous = '';
  for (const answer of answers) {
    if (previous !== answer.game_id) streak = 0;
    streak = answer.correct ? streak + 1 : 0;
    bestStreak = Math.max(bestStreak, streak);
    previous = answer.game_id;
  }
  return {
    played: scores.length,
    bestStreak,
    bestScore: Math.max(0, ...scores.map((score) => Number(score.score))),
  };
}
