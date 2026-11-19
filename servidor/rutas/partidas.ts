/** Rutas de partidas: crear, consultar, escuchar, responder, avanzar y abandonar. */
import { Router } from 'express';
import { z } from 'zod';
import { transaction } from '../datos/base-datos.js';
import { HttpError } from '../errores.js';
import { prepareRecordings } from '../servicios/musica/catalogo.js';
import { serveMusicAudio } from '../servicios/musica/deezer.js';
import { type MusicFetch } from '../servicios/musica/deezer.js';
import { configSchema } from '../validacion.js';
import {
  getGame,
  createGame,
  answerGame,
  advanceGame,
  getAudioFile,
  abandonGame,
} from '../servicios/partidas.js';

/** Crea las rutas de partidas; el servidor controla el reloj y la puntuación. */
export function gameRoutes(notify: (channel: string) => void, musicFetch?: MusicFetch): Router {
  const router = Router();
  router.post('/games', async (req, res) => {
    const config = configSchema.parse(req.body);
    await prepareRecordings(musicFetch);
    const id = await transaction(async (db) =>
      createGame(config, 'solo', [{ id: req.user!.id, team: 0 }], db),
    );
    res.status(201).json(await getGame(id, req.user!.id));
  });
  router.get('/games/:id', async (req, res) => {
    res.json(await getGame(String(req.params.id), req.user!.id));
  });
  router.get('/games/:id/audio', async (req, res) => {
    const media = await getAudioFile(String(req.params.id), req.user!.id);
    await serveMusicAudio(media, req, res, musicFetch);
  });
  router.post('/games/:id/answer', async (req, res) => {
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
  router.post('/games/:id/next', async (req, res) => {
    const id = String(req.params.id),
      game = await getGame(id, req.user!.id);
    if (game.mode !== 'solo')
      throw new HttpError(403, 'Las rondas multijugador avanzan automáticamente.');
    const { round } = z.object({ round: z.number().int().min(0) }).parse(req.body);
    if (round !== game.round) throw new HttpError(409, 'Esta ronda ya avanzó.');
    await advanceGame(id, req.user!.id, round);
    res.json(await getGame(id, req.user!.id));
  });
  router.post('/games/:id/abandon', async (req, res) => {
    const id = String(req.params.id);
    await abandonGame(id, req.user!.id);
    notify(`game:${id}`);
    res.status(204).end();
  });
  return router;
}
