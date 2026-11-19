/** Valida formularios, contraseñas y peticiones con Zod. */
import { z } from 'zod';

export const configSchema = z.object({
  genre: z.string().trim().min(1).max(40).default('Todas'),
  rounds: z.union([z.literal(5), z.literal(8), z.literal(10)]).default(10),
  seconds: z.union([z.literal(20), z.literal(30)]).default(20),
  answerMode: z.enum(['both', 'title']).default('both'),
});
export const settingsSchema = z.object({
  volume: z.number().int().min(0).max(100),
  music: z.number().int().min(0).max(100),
  effects: z.number().int().min(0).max(100),
  countdown: z.boolean(),
  autoplay: z.boolean(),
  contrast: z.boolean(),
  largeInterface: z.boolean(),
});
export const passwordSchema = z
  .string()
  .min(8, 'Usa al menos 8 caracteres.')
  .max(72)
  .refine(
    (value) => Buffer.byteLength(value, 'utf8') <= 72,
    'La contraseña supera los 72 bytes admitidos.',
  );
export const credentialsSchema = z.object({
  email: z
    .email()
    .max(254)
    .transform((value) => value.toLowerCase().trim()),
  password: passwordSchema,
  remember: z.boolean().optional(),
});
export const recoveryCodeSchema = z
  .string()
  .regex(/^\d{4,72}$/, 'El código de recuperación debe tener al menos 4 dígitos.');
export const registerSchema = credentialsSchema.extend({
  name: z.string().trim().min(2).max(30),
  recoveryCode: recoveryCodeSchema,
});
