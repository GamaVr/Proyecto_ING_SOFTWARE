/** Rutas de salas privadas: crear, unirse, confirmar, chatear, iniciar y salir. */
import { Router } from 'express';
import { z } from 'zod';
import { esquemaConfiguracion } from '../validacion.js';
import {
  obtenerSala,
  crearSala,
  unirseASala,
  iniciarSala,
  actualizarJugadorSala,
  salirDeSala,
  enviarMensajeSala,
} from '../servicios/salas.js';

/** Crea las rutas de salas multijugador. */
export function rutasSalas(notificar: (canal: string) => void): Router {
  const enrutador = Router();
  enrutador.post('/salas', async (req, res) => {
    const entrada = z
      .object({
        nombre: z.string().trim().min(2).max(60),
        modo: z.enum(['duelo', 'equipos']),
        configuracion: esquemaConfiguracion,
      })
      .parse(req.body);
    const codigo = await crearSala(
      req.usuario!.id,
      entrada.nombre,
      entrada.modo,
      entrada.configuracion,
    );
    res.status(201).json(await obtenerSala(codigo, req.usuario!.id));
  });
  enrutador.post('/salas/unirse', async (req, res) => {
    const { codigo } = z
      .object({
        codigo: z
          .string()
          .trim()
          .toUpperCase()
          .regex(/^[A-Z0-9]{6}$/, 'El código debe tener 6 caracteres.'),
      })
      .parse(req.body);
    await unirseASala(codigo, req.usuario!.id);
    const sala = await obtenerSala(codigo, req.usuario!.id);
    notificar(`sala:${codigo}`);
    res.json(sala);
  });
  enrutador.get('/salas/:codigo', async (req, res) => {
    res.json(await obtenerSala(String(req.params.codigo), req.usuario!.id));
  });
  enrutador.patch('/salas/:codigo/jugador', async (req, res) => {
    const entrada = z
        .object({ accion: z.enum(['listo', 'equipo']), listo: z.boolean().optional() })
        .parse(req.body),
      codigo = String(req.params.codigo);
    await actualizarJugadorSala(codigo, req.usuario!.id, entrada.accion, entrada.listo);
    notificar(`sala:${codigo}`);
    res.json(await obtenerSala(codigo, req.usuario!.id));
  });
  enrutador.post('/salas/:codigo/iniciar', async (req, res) => {
    const codigo = String(req.params.codigo);
    const partidaId = await iniciarSala(codigo, req.usuario!.id);
    notificar(`sala:${codigo}`);
    res.json({ partidaId });
  });
  enrutador.post('/salas/:codigo/mensajes', async (req, res) => {
    const { texto } = z.object({ texto: z.string().trim().min(1).max(300) }).parse(req.body),
      codigo = String(req.params.codigo);
    await enviarMensajeSala(codigo, req.usuario!.id, texto);
    notificar(`sala:${codigo}`);
    res.status(201).json({ ok: true });
  });
  enrutador.post('/salas/:codigo/salir', async (req, res) => {
    const codigo = String(req.params.codigo);
    await salirDeSala(codigo, req.usuario!.id);
    notificar(`sala:${codigo}`);
    res.status(204).end();
  });
  return enrutador;
}
