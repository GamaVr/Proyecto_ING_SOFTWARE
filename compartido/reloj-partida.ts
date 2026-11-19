/** Calcula el contador y lo congela al responder una ronda. */
import type { EstadoPartida } from './tipos.js';

/** Congela el reloj personal con el tiempo guardado al responder y lo reinicia en cada nueva ronda. */
export function segundosRestantesRonda(
  partida: Pick<EstadoPartida, 'configuracion' | 'ronda' | 'resultados' | 'iniciadaEn'>,
  usuarioId: string,
  ahoraServidor: number,
): number {
  const respuesta = partida.resultados.find(
    (resultado) => resultado.ronda === partida.ronda && resultado.usuarioId === usuarioId,
  );
  const transcurrido = respuesta ? respuesta.transcurrido : ahoraServidor - partida.iniciadaEn;
  return Math.max(
    0,
    Math.min(partida.configuracion.segundos, partida.configuracion.segundos - transcurrido / 1000),
  );
}
