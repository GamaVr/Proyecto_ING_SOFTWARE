let contexto: AudioContext | null = null;

/** Crea el contexto de audio bajo demanda tras una interacción de reproducción. */
function obtenerContexto(): AudioContext {
  contexto ??= new AudioContext();
  return contexto;
}

/** Emite un aviso corto con el volumen de efectos configurado en los últimos tres segundos. */
export function pitidoCuentaRegresiva(volumen: number): void {
  if (volumen <= 0) return;
  const contextoAudio = obtenerContexto();
  if (contextoAudio.state !== 'running') return;
  const oscilador = contextoAudio.createOscillator(),
    ganancia = contextoAudio.createGain();
  oscilador.frequency.value = 740;
  ganancia.gain.setValueAtTime(volumen * 0.08, contextoAudio.currentTime);
  ganancia.gain.exponentialRampToValueAtTime(0.001, contextoAudio.currentTime + 0.09);
  oscilador.connect(ganancia);
  ganancia.connect(contextoAudio.destination);
  oscilador.start();
  oscilador.stop(contextoAudio.currentTime + 0.1);
  oscilador.onended = () => {
    oscilador.disconnect();
    ganancia.disconnect();
  };
}
