/** Gestiona sesiones, cookies y acceso de usuarios. */
import { randomBytes, createHash } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { query, write } from './base-datos.js';
import { env } from './configuracion.js';
import { HttpError } from './errores.js';
import type { User } from '../shared/tipos.js';

declare global {
  namespace Express {
    interface Request {
      user?: User;
    }
  }
}

/** Hashea el token de sesión para que MySQL nunca almacene la cookie en claro. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Resuelve una sesión vigente de MySQL y devuelve únicamente el perfil público. */
export async function findSession(token?: string): Promise<User | undefined> {
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return undefined;
  const [user] = await query<User>(
    'SELECT u.id,u.name,u.email FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?',
    [hashToken(token), Date.now()],
  );
  return user;
}

/** Exige una sesión válida antes de acceder a perfiles, salas o partidas. */
export async function requireUser(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    req.user = await findSession(req.cookies?.beat_session);
    if (!req.user) throw new HttpError(401, 'Inicia sesión para continuar.');
    next();
  } catch (error) {
    next(error);
  }
}

/** Crea una sesión aleatoria y una cookie HttpOnly; recordar extiende su vigencia a 30 días. */
export async function createSession(
  res: Response,
  userId: string,
  remember = false,
): Promise<void> {
  const token = randomBytes(32).toString('hex');
  const maxAge = (remember ? 30 : 1) * 86400000;
  await write('DELETE FROM sessions WHERE expires_at<?', [Date.now()]);
  await write('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES (?,?,?)', [
    hashToken(token),
    userId,
    Date.now() + maxAge,
  ]);
  res.cookie('beat_session', token, {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    ...(remember ? { maxAge } : {}),
  });
}
