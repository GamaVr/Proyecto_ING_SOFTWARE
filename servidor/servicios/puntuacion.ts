/** Compara respuestas y calcula los puntos obtenidos. */
import { randomInt } from 'node:crypto';
import type { ConfiguracionPartida } from '../../compartido/tipos.js';

/** Normaliza tildes, signos y espacios sin aceptar coincidencias parciales inseguras. */
export function normalizarRespuesta(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Compara una respuesta completa con títulos alternativos y, si se permite, con el compositor. */
export function esRespuestaCorrecta(
  respuesta: string,
  titulo: string,
  alias: string[],
  artista: string,
  modo: ConfiguracionPartida['modoRespuesta'],
): boolean {
  const normalizada = normalizarRespuesta(respuesta);
  if (!normalizada) return false;
  return [...alias, titulo, ...(modo === 'ambos' ? [artista] : [])].some(
    (candidato) => normalizarRespuesta(candidato) === normalizada,
  );
}

/** Calcula puntos desde el tiempo del servidor. */
export function calcularPuntos(
  correcta: boolean,
  transcurridoMs: number,
  configuracion: ConfiguracionPartida,
): number {
  if (!correcta || transcurridoMs > configuracion.segundos * 1000) return 0;
  const rapidez = Math.max(0, 1 - transcurridoMs / (configuracion.segundos * 1000));
  return Math.round(500 + 500 * rapidez);
}

/** Baraja sin modificar el catálogo y evita repetir canciones dentro de una partida. */
export function barajado<T>(elementos: T[]): T[] {
  const resultado = [...elementos];
  for (let i = resultado.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [resultado[i], resultado[j]] = [resultado[j], resultado[i]];
  }
  return resultado;
}

/** Convierte JSON devuelto por diferentes configuraciones del driver MySQL. */
export function interpretarJson<T>(valor: T | string): T {
  return typeof valor === 'string' ? (JSON.parse(valor) as T) : valor;
}
