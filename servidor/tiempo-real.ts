/** Comunicación en tiempo real: canales de Socket.IO y reloj de las partidas multijugador. */
import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import { origenesPermitidos } from './configuracion.js';
import { buscarSesion, COOKIE_SESION } from './servicios/sesiones.js';
import { obtenerSala } from './servicios/salas.js';
import { obtenerPartida, avanzarPartida } from './servicios/partidas.js';
import { consultar } from './datos/base-datos.js';

/** Controles que el arranque necesita para avisar a los clientes y detener el servicio. */
export interface TiempoReal {
  /** Envía una señal de actualización; cada cliente recupera su estado privado mediante la API. */
  notificar: (canal: string) => void;
  /** Detiene el reloj y cierra los sockets. */
  detener: () => void;
}

/** Conecta Socket.IO al servidor HTTP, exige sesión y arranca el reloj de las partidas. */
export function crearTiempoReal(servidorHttp: HttpServer): TiempoReal {
  const io = new Server(servidorHttp, {
    maxHttpBufferSize: 4096,
    allowRequest: (req, responder) => {
      const origen = req.headers.origin;
      responder(
        null,
        !origen ||
          [
            ...origenesPermitidos(),
            `http://${req.headers.host}`,
            `https://${req.headers.host}`,
          ].includes(origen),
      );
    },
  });
  const notificar = (canal: string): void => {
    io.to(canal).emit('actualizar');
  };
  io.use(async (socket, siguiente) => {
    try {
      const cookie = socket.request.headers.cookie
        ?.split(';')
        .map((parte) => parte.trim())
        .find((parte) => parte.startsWith(`${COOKIE_SESION}=`))
        ?.slice(COOKIE_SESION.length + 1);
      const usuario = await buscarSesion(cookie);
      if (!usuario) return siguiente(new Error('Inicia sesión.'));
      socket.data.usuarioId = usuario.id;
      siguiente();
    } catch {
      siguiente(new Error('No se pudo verificar la sesión.'));
    }
  });
  io.on('connection', (socket) => {
    // El canal personal recibe invitaciones incluso cuando el usuario entra a una sala o partida.
    const personal = `usuario:${socket.data.usuarioId}`;
    void socket.join(personal);
    socket.on('suscribir', async (canal: unknown) => {
      if (typeof canal !== 'string' || canal.length > 50) return;
      try {
        // Solo se permite escuchar salas y partidas en las que la persona participa.
        if (canal.startsWith('sala:'))
          await obtenerSala(canal.slice('sala:'.length), socket.data.usuarioId);
        else if (canal.startsWith('partida:'))
          await obtenerPartida(canal.slice('partida:'.length), socket.data.usuarioId);
        else if (canal !== personal) return;
        for (const sala of socket.rooms)
          if (sala !== socket.id && sala !== personal) await socket.leave(sala);
        await socket.join(canal);
      } catch {
        socket.emit('error-suscripcion', 'No tienes acceso a este espacio.');
      }
    });
  });

  let avanzandoReloj = false;
  /** Avanza los relojes multijugador incluso si los navegadores se desconectan. */
  async function avanzarReloj(): Promise<void> {
    if (avanzandoReloj) return;
    avanzandoReloj = true;
    try {
      const partidas = await consultar<{ id: string }>(
        "SELECT id FROM partidas WHERE estado='en_curso' AND modo<>'individual'",
      );
      for (const partida of partidas) {
        await avanzarPartida(partida.id);
        notificar(`partida:${partida.id}`);
      }
    } catch (error) {
      console.error('Sincronización:', (error as Error).message);
    } finally {
      avanzandoReloj = false;
    }
  }
  const temporizador = setInterval(avanzarReloj, 1000);

  return {
    notificar,
    detener: () => {
      clearInterval(temporizador);
      void io.close();
    },
  };
}
