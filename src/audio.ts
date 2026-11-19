let context: AudioContext | null = null;

/** Crea el contexto de audio bajo demanda tras una interacción de reproducción. */
function getContext(): AudioContext {
  context ??= new AudioContext();
  return context;
}

/** Emite un aviso corto con el volumen de efectos configurado en los últimos tres segundos. */
export function countdownBeep(volume: number): void {
  if (volume <= 0) return;
  const audioContext = getContext();
  if (audioContext.state !== 'running') return;
  const oscillator = audioContext.createOscillator(),
    gain = audioContext.createGain();
  oscillator.frequency.value = 740;
  gain.gain.setValueAtTime(volume * 0.08, audioContext.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.09);
  oscillator.connect(gain);
  gain.connect(audioContext.destination);
  oscillator.start();
  oscillator.stop(audioContext.currentTime + 0.1);
  oscillator.onended = () => {
    oscillator.disconnect();
    gain.disconnect();
  };
}

