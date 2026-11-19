/** Comprueba respuestas, puntuación y validación de configuración. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeAnswer,
  isCorrectAnswer,
  calculatePoints,
  shuffled,
} from '../server/puntuacion.js';
import { DEFAULT_CONFIG } from '../shared/tipos.js';
import { configSchema, passwordSchema } from '../server/validacion.js';

test('normaliza tildes y signos sin aceptar respuestas parciales', () => {
  assert.equal(normalizeAnswer('  ¡Für   ÉLISE! '), 'fur elise');
  assert.equal(
    isCorrectAnswer('fur elise', 'Para Elisa', ['Für Elise'], 'Beethoven', 'title'),
    true,
  );
  assert.equal(isCorrectAnswer('elisa', 'Para Elisa', [], 'Beethoven', 'title'), false);
  assert.equal(isCorrectAnswer('', 'Para Elisa', [], 'Beethoven', 'both'), false);
  assert.equal(isCorrectAnswer('beethoven', 'Para Elisa', [], 'Beethoven', 'title'), false);
  assert.equal(isCorrectAnswer('beethoven', 'Para Elisa', [], 'Beethoven', 'both'), true);
});
test('la puntuación depende del tiempo de respuesta, sin modificadores', () => {
  assert.equal(calculatePoints(true, 0, DEFAULT_CONFIG), 1000);
  assert.equal(calculatePoints(true, 15000, DEFAULT_CONFIG), 500);
  assert.equal(calculatePoints(true, 15001, DEFAULT_CONFIG), 0);
  assert.equal(calculatePoints(false, 1, DEFAULT_CONFIG), 0);
});
test('barajar conserva elementos únicos y no modifica el catálogo', () => {
  const source = [1, 2, 3, 4, 5];
  const result = shuffled(source);
  assert.deepEqual(source, [1, 2, 3, 4, 5]);
  assert.deepEqual([...result].sort(), source);
  assert.equal(new Set(result).size, 5);
});
test('rechaza rondas arbitrarias y contraseñas truncadas por bcrypt', () => {
  assert.equal(configSchema.safeParse({ ...DEFAULT_CONFIG, rounds: 999 }).success, false);
  assert.equal(passwordSchema.safeParse('á'.repeat(40)).success, false);
  assert.equal(passwordSchema.safeParse('contraseña-segura').success, true);
});
