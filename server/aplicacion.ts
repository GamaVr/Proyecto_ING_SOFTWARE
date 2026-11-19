/** Construye las rutas HTTP de la API y sus protecciones. */
import express, { type Request, type Response, type NextFunction } from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import cookieParser from 'cookie-parser';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { z, ZodError } from 'zod';
import { env, allowedOrigins } from './configuracion.js';
import { query, write, transaction } from './base-datos.js';
import { HttpError } from './errores.js';
import { musicRouter, prepareRecordings, serveMusicAudio, type MusicFetch } from './musica.js';
import { createSession, hashToken, requireUser } from './autenticacion.js';
import {
  credentialsSchema,
  registerSchema,
  settingsSchema,
  configSchema,
  passwordSchema,
  recoveryCodeSchema,
} from './validacion.js';
import { DEFAULT_SETTINGS, type Settings, type User } from '../shared/tipos.js';
import { parseJson } from './puntuacion.js';
import {
  getGame,
  createGame,
  answerGame,
  advanceGame,
  getAudioFile,
  abandonGame,
  getStats,
} from './partidas.js';
import {
  getRoom,
  createRoom,
  joinRoom,
  startRoom,
  updateRoomPlayer,
  leaveRoom,
  sendRoomMessage,
} from './salas.js';
import {
  getSocial,
  searchUsers,
  requestFriend,
  acceptFriend,
  removeFriend,
  inviteFriend,
  respondInvitation,
} from './social.js';

