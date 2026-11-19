/** Rutas del perfil propio: nombre, contraseña, código de recuperación y preferencias. */
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { consultar, escribir, transaccion } from '../datos/base-datos.js';
import { ErrorHttp } from '../errores.js';
import { crearSesion } from '../servicios/sesiones.js';
import {
  esquemaPreferencias,
  esquemaContrasena,
  esquemaCodigoRecuperacion,
} from '../validacion.js';
import { PREFERENCIAS_PREDETERMINADAS, type Preferencias } from '../../compartido/tipos.js';
import { interpretarJson } from '../servicios/puntuacion.js';
import { obtenerEstadisticas } from '../servicios/partidas.js';

/** Crea las rutas del perfil de la persona con sesión iniciada. */
export function rutasPerfil(): Router {
  const enrutador = Router();
  enrutador.put('/perfil/codigo-recuperacion', async (req, res) => {
    const entrada = z
      .object({
        contrasenaActual: esquemaContrasena,
        codigoRecuperacion: esquemaCodigoRecuperacion,
      })
      .parse(req.body);
    const [usuario] = await consultar<{ hash_contrasena: string }>(
      'SELECT hash_contrasena FROM usuarios WHERE id=?',
      [req.usuario!.id],
    );
    if (!usuario || !(await bcrypt.compare(entrada.contrasenaActual, usuario.hash_contrasena)))
      throw new ErrorHttp(401, 'La contraseña actual es incorrecta.');
    const hashCodigoRecuperacion = await bcrypt.hash(entrada.codigoRecuperacion, 12);
    await escribir('UPDATE usuarios SET hash_codigo_recuperacion=? WHERE id=?', [
      hashCodigoRecuperacion,
      req.usuario!.id,
    ]);
    res.json({ mensaje: 'Código de recuperación actualizado.' });
  });
  enrutador.get('/perfil', async (req, res) => {
    res.json({ usuario: req.usuario, estadisticas: await obtenerEstadisticas(req.usuario!.id) });
  });
  enrutador.put('/perfil', async (req, res) => {
    const { nombre } = z.object({ nombre: z.string().trim().min(2).max(30) }).parse(req.body);
    await escribir('UPDATE usuarios SET nombre=? WHERE id=?', [nombre, req.usuario!.id]);
    res.json({ usuario: { ...req.usuario, nombre } });
  });
  enrutador.put('/perfil/contrasena', async (req, res) => {
    const entrada = z
      .object({ contrasenaActual: z.string().max(72), contrasenaNueva: esquemaContrasena })
      .parse(req.body);
    const [usuario] = await consultar<{ hash_contrasena: string }>(
      'SELECT hash_contrasena FROM usuarios WHERE id=?',
      [req.usuario!.id],
    );
    if (!(await bcrypt.compare(entrada.contrasenaActual, usuario.hash_contrasena)))
      throw new ErrorHttp(401, 'Tu contraseña actual no es correcta.');
    const hash = await bcrypt.hash(entrada.contrasenaNueva, 12);
    await transaccion(async (bd) => {
      await escribir(
        'UPDATE usuarios SET hash_contrasena=? WHERE id=?',
        [hash, req.usuario!.id],
        bd,
      );
      await escribir('DELETE FROM sesiones WHERE usuario_id=?', [req.usuario!.id], bd);
    });
    await crearSesion(res, req.usuario!.id);
    res.json({ ok: true });
  });
  enrutador.get('/preferencias', async (req, res) => {
    const [fila] = await consultar<{ preferencias: string | Preferencias }>(
      'SELECT preferencias FROM preferencias_usuario WHERE usuario_id=?',
      [req.usuario!.id],
    );
    res.json({
      preferencias: fila
        ? { ...PREFERENCIAS_PREDETERMINADAS, ...interpretarJson<Preferencias>(fila.preferencias) }
        : PREFERENCIAS_PREDETERMINADAS,
    });
  });
  enrutador.put('/preferencias', async (req, res) => {
    const preferencias = esquemaPreferencias.parse(req.body);
    await escribir(
      'INSERT INTO preferencias_usuario(usuario_id,preferencias) VALUES (?,?) ON DUPLICATE KEY UPDATE preferencias=VALUES(preferencias)',
      [req.usuario!.id, JSON.stringify(preferencias)],
    );
    res.json({ preferencias });
  });
  return enrutador;
}
