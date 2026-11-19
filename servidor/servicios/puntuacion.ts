/** Compara respuestas y calcula los puntos obtenidos. */
import { randomInt } from 'node:crypto';
import type { GameConfig } from '../../compartido/tipos.js';

/** Normaliza tildes, signos y espacios sin aceptar coincidencias parciales inseguras. */
export function normalizeAnswer(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Compara una respuesta completa con títulos alternativos y, si se permite, con el compositor. */
export function isCorrectAnswer(
  answer: string,
  title: string,
  aliases: string[],
  artist: string,
  mode: GameConfig['answerMode'],
): boolean {
  const normalized = normalizeAnswer(answer);
  if (!normalized) return false;
  return [...aliases, title, ...(mode === 'both' ? [artist] : [])].some(
    (candidate) => normalizeAnswer(candidate) === normalized,
  );
}

/** Calcula puntos desde el tiempo del servidor. */
export function calculatePoints(correct: boolean, elapsedMs: number, config: GameConfig): number {
  if (!correct || elapsedMs > config.seconds * 1000) return 0;
  const speed = Math.max(0, 1 - elapsedMs / (config.seconds * 1000));
  return Math.round(500 + 500 * speed);
}

/** Baraja sin modificar el catálogo y evita repetir canciones dentro de una partida. */
export function shuffled<T>(items: T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/** Convierte JSON devuelto por diferentes configuraciones del driver MySQL. */
export function parseJson<T>(value: T | string): T {
  return typeof value === 'string' ? (JSON.parse(value) as T) : value;
}
