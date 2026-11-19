/** Comprueba el contador, su detención y el reinicio de las rondas. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { segundosRestantesRonda } from '../../compartido/reloj-partida.js';
import { CONFIGURACION_PREDETERMINADA, type ResultadoRonda } from '../../compartido/tipos.js';

const respuesta: ResultadoRonda = {
  ronda: 0,
  usuarioId: 'me',
  titulo: 'Numb',
  artista: 'Linkin Park',
  respuesta: 'Numb',
  correcta: true,
  puntos: 1000,
  transcurrido: 2400,
};
const partida = {
  configuracion: { ...CONFIGURACION_PREDETERMINADA, segundos: 15 },
  ronda: 0,
  iniciadaEn: 1000,
  resultados: [] as ResultadoRonda[],
};

test('el contador baja mientras la ronda está pendiente y respeta sus límites', () => {
  assert.equal(segundosRestantesRonda(partida, 'me', 3400), 12.6);
  assert.equal(segundosRestantesRonda(partida, 'me', 500), 15);
  assert.equal(segundosRestantesRonda(partida, 'me', 20000), 0);
});
test('el contador se congela con el tiempo del servidor al responder, también después de recargar', () => {
  const respondida = { ...partida, resultados: [respuesta] };
  assert.equal(segundosRestantesRonda(respondida, 'me', 3500), 12.6);
  assert.equal(segundosRestantesRonda(JSON.parse(JSON.stringify(respondida)), 'me', 60000), 12.6);
});
test('la respuesta de otro jugador no detiene el reloj propio y una nueva ronda reinicia la cuenta', () => {
  assert.equal(
    segundosRestantesRonda(
      { ...partida, resultados: [{ ...respuesta, usuarioId: 'other' }] },
      'me',
      5000,
    ),
    11,
  );
  assert.equal(
    segundosRestantesRonda(
      { ...partida, ronda: 1, iniciadaEn: 10000, resultados: [respuesta] },
      'me',
      11000,
    ),
    14,
  );
});
test('responder mal, pasar o agotar el plazo también deja fijo el reloj de esa ronda', () => {
  assert.equal(
    segundosRestantesRonda(
      { ...partida, resultados: [{ ...respuesta, correcta: false, respuesta: '' }] },
      'me',
      60000,
    ),
    12.6,
  );
  assert.equal(
    segundosRestantesRonda(
      { ...partida, resultados: [{ ...respuesta, transcurrido: 20000 }] },
      'me',
      60000,
    ),
    0,
  );
});
