/** Rutas públicas de registro, inicio de sesión, recuperación y cierre de sesión. */
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { entorno } from '../configuracion.js';
import { consultar, escribir, transaccion } from '../datos/base-datos.js';
import { ErrorHttp } from '../errores.js';
import { crearSesion, hashearToken, COOKIE_SESION } from '../servicios/sesiones.js';
import {
  esquemaCredenciales,
  esquemaRegistro,
  esquemaContrasena,
  esquemaCodigoRecuperacion,
} from '../validacion.js';
import { type Usuario } from '../../compartido/tipos.js';

/** Crea las rutas públicas de cuenta; no exigen sesión. */
export function rutasAutenticacion(): Router {
  const enrutador = Router();
  const limitadorAcceso = rateLimit({
    windowMs: 15 * 60000,
    limit: entorno.NODE_ENV === 'test' ? 200 : 30,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: 'Demasiados intentos. Inténtalo más tarde.' },
  });
  enrutador.post('/autenticacion/registro', limitadorAcceso, async (req, res) => {
    const entrada = esquemaRegistro.parse(req.body);
    const hash = await bcrypt.hash(entrada.contrasena, 12);
    const hashCodigoRecuperacion = await bcrypt.hash(entrada.codigoRecuperacion, 12);
    const id = randomUUID();
    try {
      await escribir(
        'INSERT INTO usuarios(id,nombre,correo,hash_contrasena,hash_codigo_recuperacion) VALUES (?,?,?,?,?)',
        [id, entrada.nombre, entrada.correo, hash, hashCodigoRecuperacion],
      );
    } catch (error) {
      if ((error as { code: string }).code === 'ER_DUP_ENTRY')
        throw new ErrorHttp(409, 'Este correo ya tiene una cuenta.');
      throw error;
    }
    await crearSesion(res, id);
    res.status(201).json({ usuario: { id, nombre: entrada.nombre, correo: entrada.correo } });
  });
  enrutador.post('/autenticacion/iniciar-sesion', limitadorAcceso, async (req, res) => {
    const entrada = esquemaCredenciales.parse(req.body);
    const [usuario] = await consultar<Usuario & { hash_contrasena: string }>(
      'SELECT id,nombre,correo,hash_contrasena FROM usuarios WHERE correo=?',
      [entrada.correo],
    );
    if (!usuario || !(await bcrypt.compare(entrada.contrasena, usuario.hash_contrasena)))
      throw new ErrorHttp(401, 'Correo o contraseña incorrectos.');
    await crearSesion(res, usuario.id, entrada.recordar);
    res.json({ usuario: { id: usuario.id, nombre: usuario.nombre, correo: usuario.correo } });
  });
  const limitadorRecuperacion = rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: 5,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: 'Se alcanzó el límite de solicitudes. Inténtalo más tarde.' },
  });
  const MAXIMO_FALLOS_RECUPERACION = 5,
    VENTANA_RECUPERACION_MS = 60 * 60 * 1000;
  /** Intentos fallidos de recuperación por correo (una sola instancia de Node.js). */
  const fallosRecuperacion = new Map<string, { cantidad: number; reiniciaEn: number }>();
  enrutador.post('/autenticacion/recuperar', limitadorRecuperacion, async (req, res) => {
    const entrada = z
      .object({
        correo: z
          .email()
          .max(254)
          .transform((valor) => valor.trim().toLowerCase()),
        codigoRecuperacion: esquemaCodigoRecuperacion,
        contrasena: esquemaContrasena,
      })
      .parse(req.body);
    // Límite por cuenta: aunque se cambie de IP, un código corto no se puede adivinar probando.
    const ahora = Date.now();
    if (fallosRecuperacion.size > 1000)
      for (const [correo, registro] of fallosRecuperacion)
        if (registro.reiniciaEn <= ahora) fallosRecuperacion.delete(correo);
    const intentos = fallosRecuperacion.get(entrada.correo);
    if (intentos && intentos.reiniciaEn <= ahora) fallosRecuperacion.delete(entrada.correo);
    else if (intentos && intentos.cantidad >= MAXIMO_FALLOS_RECUPERACION)
      throw new ErrorHttp(429, 'Demasiados intentos para esta cuenta. Inténtalo en una hora.');
    const hashContrasena = await bcrypt.hash(entrada.contrasena, 12);
    await transaccion(async (bd) => {
      const [usuario] = await consultar<{ id: string; hash_codigo_recuperacion: string | null }>(
        'SELECT id,hash_codigo_recuperacion FROM usuarios WHERE correo=? FOR UPDATE',
        [entrada.correo],
        bd,
      );
      if (
        !usuario ||
        !usuario.hash_codigo_recuperacion ||
        !(await bcrypt.compare(entrada.codigoRecuperacion, usuario.hash_codigo_recuperacion))
      ) {
        const actual = fallosRecuperacion.get(entrada.correo);
        fallosRecuperacion.set(entrada.correo, {
          cantidad: (actual?.cantidad ?? 0) + 1,
          reiniciaEn: actual?.reiniciaEn ?? Date.now() + VENTANA_RECUPERACION_MS,
        });
        throw new ErrorHttp(400, 'El correo o el código de recuperación son incorrectos.');
      }
      fallosRecuperacion.delete(entrada.correo);
      await escribir(
        'UPDATE usuarios SET hash_contrasena=? WHERE id=?',
        [hashContrasena, usuario.id],
        bd,
      );
      await escribir('DELETE FROM sesiones WHERE usuario_id=?', [usuario.id], bd);
    });
    res.json({ mensaje: 'Contraseña actualizada. Ya puedes iniciar sesión.' });
  });
  enrutador.post('/autenticacion/cerrar-sesion', async (req, res) => {
    if (req.cookies?.[COOKIE_SESION])
      await escribir('DELETE FROM sesiones WHERE hash_token=?', [
        hashearToken(req.cookies[COOKIE_SESION]),
      ]);
    res.clearCookie(COOKIE_SESION, {
      path: '/',
      sameSite: 'lax',
      secure: entorno.NODE_ENV === 'production',
      httpOnly: true,
    });
    res.status(204).end();
  });
  return enrutador;
}
