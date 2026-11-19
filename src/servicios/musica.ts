/** Obtiene las opciones musicales disponibles para configurar partidas. */
import { useEffect, useState } from 'react';
import { api } from './api';
import type { MusicOptions } from '../../compartido/musica';

/** Obtiene los géneros reales del proveedor para configurar individual, duelo o equipos. */
export function useMusicOptions(): { options: MusicOptions; error: string; loading: boolean } {
  const [options, setOptions] = useState<MusicOptions>({
      genres: [],
      total: 0,
      artists: 0,
    }),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(true);
  useEffect(() => {
    let disposed = false;
    void api<MusicOptions>('/music/options')
      .then((value) => {
        if (!disposed) setOptions(value);
      })
      .catch((failure) => {
        if (!disposed) setError(failure.message);
      })
      .finally(() => {
        if (!disposed) setLoading(false);
      });
    return () => {
      disposed = true;
    };
  }, []);
  return { options, error, loading };
}
