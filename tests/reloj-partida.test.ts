/** Comprueba el contador, su detención y el reinicio de las rondas. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { remainingRoundSeconds } from '../shared/reloj-partida.js';
import { DEFAULT_CONFIG, type RoundResult } from '../shared/tipos.js';

const answer: RoundResult = {
  round: 0,
  userId: 'me',
  title: 'Numb',
  artist: 'Linkin Park',
  answer: 'Numb',
  correct: true,
  points: 1000,
  elapsed: 2400,
};
const game = {
  config: { ...DEFAULT_CONFIG, seconds: 15 },
  round: 0,
  startedAt: 1000,
  results: [] as RoundResult[],
};

test('el contador baja mientras la ronda está pendiente y respeta sus límites', () => {
  assert.equal(remainingRoundSeconds(game, 'me', 3400), 12.6);
  assert.equal(remainingRoundSeconds(game, 'me', 500), 15);
  assert.equal(remainingRoundSeconds(game, 'me', 20000), 0);
});
test('el contador se congela con el tiempo del servidor al responder, también después de recargar', () => {
  const answered = { ...game, results: [answer] };
  assert.equal(remainingRoundSeconds(answered, 'me', 3500), 12.6);
  assert.equal(remainingRoundSeconds(JSON.parse(JSON.stringify(answered)), 'me', 60000), 12.6);
});
test('la respuesta de otro jugador no detiene el reloj propio y una nueva ronda reinicia la cuenta', () => {
  assert.equal(
    remainingRoundSeconds({ ...game, results: [{ ...answer, userId: 'other' }] }, 'me', 5000),
    11,
  );
  assert.equal(
    remainingRoundSeconds({ ...game, round: 1, startedAt: 10000, results: [answer] }, 'me', 11000),
    14,
  );
});
test('responder mal, pasar o agotar el plazo también deja fijo el reloj de esa ronda', () => {
  assert.equal(
    remainingRoundSeconds(
      { ...game, results: [{ ...answer, correct: false, answer: '' }] },
      'me',
      60000,
    ),
    12.6,
  );
  assert.equal(
    remainingRoundSeconds({ ...game, results: [{ ...answer, elapsed: 20000 }] }, 'me', 60000),
    0,
  );
});
