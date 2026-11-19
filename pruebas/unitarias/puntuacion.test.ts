/** Comprueba respuestas, puntuación y validación de configuración. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizarRespuesta,
  esRespuestaCorrecta,
  calcularPuntos,
  barajado,
} from '../../servidor/servicios/puntuacion.js';
import { CONFIGURACION_PREDETERMINADA } from '../../compartido/tipos.js';
import { esquemaConfiguracion, esquemaContrasena } from '../../servidor/validacion.js';

test('normaliza tildes y signos sin aceptar respuestas parciales', () => {
  assert.equal(normalizarRespuesta('  ¡Für   ÉLISE! '), 'fur elise');
  assert.equal(
    esRespuestaCorrecta('fur elise', 'Para Elisa', ['Für Elise'], 'Beethoven', 'titulo'),
    true,
  );
  assert.equal(esRespuestaCorrecta('elisa', 'Para Elisa', [], 'Beethoven', 'titulo'), false);
  assert.equal(esRespuestaCorrecta('', 'Para Elisa', [], 'Beethoven', 'ambos'), false);
  assert.equal(esRespuestaCorrecta('beethoven', 'Para Elisa', [], 'Beethoven', 'titulo'), false);
  assert.equal(esRespuestaCorrecta('beethoven', 'Para Elisa', [], 'Beethoven', 'ambos'), true);
});
test('la puntuación depende del tiempo de respuesta, sin modificadores', () => {
  assert.equal(calcularPuntos(true, 0, CONFIGURACION_PREDETERMINADA), 1000);
  // DEFAULT_CONFIG usa rondas de 20 s: a la mitad del tiempo se obtienen 750 puntos.
  assert.equal(calcularPuntos(true, 10000, CONFIGURACION_PREDETERMINADA), 750);
  assert.equal(calcularPuntos(true, 20000, CONFIGURACION_PREDETERMINADA), 500);
  assert.equal(calcularPuntos(true, 20001, CONFIGURACION_PREDETERMINADA), 0);
  assert.equal(calcularPuntos(false, 1, CONFIGURACION_PREDETERMINADA), 0);
});
test('barajar conserva elementos únicos y no modifica el catálogo', () => {
  const fuente = [1, 2, 3, 4, 5];
  const resultado = barajado(fuente);
  assert.deepEqual(fuente, [1, 2, 3, 4, 5]);
  assert.deepEqual([...resultado].sort(), fuente);
  assert.equal(new Set(resultado).size, 5);
});
test('rechaza rondas arbitrarias y contraseñas truncadas por bcrypt', () => {
  assert.equal(
    esquemaConfiguracion.safeParse({ ...CONFIGURACION_PREDETERMINADA, rondas: 999 }).success,
    false,
  );
  assert.equal(esquemaContrasena.safeParse('á'.repeat(40)).success, false);
  assert.equal(esquemaContrasena.safeParse('contraseña-segura').success, true);
});
