/** Punto de entrada del servidor: arranca HTTP, el tiempo real y la carga del catálogo musical. */
import { createServer } from 'node:http';
import { crearAplicacion } from './aplicacion.js';
import { crearTiempoReal, type TiempoReal } from './tiempo-real.js';
import { entorno } from './configuracion.js';
import { conexiones } from './datos/base-datos.js';
import { prepararGrabaciones } from './servicios/musica/catalogo.js';

// La API avisa a los clientes por Socket.IO, que se crea después del servidor HTTP.
let tiempoReal: TiempoReal | undefined;
const aplicacion = crearAplicacion((canal) => tiempoReal?.notificar(canal)),
  servidorHttp = createServer(aplicacion);
tiempoReal = crearTiempoReal(servidorHttp);
void prepararGrabaciones().catch((error) => console.error('Catálogo real:', error.message));
servidorHttp.listen(entorno.PORT, entorno.HOST, () =>
  console.log(`Guess The Beat API · http://${entorno.HOST}:${entorno.PORT}`),
);

/** Detiene el reloj, los sockets, HTTP y MySQL sin dejar conexiones abiertas. */
async function apagar(): Promise<void> {
  tiempoReal?.detener();
  servidorHttp.close();
  await conexiones.end();
  process.exit(0);
}
process.on('SIGTERM', apagar);
process.on('SIGINT', apagar);
