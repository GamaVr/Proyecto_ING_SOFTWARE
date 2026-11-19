/** Construye las rutas HTTP de la API y sus protecciones. */
import express, { type Request, type Response, type NextFunction } from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { ZodError } from 'zod';
import { entorno, origenesPermitidos } from './configuracion.js';
import { consultar } from './datos/base-datos.js';
import { ErrorHttp } from './errores.js';
import { type ConsultaMusica } from './servicios/musica/deezer.js';
import { rutasMusica } from './rutas/musica.js';
import { rutasAutenticacion } from './rutas/autenticacion.js';
import { rutasPerfil } from './rutas/perfil.js';
import { rutasSocial } from './rutas/social.js';
import { rutasPartidas } from './rutas/partidas.js';
import { rutasSalas } from './rutas/salas.js';
import { exigirUsuario } from './servicios/sesiones.js';

/** Construye la API con validación, sesiones, protección de origen y errores públicos consistentes. */
export function crearAplicacion(
  notificar: (canal: string) => void = () => {},
  consultarMusica?: ConsultaMusica,
): express.Express {
  const aplicacion = express();
  aplicacion.disable('x-powered-by');
  // La aplicación solo recibe tráfico detrás de un proxy local (por ejemplo, cloudflared).
  aplicacion.set('trust proxy', 1);
  aplicacion.use(
    helmet({
      contentSecurityPolicy:
        entorno.NODE_ENV === 'production'
          ? {
              directives: {
                defaultSrc: ["'self'"],
                scriptSrc: ["'self'"],
                styleSrc: ["'self'", "'unsafe-inline'"],
                imgSrc: ["'self'", 'data:'],
                mediaSrc: ["'self'", 'blob:'],
                connectSrc: ["'self'", 'ws:', 'wss:'],
              },
            }
          : false,
      strictTransportSecurity: entorno.NODE_ENV === 'production' ? undefined : false,
    }),
  );
  aplicacion.use(express.json({ limit: '12kb' }));
  aplicacion.use(cookieParser());
  aplicacion.use(
    '/api',
    rateLimit({
      windowMs: 60000,
      limit: 500,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      message: { error: 'Demasiadas solicitudes. Espera un momento.' },
    }),
  );
  // Los navegadores envían Origin en escrituras; se comprueba además de SameSite.
  aplicacion.use('/api', (req, _res, siguiente) => {
    const origen = req.headers.origin;
    const permitidos = [
      ...origenesPermitidos(),
      `http://${req.headers.host}`,
      `https://${req.headers.host}`,
    ];
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && origen && !permitidos.includes(origen))
      return siguiente(new ErrorHttp(403, 'Origen de solicitud no permitido.'));
    siguiente();
  });
  aplicacion.get('/api/estado', async (_req, res) => {
    try {
      const [fila] = await consultar<{ version: string }>('SELECT VERSION() AS version');
      res.json({ estado: 'ok', baseDatos: 'mysql', version: fila.version });
    } catch {
      res.status(503).json({
        estado: 'unavailable',
        error: 'No hay conexión con MySQL. Revisa .env y el servidor de base de datos.',
      });
    }
  });
  aplicacion.use('/api', rutasAutenticacion());
  aplicacion.use('/api', exigirUsuario);
  aplicacion.use('/api/musica', rutasMusica(consultarMusica));
  aplicacion.use('/api', rutasPerfil());
  aplicacion.use('/api', rutasSocial(notificar));
  aplicacion.use('/api', rutasPartidas(notificar, consultarMusica));
  aplicacion.use('/api', rutasSalas(notificar, consultarMusica));
  aplicacion.use('/api', (_req, _res, siguiente) =>
    siguiente(new ErrorHttp(404, 'Ruta no encontrada.')),
  );
  if (existsSync(path.resolve('dist/index.html'))) {
    aplicacion.use(express.static(path.resolve('dist')));
    aplicacion.get('/{*path}', (_req, res) => res.sendFile(path.resolve('dist/index.html')));
  }
  aplicacion.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (res.headersSent) {
      _next(error);
      return;
    }
    if (error instanceof ZodError) {
      res.status(422).json({ error: error.issues[0]?.message || 'Revisa los datos enviados.' });
      return;
    }
    if (error instanceof ErrorHttp) {
      res.status(error.estado).json({ error: error.message });
      return;
    }
    if (error instanceof SyntaxError) {
      res.status(400).json({ error: 'JSON inválido.' });
      return;
    }
    const codigo = (error as { code?: string }).code;
    if (
      codigo &&
      ['ECONNREFUSED', 'EACCES', 'ER_ACCESS_DENIED_ERROR', 'ER_BAD_DB_ERROR'].includes(codigo)
    ) {
      res
        .status(503)
        .json({ error: 'MySQL no está disponible. Revisa la configuración del servidor.' });
      return;
    }
    console.error('Error interno:', error instanceof Error ? error.message : 'desconocido');
    res.status(500).json({ error: 'Ocurrió un error en el servidor. Vuelve a intentarlo.' });
  });
  return aplicacion;
}
