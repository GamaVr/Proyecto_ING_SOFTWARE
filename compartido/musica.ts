/** Define las opciones del catálogo y los géneros retirados. */
/** Categorías retiradas: no aparecen en opciones ni se seleccionan, aunque queden datos históricos. */
export const REMOVED_MUSIC_GENRES = ['Blues', 'Jazz', 'Country'] as const;

/** Opciones de configuración calculadas exclusivamente con grabaciones reales disponibles. */
export interface MusicOptions {
  genres: { name: string; count: number; artists: number }[];
  artists: number;
  total: number;
}
