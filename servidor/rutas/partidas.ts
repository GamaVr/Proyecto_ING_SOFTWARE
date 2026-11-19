/** Rutas de partidas: crear, consultar, escuchar, responder, avanzar y abandonar. */
import { Router } from 'express';
import { z } from 'zod';
import { transaccion } from '../datos/base-datos.js';
import { ErrorHttp } from '../errores.js';
import { transmitirAudioMusica } from '../servicios/musica/deezer.js';
import { type ConsultaMusica } from '../servicios/musica/deezer.js';
import { esquemaConfiguracion } from '../validacion.js';
import {
  obtenerPartida,
  crearPartida,
  responderPartida,
  avanzarPartida,
  obtenerAudio,
  abandonarPartida,
} from '../servicios/partidas.js';

/** Crea las rutas de partidas; el servidor controla el reloj y la puntuación. */
export function rutasPartidas(
  notificar: (canal: string) => void,
  consultarMusica?: ConsultaMusica,
): Router {
  const enrutador = Router();
  enrutador.post('/partidas', async (req, res) => {
    const configuracion = esquemaConfiguracion.parse(req.body);
    const id = await transaccion(async (bd) =>
      crearPartida(configuracion, 'individual', [{ id: req.usuario!.id, equipo: 0 }], bd),
    );
    res.status(201).json(await obtenerPartida(id, req.usuario!.id));
  });
  enrutador.get('/partidas/:id', async (req, res) => {
    res.json(await obtenerPartida(String(req.params.id), req.usuario!.id));
  });
  enrutador.get('/partidas/:id/audio', async (req, res) => {
    const medio = await obtenerAudio(String(req.params.id), req.usuario!.id);
    await transmitirAudioMusica(medio, req, res, consultarMusica);
  });
  enrutador.post('/partidas/:id/respuesta', async (req, res) => {
    const entrada = z
      .object({ respuesta: z.string().trim().max(200), ronda: z.number().int().min(0) })
      .parse(req.body);
    const id = String(req.params.id),
      partida = await obtenerPartida(id, req.usuario!.id);
    if (partida.ronda !== entrada.ronda)
      throw new ErrorHttp(409, 'La ronda cambió. Actualiza la partida.');
    await responderPartida(id, req.usuario!.id, entrada.respuesta, entrada.ronda);
    notificar(`partida:${id}`);
    res.json(await obtenerPartida(id, req.usuario!.id));
  });
  enrutador.post('/partidas/:id/siguiente', async (req, res) => {
    const id = String(req.params.id),
      partida = await obtenerPartida(id, req.usuario!.id);
    if (partida.modo !== 'individual')
      throw new ErrorHttp(403, 'Las rondas multijugador avanzan automáticamente.');
    const { ronda } = z.object({ ronda: z.number().int().min(0) }).parse(req.body);
    if (ronda !== partida.ronda) throw new ErrorHttp(409, 'Esta ronda ya avanzó.');
    await avanzarPartida(id, req.usuario!.id, ronda);
    res.json(await obtenerPartida(id, req.usuario!.id));
  });
  enrutador.post('/partidas/:id/abandonar', async (req, res) => {
    const id = String(req.params.id);
    await abandonarPartida(id, req.usuario!.id);
    notificar(`partida:${id}`);
    res.status(204).end();
  });
  return enrutador;
}
