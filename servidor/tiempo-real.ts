/** Comunicación en tiempo real: canales de Socket.IO y reloj de las partidas multijugador. */
import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import { allowedOrigins } from './configuracion.js';
import { findSession, SESSION_COOKIE } from './servicios/sesiones.js';
import { getRoom } from './servicios/salas.js';
import { getGame, advanceGame } from './servicios/partidas.js';
import { query } from './datos/base-datos.js';

/** Controles que el arranque necesita para avisar a los clientes y detener el servicio. */
export interface Realtime {
  /** Envía una señal de actualización; cada cliente recupera su estado privado mediante la API. */
  notify: (channel: string) => void;
  /** Detiene el reloj y cierra los sockets. */
  stop: () => void;
}

/** Conecta Socket.IO al servidor HTTP, exige sesión y arranca el reloj de las partidas. */
export function createRealtime(http: HttpServer): Realtime {
  const io = new Server(http, {
    maxHttpBufferSize: 4096,
    allowRequest: (req, callback) => {
      const origin = req.headers.origin;
      callback(
        null,
        !origin ||
          [
            ...allowedOrigins(),
            `http://${req.headers.host}`,
            `https://${req.headers.host}`,
          ].includes(origin),
      );
    },
  });
  const notify = (channel: string): void => {
    io.to(channel).emit('refresh');
  };
  io.use(async (socket, next) => {
    try {
      const cookie = socket.request.headers.cookie
        ?.split(';')
        .map((part) => part.trim())
        .find((part) => part.startsWith(`${SESSION_COOKIE}=`))
        ?.slice(SESSION_COOKIE.length + 1);
      const user = await findSession(cookie);
      if (!user) return next(new Error('Inicia sesión.'));
      socket.data.userId = user.id;
      next();
    } catch {
      next(new Error('No se pudo verificar la sesión.'));
    }
  });
  io.on('connection', (socket) => {
    // El canal personal recibe invitaciones incluso cuando el usuario entra a una sala o partida.
    const personal = `user:${socket.data.userId}`;
    void socket.join(personal);
    socket.on('subscribe', async (channel: unknown) => {
      if (typeof channel !== 'string' || channel.length > 50) return;
      try {
        if (channel.startsWith('room:')) await getRoom(channel.slice(5), socket.data.userId);
        else if (channel.startsWith('game:')) await getGame(channel.slice(5), socket.data.userId);
        else if (channel !== personal) return;
        for (const room of socket.rooms)
          if (room !== socket.id && room !== personal) await socket.leave(room);
        await socket.join(channel);
      } catch {
        socket.emit('subscription-error', 'No tienes acceso a este espacio.');
      }
    });
  });

  let ticking = false;
  /** Avanza los relojes multijugador incluso si los navegadores se desconectan. */
  async function tick(): Promise<void> {
    if (ticking) return;
    ticking = true;
    try {
      const games = await query<{ id: string }>(
        "SELECT id FROM games WHERE status='playing' AND mode<>'solo'",
      );
      for (const game of games) {
        await advanceGame(game.id);
        notify(`game:${game.id}`);
      }
    } catch (error) {
      console.error('Sincronización:', (error as Error).message);
    } finally {
      ticking = false;
    }
  }
  const timer = setInterval(tick, 1000);

  return {
    notify,
    stop: () => {
      clearInterval(timer);
      void io.close();
    },
  };
}
