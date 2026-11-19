/** Define las opciones del catálogo y los géneros retirados. */
/** Categorías retiradas: no aparecen en opciones ni se seleccionan, aunque queden datos históricos. */
export const GENEROS_RETIRADOS = ['Blues', 'Jazz', 'Country'] as const;

/** Opciones de configuración calculadas exclusivamente con grabaciones reales disponibles. */
export interface OpcionesMusica {
  generos: { nombre: string; cantidad: number; artistas: number }[];
  artistas: number;
  total: number;
}
