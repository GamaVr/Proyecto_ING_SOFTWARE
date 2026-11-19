/** Rutas de amigos, búsqueda de personas e invitaciones a salas. */
import { Router } from 'express';
import { z } from 'zod';
import {
  obtenerSocial,
  buscarUsuarios,
  solicitarAmistad,
  aceptarAmistad,
  eliminarAmistad,
  invitarAmigo,
  responderInvitacion,
} from '../servicios/social.js';

/** Crea las rutas sociales y avisa por socket a las personas afectadas. */
export function rutasSocial(notificar: (canal: string) => void): Router {
  const enrutador = Router();
  enrutador.get('/social', async (req, res) => {
    res.json(await obtenerSocial(req.usuario!.id));
  });
  enrutador.get('/usuarios/buscar', async (req, res) => {
    const termino = z
      .string()
      .trim()
      .min(2, 'Escribe al menos 2 caracteres.')
      .max(254)
      .parse(req.query.q);
    res.json({ usuarios: await buscarUsuarios(req.usuario!.id, termino) });
  });
  enrutador.post('/amigos', async (req, res) => {
    const { usuarioId } = z.object({ usuarioId: z.uuid() }).parse(req.body);
    await solicitarAmistad(req.usuario!.id, usuarioId);
    notificar(`usuario:${usuarioId}`);
    notificar(`usuario:${req.usuario!.id}`);
    res.status(201).json(await obtenerSocial(req.usuario!.id));
  });
  enrutador.post('/amigos/:usuarioId/aceptar', async (req, res) => {
    const usuarioId = z.uuid().parse(req.params.usuarioId);
    await aceptarAmistad(req.usuario!.id, usuarioId);
    notificar(`usuario:${usuarioId}`);
    notificar(`usuario:${req.usuario!.id}`);
    res.json(await obtenerSocial(req.usuario!.id));
  });
  enrutador.delete('/amigos/:usuarioId', async (req, res) => {
    const usuarioId = z.uuid().parse(req.params.usuarioId);
    await eliminarAmistad(req.usuario!.id, usuarioId);
    notificar(`usuario:${usuarioId}`);
    notificar(`usuario:${req.usuario!.id}`);
    res.status(204).end();
  });
  enrutador.post('/salas/:codigo/invitaciones', async (req, res) => {
    const codigo = z
      .string()
      .regex(/^[A-Z0-9]{6}$/)
      .parse(req.params.codigo);
    const { usuarioId } = z.object({ usuarioId: z.uuid() }).parse(req.body);
    await invitarAmigo(codigo, req.usuario!.id, usuarioId);
    notificar(`usuario:${usuarioId}`);
    notificar(`usuario:${req.usuario!.id}`);
    res.status(201).json({ ok: true });
  });
  enrutador.post('/invitaciones/:id/responder', async (req, res) => {
    const id = z.uuid().parse(req.params.id),
      { aceptar } = z.object({ aceptar: z.boolean() }).parse(req.body);
    const resultado = await responderInvitacion(id, req.usuario!.id, aceptar);
    notificar(`sala:${resultado.codigo}`);
    notificar(`usuario:${resultado.remitenteId}`);
    notificar(`usuario:${req.usuario!.id}`);
    res.json({ codigo: resultado.codigo });
  });
  return enrutador;
}
