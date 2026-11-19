/** Rutas de música: géneros disponibles, búsqueda en el catálogo y muestras de audio. */

import { Router } from 'express';
import { z } from 'zod';
import { query } from '../datos/base-datos.js';
import { HttpError } from '../errores.js';
import { musicOptions } from '../servicios/musica/catalogo.js';
import { serveMusicAudio, type MusicFetch } from '../servicios/musica/deezer.js';

/** Expone opciones de partida y búsquedas con muestras breves de las canciones del catálogo. */

export function musicRouter(fetcher: MusicFetch = fetch): Router {
  const router = Router();
  router.get('/options', async (_req, res) => {
    res.json(await musicOptions(fetcher));
  });
  router.get('/search', async (req, res) => {
    const { q } = z.object({ q: z.string().trim().min(2).max(80) }).parse(req.query);
    const term = `%${q}%`;
    const tracks = await query<{ id: string; title: string; artist: string }>(
      `SELECT s.id,s.title,s.artist
       FROM songs s JOIN song_media m ON m.song_id=s.id
       WHERE m.source='deezer' AND m.enabled=TRUE
         AND (s.title LIKE ? OR s.artist LIKE ?)
       ORDER BY CASE WHEN LOWER(s.title)=LOWER(?) THEN 0
                     WHEN LOWER(s.artist)=LOWER(?) THEN 1 ELSE 2 END,
                s.title
       LIMIT 12`,
      [term, term, q, q],
    );
    res.json({ tracks });
  });
  router.get('/search/:id/audio', async (req, res) => {
    const id = z.string().min(1).max(40).parse(req.params.id);
    const [media] = await query<{ external_id: string | null }>(
      "SELECT external_id FROM song_media WHERE song_id=? AND source='deezer' AND enabled=TRUE",
      [id],
    );
    if (!media?.external_id || !/^\d+$/.test(media.external_id))
      throw new HttpError(404, 'No hay una muestra disponible para esta canción.');
    await serveMusicAudio(
      { url: `https://api.deezer.com/track/${media.external_id}` },
      req,
      res,
      fetcher,
    );
  });
  return router;
}
