/** Rutas de amigos, búsqueda de personas e invitaciones a salas. */
import { Router } from 'express';
import { z } from 'zod';
import {
  getSocial,
  searchUsers,
  requestFriend,
  acceptFriend,
  removeFriend,
  inviteFriend,
  respondInvitation,
} from '../servicios/social.js';

/** Crea las rutas sociales y avisa por socket a las personas afectadas. */
export function socialRoutes(notify: (channel: string) => void): Router {
  const router = Router();
  router.get('/social', async (req, res) => {
    res.json(await getSocial(req.user!.id));
  });
  router.get('/users/search', async (req, res) => {
    const term = z
      .string()
      .trim()
      .min(2, 'Escribe al menos 2 caracteres.')
      .max(254)
      .parse(req.query.q);
    res.json({ users: await searchUsers(req.user!.id, term) });
  });
  router.post('/friends', async (req, res) => {
    const { userId } = z.object({ userId: z.uuid() }).parse(req.body);
    await requestFriend(req.user!.id, userId);
    notify(`user:${userId}`);
    notify(`user:${req.user!.id}`);
    res.status(201).json(await getSocial(req.user!.id));
  });
  router.post('/friends/:userId/accept', async (req, res) => {
    const userId = z.uuid().parse(req.params.userId);
    await acceptFriend(req.user!.id, userId);
    notify(`user:${userId}`);
    notify(`user:${req.user!.id}`);
    res.json(await getSocial(req.user!.id));
  });
  router.delete('/friends/:userId', async (req, res) => {
    const userId = z.uuid().parse(req.params.userId);
    await removeFriend(req.user!.id, userId);
    notify(`user:${userId}`);
    notify(`user:${req.user!.id}`);
    res.status(204).end();
  });
  router.post('/rooms/:code/invitations', async (req, res) => {
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
  router.post('/invitations/:id/respond', async (req, res) => {
    const id = z.uuid().parse(req.params.id),
      { accept } = z.object({ accept: z.boolean() }).parse(req.body);
    const result = await respondInvitation(id, req.user!.id, accept);
    notify(`room:${result.code}`);
    notify(`user:${result.senderId}`);
    notify(`user:${req.user!.id}`);
    res.json({ code: result.code });
  });
  return router;
}
