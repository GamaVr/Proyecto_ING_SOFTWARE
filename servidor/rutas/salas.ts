/** Rutas de salas privadas: crear, unirse, confirmar, chatear, iniciar y salir. */
import { Router } from 'express';
import { z } from 'zod';
import { prepareRecordings } from '../servicios/musica/catalogo.js';
import { type MusicFetch } from '../servicios/musica/deezer.js';
import { configSchema } from '../validacion.js';
import {
  getRoom,
  createRoom,
  joinRoom,
  startRoom,
  updateRoomPlayer,
  leaveRoom,
  sendRoomMessage,
} from '../servicios/salas.js';

/** Crea las rutas de salas multijugador. */
export function roomRoutes(notify: (channel: string) => void, musicFetch?: MusicFetch): Router {
  const router = Router();
  router.post('/rooms', async (req, res) => {
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
  router.post('/rooms/join', async (req, res) => {
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
  router.get('/rooms/:code', async (req, res) => {
    res.json(await getRoom(String(req.params.code), req.user!.id));
  });
  router.patch('/rooms/:code/player', async (req, res) => {
    const input = z
        .object({ action: z.enum(['ready', 'team']), ready: z.boolean().optional() })
        .parse(req.body),
      code = String(req.params.code);
    await updateRoomPlayer(code, req.user!.id, input.action, input.ready);
    notify(`room:${code}`);
    res.json(await getRoom(code, req.user!.id));
  });
  router.post('/rooms/:code/start', async (req, res) => {
    await prepareRecordings(musicFetch);
    const code = String(req.params.code);
    const gameId = await startRoom(code, req.user!.id);
    notify(`room:${code}`);
    res.json({ gameId });
  });
  router.post('/rooms/:code/messages', async (req, res) => {
    const { text } = z.object({ text: z.string().trim().min(1).max(300) }).parse(req.body),
      code = String(req.params.code);
    await sendRoomMessage(code, req.user!.id, text);
    notify(`room:${code}`);
    res.status(201).json({ ok: true });
  });
  router.post('/rooms/:code/leave', async (req, res) => {
    const code = String(req.params.code);
    await leaveRoom(code, req.user!.id);
    notify(`room:${code}`);
    res.status(204).end();
  });
  return router;
}
