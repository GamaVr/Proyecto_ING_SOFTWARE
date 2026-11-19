/** Obtiene las opciones musicales disponibles para configurar partidas. */
import { useEffect, useState } from 'react';
import { api } from './api';
import type { OpcionesMusica } from '../../compartido/musica';

/** Obtiene los géneros reales del proveedor para configurar individual, duelo o equipos. */
export function useOpcionesMusica(): {
  opciones: OpcionesMusica;
  error: string;
  cargando: boolean;
} {
  const [opciones, fijarOpciones] = useState<OpcionesMusica>({
      generos: [],
      total: 0,
      artistas: 0,
    }),
    [error, fijarError] = useState(''),
    [cargando, fijarCargando] = useState(true);
  useEffect(() => {
    let descartado = false;
    void api<OpcionesMusica>('/musica/opciones')
      .then((valor) => {
        if (!descartado) fijarOpciones(valor);
      })
      .catch((fallo) => {
        if (!descartado) fijarError(fallo.message);
      })
      .finally(() => {
        if (!descartado) fijarCargando(false);
      });
    return () => {
      descartado = true;
    };
  }, []);
  return { opciones, error, cargando };
}