/** Construye la API con validación, sesiones, protección de origen y errores públicos consistentes. */
export function createApp(
  notify: (channel: string) => void = () => {},
  musicFetch?: MusicFetch,
): express.Express {
  const app = express();
  app.disable('x-powered-by');
  // La aplicación solo recibe tráfico detrás de un proxy local (por ejemplo, cloudflared).
  app.set('trust proxy', 1);
  app.use(
    helmet({
      contentSecurityPolicy:
        env.NODE_ENV === 'production'
          ? {
              directives: {
                defaultSrc: ["'self'"],
                scriptSrc: ["'self'"],
                styleSrc: ["'self'", "'unsafe-inline'"],
                imgSrc: ["'self'", 'data:'],
                mediaSrc: ["'self'", 'blob:'],
                connectSrc: ["'self'", 'ws:', 'wss:'],
              },
            }
          : false,
      strictTransportSecurity: env.NODE_ENV === 'production' ? undefined : false,
    }),
  );
  app.use(express.json({ limit: '12kb' }));
  app.use(cookieParser());
  app.use(
    '/api',
    rateLimit({
      windowMs: 60000,
      limit: 500,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      message: { error: 'Demasiadas solicitudes. Espera un momento.' },
    }),
  );
  // Los navegadores envían Origin en escrituras; se comprueba además de SameSite.
  app.use('/api', (req, _res, next) => {
    const origin = req.headers.origin;
    const allowed = [
      ...allowedOrigins(),
      `http://${req.headers.host}`,
      `https://${req.headers.host}`,
    ];
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && origin && !allowed.includes(origin))
      return next(new HttpError(403, 'Origen de solicitud no permitido.'));
    next();
  });
  app.get('/api/health', async (_req, res) => {
    try {
      const [row] = await query<{ version: string }>('SELECT VERSION() AS version');
      res.json({ status: 'ok', database: 'mysql', version: row.version });
    } catch {
      res.status(503).json({
        status: 'unavailable',
        error: 'No hay conexión con MySQL. Revisa .env y el servidor de base de datos.',
      });
    }
  });
  const authLimiter = rateLimit({
    windowMs: 15 * 60000,
    limit: env.NODE_ENV === 'test' ? 200 : 30,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: 'Demasiados intentos. Inténtalo más tarde.' },
  });
  app.post('/api/auth/register', authLimiter, async (req, res) => {
    const input = registerSchema.parse(req.body);
    const hash = await bcrypt.hash(input.password, 12);
    const recoveryCodeHash = await bcrypt.hash(input.recoveryCode, 12);
    const id = randomUUID();
    try {
      await write(
        'INSERT INTO users(id,name,email,password_hash,recovery_code_hash) VALUES (?,?,?,?,?)',
        [id, input.name, input.email, hash, recoveryCodeHash],
      );
    } catch (error) {
      if ((error as { code: string }).code === 'ER_DUP_ENTRY')
        throw new HttpError(409, 'Este correo ya tiene una cuenta.');
      throw error;
    }
    await createSession(res, id);
    res.status(201).json({ user: { id, name: input.name, email: input.email } });
  });
  app.post('/api/auth/verify-email', authLimiter, async (req, res) => {
    const { token } = z.object({ token: z.string().regex(/^[a-f0-9]{64}$/) }).parse(req.body);
    const tokenHash = hashToken(token);
    const [pending] = await query<{ email: string; name: string; password_hash: string }>(
      'SELECT email,name,password_hash FROM pending_registrations WHERE token_hash=? AND expires_at>?',
      [tokenHash, Date.now()],
    );
    if (!pending) throw new HttpError(400, 'El enlace venció o ya fue usado. Regístrate de nuevo.');
    const id = randomUUID();
    await transaction(async (db) => {
      const [valid] = await query<typeof pending>(
        'SELECT email,name,password_hash FROM pending_registrations WHERE token_hash=? AND expires_at>? FOR UPDATE',
        [tokenHash, Date.now()],
        db,
      );
      if (!valid) throw new HttpError(400, 'El enlace venció o ya fue usado. Regístrate de nuevo.');
      await write(
        'INSERT INTO users(id,name,email,password_hash) VALUES (?,?,?,?)',
        [id, valid.name, valid.email, valid.password_hash],
        db,
      );
      await write('DELETE FROM pending_registrations WHERE token_hash=?', [tokenHash], db);
    });
    await createSession(res, id);
    res.status(201).json({ user: { id, name: pending.name, email: pending.email } });
  });
  app.post('/api/auth/login', authLimiter, async (req, res) => {
    const input = credentialsSchema.parse(req.body);
    const [user] = await query<User & { password_hash: string }>(
      'SELECT id,name,email,password_hash FROM users WHERE email=?',
      [input.email],
    );
    if (!user || !(await bcrypt.compare(input.password, user.password_hash)))
      throw new HttpError(401, 'Correo o contraseña incorrectos.');
    await createSession(res, user.id, input.remember);
    res.json({ user: { id: user.id, name: user.name, email: user.email } });
  });
  const recoveryLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: 5,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: 'Se alcanzó el límite de solicitudes. Inténtalo más tarde.' },
  });
  const RECOVERY_MAX_FAILURES = 5,
    RECOVERY_WINDOW_MS = 60 * 60 * 1000;
  /** Intentos fallidos de recuperación por correo (una sola instancia de Node.js). */
  const recoveryFailures = new Map<string, { count: number; resetAt: number }>();
  app.post('/api/auth/recovery', recoveryLimiter, async (req, res) => {
    const input = z
      .object({
        email: z
          .email()
          .max(254)
          .transform((value) => value.trim().toLowerCase()),
        recoveryCode: recoveryCodeSchema,
        password: passwordSchema,
      })
      .parse(req.body);
    // Límite por cuenta: aunque se cambie de IP, un código corto no se puede adivinar probando.
    const now = Date.now();
    if (recoveryFailures.size > 1000)
      for (const [email, entry] of recoveryFailures)
        if (entry.resetAt <= now) recoveryFailures.delete(email);
    const attempts = recoveryFailures.get(input.email);
    if (attempts && attempts.resetAt <= now) recoveryFailures.delete(input.email);
    else if (attempts && attempts.count >= RECOVERY_MAX_FAILURES)
      throw new HttpError(429, 'Demasiados intentos para esta cuenta. Inténtalo en una hora.');
    const passwordHash = await bcrypt.hash(input.password, 12);
    await transaction(async (db) => {
      const [user] = await query<{ id: string; recovery_code_hash: string | null }>(
        'SELECT id,recovery_code_hash FROM users WHERE email=? FOR UPDATE',
        [input.email],
        db,
      );
      if (
        !user ||
        !user.recovery_code_hash ||
        !(await bcrypt.compare(input.recoveryCode, user.recovery_code_hash))
      ) {
        const current = recoveryFailures.get(input.email);
        recoveryFailures.set(input.email, {
          count: (current?.count ?? 0) + 1,
          resetAt: current?.resetAt ?? Date.now() + RECOVERY_WINDOW_MS,
        });
        throw new HttpError(400, 'El correo o el código de recuperación son incorrectos.');
      }
      recoveryFailures.delete(input.email);
      await write('UPDATE users SET password_hash=? WHERE id=?', [passwordHash, user.id], db);
      await write('DELETE FROM sessions WHERE user_id=?', [user.id], db);
      await write('DELETE FROM password_reset_tokens WHERE user_id=?', [user.id], db);
    });
    res.json({ message: 'Contraseña actualizada. Ya puedes iniciar sesión.' });
  });
  app.post('/api/auth/reset-password', recoveryLimiter, async (req, res) => {
    const input = z
      .object({ token: z.string().regex(/^[a-f0-9]{64}$/), password: passwordSchema })
      .parse(req.body);
    const tokenHash = hashToken(input.token);
    const [reset] = await query<{ user_id: string }>(
      'SELECT user_id FROM password_reset_tokens WHERE token_hash=? AND expires_at>?',
      [tokenHash, Date.now()],
    );
    if (!reset) throw new HttpError(400, 'El enlace venció o ya fue usado. Solicita uno nuevo.');
    const passwordHash = await bcrypt.hash(input.password, 12);
    await transaction(async (db) => {
      const [valid] = await query<{ user_id: string }>(
        'SELECT user_id FROM password_reset_tokens WHERE token_hash=? AND expires_at>? FOR UPDATE',
        [tokenHash, Date.now()],
        db,
      );
      if (!valid) throw new HttpError(400, 'El enlace venció o ya fue usado. Solicita uno nuevo.');
      await write('UPDATE users SET password_hash=? WHERE id=?', [passwordHash, valid.user_id], db);
      await write('DELETE FROM sessions WHERE user_id=?', [valid.user_id], db);
      await write('DELETE FROM password_reset_tokens WHERE user_id=?', [valid.user_id], db);
    });
    res.json({ message: 'Contraseña actualizada. Ya puedes iniciar sesión.' });
  });
  app.post('/api/auth/logout', async (req, res) => {
    if (req.cookies?.beat_session)
      await write('DELETE FROM sessions WHERE token_hash=?', [hashToken(req.cookies.beat_session)]);
    res.clearCookie('beat_session', {
      path: '/',
      sameSite: 'lax',
      secure: env.NODE_ENV === 'production',
      httpOnly: true,
    });
    res.status(204).end();
  });
  app.use('/api', requireUser);
  app.use('/api/music', musicRouter(musicFetch));
  app.put('/api/me/recovery-code', async (req, res) => {
    const input = z
      .object({ currentPassword: passwordSchema, recoveryCode: recoveryCodeSchema })
      .parse(req.body);
    const [user] = await query<{ password_hash: string }>(
      'SELECT password_hash FROM users WHERE id=?',
      [req.user!.id],
    );
    if (!user || !(await bcrypt.compare(input.currentPassword, user.password_hash)))
      throw new HttpError(401, 'La contraseña actual es incorrecta.');
    const recoveryCodeHash = await bcrypt.hash(input.recoveryCode, 12);
    await write('UPDATE users SET recovery_code_hash=? WHERE id=?', [
      recoveryCodeHash,
      req.user!.id,
    ]);
    res.json({ message: 'Código de recuperación actualizado.' });
  });
  app.get('/api/me', async (req, res) => {
    res.json({ user: req.user, stats: await getStats(req.user!.id) });
  });
  app.put('/api/me', async (req, res) => {
    const { name } = z.object({ name: z.string().trim().min(2).max(30) }).parse(req.body);
    await write('UPDATE users SET name=? WHERE id=?', [name, req.user!.id]);
    res.json({ user: { ...req.user, name } });
  });
  app.put('/api/me/password', async (req, res) => {
    const input = z
      .object({ currentPassword: z.string().max(72), newPassword: passwordSchema })
      .parse(req.body);
    const [user] = await query<{ password_hash: string }>(
      'SELECT password_hash FROM users WHERE id=?',
      [req.user!.id],
    );
    if (!(await bcrypt.compare(input.currentPassword, user.password_hash)))
      throw new HttpError(401, 'Tu contraseña actual no es correcta.');
    const hash = await bcrypt.hash(input.newPassword, 12);
    await transaction(async (db) => {
      await write('UPDATE users SET password_hash=? WHERE id=?', [hash, req.user!.id], db);
      await write('DELETE FROM sessions WHERE user_id=?', [req.user!.id], db);
    });
    await createSession(res, req.user!.id);
    res.json({ ok: true });
  });
  app.get('/api/settings', async (req, res) => {
    const [row] = await query<{ settings: string | Settings }>(
      'SELECT settings FROM user_settings WHERE user_id=?',
      [req.user!.id],
    );
    res.json({
      settings: row
        ? { ...DEFAULT_SETTINGS, ...parseJson<Settings>(row.settings) }
        : DEFAULT_SETTINGS,
    });
  });
  app.put('/api/settings', async (req, res) => {
    const settings = settingsSchema.parse(req.body);
    await write(
      'INSERT INTO user_settings(user_id,settings) VALUES (?,?) ON DUPLICATE KEY UPDATE settings=VALUES(settings)',
      [req.user!.id, JSON.stringify(settings)],
    );
    res.json({ settings });
  });
  // Amigos e invitaciones permanecen dentro de la aplicación y requieren una sesión.
  app.get('/api/social', async (req, res) => {
    res.json(await getSocial(req.user!.id));
  });
  app.get('/api/users/search', async (req, res) => {
    const term = z
      .string()
      .trim()
      .min(2, 'Escribe al menos 2 caracteres.')
      .max(254)
      .parse(req.query.q);
    res.json({ users: await searchUsers(req.user!.id, term) });
  });
  app.post('/api/friends', async (req, res) => {
    const { userId } = z.object({ userId: z.uuid() }).parse(req.body);
    await requestFriend(req.user!.id, userId);
    notify(`user:${userId}`);
    notify(`user:${req.user!.id}`);
    res.status(201).json(await getSocial(req.user!.id));
  });
  app.post('/api/friends/:userId/accept', async (req, res) => {
    const userId = z.uuid().parse(req.params.userId);
    await acceptFriend(req.user!.id, userId);
    notify(`user:${userId}`);
    notify(`user:${req.user!.id}`);
    res.json(await getSocial(req.user!.id));
  });
  app.delete('/api/friends/:userId', async (req, res) => {
    const userId = z.uuid().parse(req.params.userId);
    await removeFriend(req.user!.id, userId);
    notify(`user:${userId}`);
    notify(`user:${req.user!.id}`);
    res.status(204).end();
  });
  app.post('/api/rooms/:code/invitations', async (req, res) => {
    const code = z
      .string()
      .regex(/^[A-Z0-9]{6}$/)
      .parse(req.params.code);
    const { userId } = z.object({ userId: z.uuid() }).parse(req.body);
    await inviteFriend(code, req.user!.id, userId);
    notify(`user:${userId}`);
    notify(`user:${req.user!.id}`);
    res.status(201).json({ ok: true });
  });
  app.post('/api/invitations/:id/respond', async (req, res) => {
    const id = z.uuid().parse(req.params.id),
      { accept } = z.object({ accept: z.boolean() }).parse(req.body);
    const result = await respondInvitation(id, req.user!.id, accept);
    notify(`room:${result.code}`);
    notify(`user:${result.senderId}`);
    notify(`user:${req.user!.id}`);
    res.json({ code: result.code });
  });
  app.post('/api/games', async (req, res) => {
    const config = configSchema.parse(req.body);
    await prepareRecordings(musicFetch);
    const id = await transaction(async (db) =>
      createGame(config, 'solo', [{ id: req.user!.id, team: 0 }], db),
    );
    res.status(201).json(await getGame(id, req.user!.id));
  });
  app.get('/api/games/:id', async (req, res) => {
    res.json(await getGame(String(req.params.id), req.user!.id));
  });
  app.get('/api/games/:id/audio', async (req, res) => {
    const media = await getAudioFile(String(req.params.id), req.user!.id);
    await serveMusicAudio(media, req, res, musicFetch);
  });
  app.post('/api/games/:id/answer', async (req, res) => {
    const input = z
      .object({ answer: z.string().trim().max(200), round: z.number().int().min(0) })
      .parse(req.body);
    const id = String(req.params.id),
      game = await getGame(id, req.user!.id);
    if (game.round !== input.round)
      throw new HttpError(409, 'La ronda cambió. Actualiza la partida.');
    await answerGame(id, req.user!.id, input.answer, input.round);
    notify(`game:${id}`);
    res.json(await getGame(id, req.user!.id));
  });
  app.post('/api/games/:id/next', async (req, res) => {
    const id = String(req.params.id),
      game = await getGame(id, req.user!.id);
    if (game.mode !== 'solo')
      throw new HttpError(403, 'Las rondas multijugador avanzan automáticamente.');
    const { round } = z.object({ round: z.number().int().min(0) }).parse(req.body);
    if (round !== game.round) throw new HttpError(409, 'Esta ronda ya avanzó.');
    await advanceGame(id, req.user!.id, round);
    res.json(await getGame(id, req.user!.id));
  });
  app.post('/api/games/:id/abandon', async (req, res) => {
    const id = String(req.params.id);
    await abandonGame(id, req.user!.id);
    notify(`game:${id}`);
    res.status(204).end();
  });
  app.post('/api/rooms', async (req, res) => {
    const input = z
      .object({
        name: z.string().trim().min(2).max(60),
        mode: z.enum(['duel', 'teams']),
        config: configSchema,
      })
      .parse(req.body);
    const code = await createRoom(req.user!.id, input.name, input.mode, input.config);
    res.status(201).json(await getRoom(code, req.user!.id));
  });
  app.post('/api/rooms/join', async (req, res) => {
    const { code } = z
      .object({
        code: z
          .string()
          .trim()
          .toUpperCase()
          .regex(/^[A-Z0-9]{6}$/, 'El código debe tener 6 caracteres.'),
      })
      .parse(req.body);
    await joinRoom(code, req.user!.id);
    const room = await getRoom(code, req.user!.id);
    notify(`room:${code}`);
    res.json(room);
  });
  app.get('/api/rooms/:code', async (req, res) => {
    res.json(await getRoom(String(req.params.code), req.user!.id));
  });
  app.patch('/api/rooms/:code/player', async (req, res) => {
    const input = z
        .object({ action: z.enum(['ready', 'team']), ready: z.boolean().optional() })
        .parse(req.body),
      code = String(req.params.code);
    await updateRoomPlayer(code, req.user!.id, input.action, input.ready);
    notify(`room:${code}`);
    res.json(await getRoom(code, req.user!.id));
  });
  app.post('/api/rooms/:code/start', async (req, res) => {
    await prepareRecordings(musicFetch);
    const code = String(req.params.code);
    const gameId = await startRoom(code, req.user!.id);
    notify(`room:${code}`);
    res.json({ gameId });
  });
  app.post('/api/rooms/:code/messages', async (req, res) => {
    const { text } = z.object({ text: z.string().trim().min(1).max(300) }).parse(req.body),
      code = String(req.params.code);
    await sendRoomMessage(code, req.user!.id, text);
    notify(`room:${code}`);
    res.status(201).json({ ok: true });
  });
  app.post('/api/rooms/:code/leave', async (req, res) => {
    const code = String(req.params.code);
    await leaveRoom(code, req.user!.id);
    notify(`room:${code}`);
    res.status(204).end();
  });
  app.use('/api', (_req, _res, next) => next(new HttpError(404, 'Ruta no encontrada.')));
  if (existsSync(path.resolve('dist/index.html'))) {
    app.use(express.static(path.resolve('dist')));
    app.get('/{*path}', (_req, res) => res.sendFile(path.resolve('dist/index.html')));
  }
  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (res.headersSent) {
      _next(error);
      return;
    }
    if (error instanceof ZodError) {
      res.status(422).json({ error: error.issues[0]?.message || 'Revisa los datos enviados.' });
      return;
    }
    if (error instanceof HttpError) {
      res.status(error.status).json({ error: error.message });
      return;
    }
    if (error instanceof SyntaxError) {
      res.status(400).json({ error: 'JSON inválido.' });
      return;
    }
    const code = (error as { code?: string }).code;
    if (
      code &&
      ['ECONNREFUSED', 'EACCES', 'ER_ACCESS_DENIED_ERROR', 'ER_BAD_DB_ERROR'].includes(code)
    ) {
      res
        .status(503)
        .json({ error: 'MySQL no está disponible. Revisa la configuración del servidor.' });
      return;
    }
    console.error('Error interno:', error instanceof Error ? error.message : 'desconocido');
    res.status(500).json({ error: 'Ocurrió un error en el servidor. Vuelve a intentarlo.' });
  });
  return app;
}
