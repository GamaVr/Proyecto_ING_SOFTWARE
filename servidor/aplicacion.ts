/** Construye las rutas HTTP de la API y sus protecciones. */
import express, { type Request, type Response, type NextFunction } from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { ZodError } from 'zod';
import { env, allowedOrigins } from './configuracion.js';
import { query } from './datos/base-datos.js';
import { HttpError } from './errores.js';
import { type MusicFetch } from './servicios/musica/deezer.js';
import { musicRouter } from './rutas/musica.js';
import { authRoutes } from './rutas/autenticacion.js';
import { profileRoutes } from './rutas/perfil.js';
import { socialRoutes } from './rutas/social.js';
import { gameRoutes } from './rutas/partidas.js';
import { roomRoutes } from './rutas/salas.js';
import { requireUser } from './servicios/sesiones.js';

/** Construye la API con validación, sesiones, protección de origen y errores públicos consistentes. */
export function createApp(
  notify: (channel: string) => void = () => {},
  musicFetch?: MusicFetch,
): express.Express {
  const app = express();
  app.disable('x-powered-by');
  // La aplicación solo recibe tráfico detrás de un proxy local (por ejemplo, cloudflared).
  app.set('trust proxy', 1);
  app.use(
    helmet({
      contentSecurityPolicy:
        env.NODE_ENV === 'production'
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
      strictTransportSecurity: env.NODE_ENV === 'production' ? undefined : false,
    }),
  );
  app.use(express.json({ limit: '12kb' }));
  app.use(cookieParser());
  app.use(
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
  app.use('/api', (req, _res, next) => {
    const origin = req.headers.origin;
    const allowed = [
      ...allowedOrigins(),
      `http://${req.headers.host}`,
      `https://${req.headers.host}`,
    ];
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && origin && !allowed.includes(origin))
      return next(new HttpError(403, 'Origen de solicitud no permitido.'));
    next();
  });
  app.get('/api/health', async (_req, res) => {
    try {
      const [row] = await query<{ version: string }>('SELECT VERSION() AS version');
      res.json({ status: 'ok', database: 'mysql', version: row.version });
    } catch {
      res.status(503).json({
        status: 'unavailable',
        error: 'No hay conexión con MySQL. Revisa .env y el servidor de base de datos.',
      });
    }
  });
  app.use('/api', authRoutes());
  app.use('/api', requireUser);
  app.use('/api/music', musicRouter(musicFetch));
  app.use('/api', profileRoutes());
  app.use('/api', socialRoutes(notify));
  app.use('/api', gameRoutes(notify, musicFetch));
  app.use('/api', roomRoutes(notify, musicFetch));
  app.use('/api', (_req, _res, next) => next(new HttpError(404, 'Ruta no encontrada.')));
  if (existsSync(path.resolve('dist/index.html'))) {
    app.use(express.static(path.resolve('dist')));
    app.get('/{*path}', (_req, res) => res.sendFile(path.resolve('dist/index.html')));
  }
  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (res.headersSent) {
      _next(error);
      return;
    }
    if (error instanceof ZodError) {
      res.status(422).json({ error: error.issues[0]?.message || 'Revisa los datos enviados.' });
      return;
    }
    if (error instanceof HttpError) {
      res.status(error.status).json({ error: error.message });
      return;
    }
    if (error instanceof SyntaxError) {
      res.status(400).json({ error: 'JSON inválido.' });
      return;
    }
    const code = (error as { code?: string }).code;
    if (
      code &&
      ['ECONNREFUSED', 'EACCES', 'ER_ACCESS_DENIED_ERROR', 'ER_BAD_DB_ERROR'].includes(code)
    ) {
      res
        .status(503)
        .json({ error: 'MySQL no está disponible. Revisa la configuración del servidor.' });
      return;
    }
    console.error('Error interno:', error instanceof Error ? error.message : 'desconocido');
    res.status(500).json({ error: 'Ocurrió un error en el servidor. Vuelve a intentarlo.' });
  });
  return app;
}
