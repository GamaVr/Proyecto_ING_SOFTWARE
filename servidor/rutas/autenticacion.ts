/** Rutas públicas de registro, inicio de sesión, recuperación y cierre de sesión. */
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { env } from '../configuracion.js';
import { query, write, transaction } from '../datos/base-datos.js';
import { HttpError } from '../errores.js';
import { createSession, hashToken, SESSION_COOKIE } from '../servicios/sesiones.js';
import {
  credentialsSchema,
  registerSchema,
  passwordSchema,
  recoveryCodeSchema,
} from '../validacion.js';
import { type User } from '../../compartido/tipos.js';

/** Crea las rutas públicas de cuenta; no exigen sesión. */
export function authRoutes(): Router {
  const router = Router();
  const authLimiter = rateLimit({
    windowMs: 15 * 60000,
    limit: env.NODE_ENV === 'test' ? 200 : 30,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: 'Demasiados intentos. Inténtalo más tarde.' },
  });
  router.post('/auth/register', authLimiter, async (req, res) => {
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
  router.post('/auth/login', authLimiter, async (req, res) => {
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
  router.post('/auth/recovery', recoveryLimiter, async (req, res) => {
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
    });
    res.json({ message: 'Contraseña actualizada. Ya puedes iniciar sesión.' });
  });
  router.post('/auth/logout', async (req, res) => {
    if (req.cookies?.[SESSION_COOKIE])
      await write('DELETE FROM sessions WHERE token_hash=?', [
        hashToken(req.cookies[SESSION_COOKIE]),
      ]);
    res.clearCookie(SESSION_COOKIE, {
      path: '/',
      sameSite: 'lax',
      secure: env.NODE_ENV === 'production',
      httpOnly: true,
    });
    res.status(204).end();
  });
  return router;
}
