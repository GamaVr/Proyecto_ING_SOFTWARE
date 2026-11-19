/** Calcula el contador y lo congela al responder una ronda. */
import type { GameSnapshot } from '../compartido/tipos.js';

/** Congela el reloj personal con el tiempo guardado al responder y lo reinicia en cada nueva ronda. */
export function remainingRoundSeconds(
  game: Pick<GameSnapshot, 'config' | 'round' | 'results' | 'startedAt'>,
  userId: string,
  serverNow: number,
): number {
  const answer = game.results.find(
    (result) => result.round === game.round && result.userId === userId,
  );
  const elapsed = answer ? answer.elapsed : serverNow - game.startedAt;
  return Math.max(0, Math.min(game.config.seconds, game.config.seconds - elapsed / 1000));
}
