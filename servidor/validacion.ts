/** Valida formularios, contraseñas y peticiones con Zod. */
import { z } from 'zod';

export const esquemaConfiguracion = z.object({
  genero: z.string().trim().min(1).max(40).default('Todas'),
  rondas: z.union([z.literal(5), z.literal(8), z.literal(10)]).default(10),
  segundos: z.union([z.literal(20), z.literal(30)]).default(20),
  modoRespuesta: z.enum(['ambos', 'titulo']).default('ambos'),
});
export const esquemaPreferencias = z.object({
  volumen: z.number().int().min(0).max(100),
  musica: z.number().int().min(0).max(100),
  efectos: z.number().int().min(0).max(100),
  cuentaRegresiva: z.boolean(),
  reproduccionAutomatica: z.boolean(),
  altoContraste: z.boolean(),
  interfazGrande: z.boolean(),
});
export const esquemaContrasena = z
  .string()
  .min(8, 'Usa al menos 8 caracteres.')
  .max(72)
  .refine(
    (valor) => Buffer.byteLength(valor, 'utf8') <= 72,
    'La contraseña supera los 72 bytes admitidos.',
  );
export const esquemaCredenciales = z.object({
  correo: z
    .email()
    .max(254)
    .transform((valor) => valor.toLowerCase().trim()),
  contrasena: esquemaContrasena,
  recordar: z.boolean().optional(),
});
export const esquemaCodigoRecuperacion = z
  .string()
  .regex(/^\d{4,72}$/, 'El código de recuperación debe tener al menos 4 dígitos.');
export const esquemaRegistro = esquemaCredenciales.extend({
  nombre: z.string().trim().min(2).max(30),
  codigoRecuperacion: esquemaCodigoRecuperacion,
});
