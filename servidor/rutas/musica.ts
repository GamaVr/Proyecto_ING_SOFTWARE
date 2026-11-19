/** Rutas de música: géneros disponibles, búsqueda en el catálogo y muestras de audio. */

import { Router } from 'express';
import { z } from 'zod';
import { consultar } from '../datos/base-datos.js';
import { ErrorHttp } from '../errores.js';
import { opcionesMusica } from '../servicios/musica/catalogo.js';
import { transmitirAudioMusica, type ConsultaMusica } from '../servicios/musica/deezer.js';

/** Expone opciones de partida y búsquedas con muestras breves de las canciones del catálogo. */

export function rutasMusica(consultarProveedor: ConsultaMusica = fetch): Router {
  const enrutador = Router();
  enrutador.get('/opciones', async (_req, res) => {
    res.json(await opcionesMusica());
  });
  enrutador.get('/buscar', async (req, res) => {
    const { q } = z.object({ q: z.string().trim().min(2).max(80) }).parse(req.query);
    const termino = `%${q}%`;
    const pistas = await consultar<{ id: string; titulo: string; artista: string }>(
      `SELECT s.id,s.titulo,s.artista
       FROM canciones s JOIN medios_cancion m ON m.cancion_id=s.id
       WHERE m.fuente='deezer' AND m.habilitada=TRUE
         AND (s.titulo LIKE ? OR s.artista LIKE ?)
       ORDER BY CASE WHEN LOWER(s.titulo)=LOWER(?) THEN 0
                     WHEN LOWER(s.artista)=LOWER(?) THEN 1 ELSE 2 END,
                s.titulo
       LIMIT 12`,
      [termino, termino, q, q],
    );
    res.json({ pistas });
  });
  enrutador.get('/buscar/:id/audio', async (req, res) => {
    const id = z.string().min(1).max(40).parse(req.params.id);
    const [medio] = await consultar<{ id_externo: string | null }>(
      "SELECT id_externo FROM medios_cancion WHERE cancion_id=? AND fuente='deezer' AND habilitada=TRUE",
      [id],
    );
    if (!medio?.id_externo || !/^\d+$/.test(medio.id_externo))
      throw new ErrorHttp(404, 'No hay una muestra disponible para esta canción.');
    await transmitirAudioMusica(
      { url: `https://api.deezer.com/track/${medio.id_externo}` },
      req,
      res,
      consultarProveedor,
    );
  });
  return enrutador;
}
