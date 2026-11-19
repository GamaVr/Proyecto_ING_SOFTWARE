/** Rutas del perfil propio: nombre, contraseña, código de recuperación y preferencias. */
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { query, write, transaction } from '../datos/base-datos.js';
import { HttpError } from '../errores.js';
import { createSession } from '../servicios/sesiones.js';
import { settingsSchema, passwordSchema, recoveryCodeSchema } from '../validacion.js';
import { DEFAULT_SETTINGS, type Settings } from '../../compartido/tipos.js';
import { parseJson } from '../servicios/puntuacion.js';
import { getStats } from '../servicios/partidas.js';

/** Crea las rutas del perfil de la persona con sesión iniciada. */
export function profileRoutes(): Router {
  const router = Router();
  router.put('/me/recovery-code', async (req, res) => {
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
  router.get('/me', async (req, res) => {
    res.json({ user: req.user, stats: await getStats(req.user!.id) });
  });
  router.put('/me', async (req, res) => {
    const { name } = z.object({ name: z.string().trim().min(2).max(30) }).parse(req.body);
    await write('UPDATE users SET name=? WHERE id=?', [name, req.user!.id]);
    res.json({ user: { ...req.user, name } });
  });
  router.put('/me/password', async (req, res) => {
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
  router.get('/settings', async (req, res) => {
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
  router.put('/settings', async (req, res) => {
    const settings = settingsSchema.parse(req.body);
    await write(
      'INSERT INTO user_settings(user_id,settings) VALUES (?,?) ON DUPLICATE KEY UPDATE settings=VALUES(settings)',
      [req.user!.id, JSON.stringify(settings)],
    );
    res.json({ settings });
  });
  return router;
}
