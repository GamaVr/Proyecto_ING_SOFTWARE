/** Punto de entrada del servidor: arranca HTTP, el tiempo real y la carga del catálogo musical. */
import { createServer } from 'node:http';
import { createApp } from './aplicacion.js';
import { createRealtime, type Realtime } from './tiempo-real.js';
import { env } from './configuracion.js';
import { pool } from './datos/base-datos.js';
import { prepareRecordings } from './servicios/musica/catalogo.js';

// La API avisa a los clientes por Socket.IO, que se crea después del servidor HTTP.
let realtime: Realtime | undefined;
const app = createApp((channel) => realtime?.notify(channel)),
  http = createServer(app);
realtime = createRealtime(http);
void prepareRecordings().catch((error) => console.error('Catálogo real:', error.message));
http.listen(env.PORT, env.HOST, () =>
  console.log(`Guess The Beat API · http://${env.HOST}:${env.PORT}`),
);

/** Detiene el reloj, los sockets, HTTP y MySQL sin dejar conexiones abiertas. */
async function shutdown(): Promise<void> {
  realtime?.stop();
  http.close();
  await pool.end();
  process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
