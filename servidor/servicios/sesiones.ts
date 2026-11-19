/** Gestiona sesiones, cookies y acceso de usuarios. */
import { randomBytes, createHash } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { consultar, escribir } from '../datos/base-datos.js';
import { entorno } from '../configuracion.js';
import { ErrorHttp } from '../errores.js';
import type { Usuario } from '../../compartido/tipos.js';

declare global {
  namespace Express {
    interface Request {
      usuario?: Usuario;
    }
  }
}

/** Nombre de la cookie HttpOnly que guarda el token de sesión. */
export const COOKIE_SESION = 'beat_sesion';

/** Hashea el token de sesión para que MySQL nunca almacene la cookie en claro. */
export function hashearToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Resuelve una sesión vigente de MySQL y devuelve únicamente el perfil público. */
export async function buscarSesion(token?: string): Promise<Usuario | undefined> {
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return undefined;
  const [usuario] = await consultar<Usuario>(
    'SELECT u.id,u.nombre,u.correo FROM sesiones s JOIN usuarios u ON u.id=s.usuario_id WHERE s.hash_token=? AND s.expira_en>?',
    [hashearToken(token), Date.now()],
  );
  return usuario;
}

/** Exige una sesión válida antes de acceder a perfiles, salas o partidas. */
export async function exigirUsuario(
  req: Request,
  _res: Response,
  siguiente: NextFunction,
): Promise<void> {
  try {
    req.usuario = await buscarSesion(req.cookies?.[COOKIE_SESION]);
    if (!req.usuario) throw new ErrorHttp(401, 'Inicia sesión para continuar.');
    siguiente();
  } catch (error) {
    siguiente(error);
  }
}

/** Crea una sesión aleatoria y una cookie HttpOnly; recordar extiende su vigencia a 30 días. */
export async function crearSesion(
  res: Response,
  usuarioId: string,
  recordar = false,
): Promise<void> {
  const token = randomBytes(32).toString('hex');
  const duracionMaxima = (recordar ? 30 : 1) * 86400000;
  await escribir('DELETE FROM sesiones WHERE expira_en<?', [Date.now()]);
  await escribir('INSERT INTO sesiones(hash_token,usuario_id,expira_en) VALUES (?,?,?)', [
    hashearToken(token),
    usuarioId,
    Date.now() + duracionMaxima,
  ]);
  res.cookie(COOKIE_SESION, token, {
    httpOnly: true,
    secure: entorno.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    ...(recordar ? { maxAge: duracionMaxima } : {}),
  });
}
