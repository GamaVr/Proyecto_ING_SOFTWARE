/** Inicia HTTP, Socket.IO y el reloj de las partidas multijugador. */
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { createApp } from './aplicacion.js';
import { env, allowedOrigins } from './configuracion.js';
import { findSession } from './autenticacion.js';
import { getRoom } from './salas.js';
import { getGame, advanceGame } from './partidas.js';
import { query, pool } from './base-datos.js';
import { prepareRecordings } from './musica.js';

/** Envia una señal de actualización; cada cliente recupera su estado privado mediante la API. */
function notify(channel: string): void {
  io.to(channel).emit('refresh');
}
const app = createApp(notify),
  http = createServer(app);
void prepareRecordings().catch((error) => console.error('Catálogo real:', error.message));
const io = new Server(http, {
  maxHttpBufferSize: 4096,
  allowRequest: (req, callback) => {
    const origin = req.headers.origin;
    callback(
      null,
      !origin ||
        [...allowedOrigins(), `http://${req.headers.host}`, `https://${req.headers.host}`].includes(
          origin,
        ),
    );
  },
});
io.use(async (socket, next) => {
  try {
    const cookie = socket.request.headers.cookie
      ?.split(';')
      .map((part) => part.trim())
      .find((part) => part.startsWith('beat_session='))
      ?.slice('beat_session='.length);
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
http.listen(env.PORT, env.HOST, () =>
  console.log(`Guess The Beat API · http://${env.HOST}:${env.PORT}`),
);

/** Detiene el reloj, los sockets, HTTP y MySQL sin dejar conexiones abiertas. */
async function shutdown(): Promise<void> {
  clearInterval(timer);
  io.close();
  http.close();
  await pool.end();
  process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
