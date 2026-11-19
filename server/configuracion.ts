/** Valida las variables de entorno y los orígenes permitidos. */
import 'dotenv/config';
import { z } from 'zod';

const environment = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  HOST: z.string().default('127.0.0.1'),
  APP_ORIGIN: z.string().url().default('http://localhost:5173'),
  PUBLIC_APP_URL: z.string().url().optional(),
  RESEND_API_KEY: z.string().default(''),
  EMAIL_FROM: z.string().default('Guess The Beat <onboarding@resend.dev>'),
  DB_HOST: z.string().default('127.0.0.1'),
  DB_PORT: z.coerce.number().default(3306),
  DB_USER: z.string().default('guess_app'),
  DB_PASSWORD: z.string().default(''),
  DB_NAME: z
    .string()
    .regex(/^[a-zA-Z0-9_]+$/)
    .default('guess_the_beat'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
});
export const env = environment.parse(process.env);

/** Permite los dos nombres de loopback solo en desarrollo; producción conserva el origen explícito. */
export function allowedOrigins(): string[] {
  const origins = [env.APP_ORIGIN];
  if (env.NODE_ENV === 'development') {
    const url = new URL(env.APP_ORIGIN);
    if (['localhost', '127.0.0.1'].includes(url.hostname)) {
      url.hostname = url.hostname === 'localhost' ? '127.0.0.1' : 'localhost';
      origins.push(url.origin);
    }
  }
  return origins;
}
