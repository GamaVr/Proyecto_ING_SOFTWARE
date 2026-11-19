/**
 * Importa listas de canciones (por ejemplo, exportadas de una lista de Spotify) al catálogo:
 * busca cada canción en Deezer y la guarda en el género que Deezer asigna a su álbum.
 */
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { escribir, transaccion } from '../../datos/base-datos.js';
import { GENEROS, type Genero } from '../../../compartido/musica.js';
import { almacenarGrabaciones } from './catalogo.js';
import {
  albumesPrincipales,
  buscarGrabacion,
  datosAlbum,
  type ConsultaMusica,
  type Grabacion,
} from './deezer.js';

/** Carpeta con un archivo JSON por lista. */
export const CARPETA_LISTAS = 'base-datos/listas';

const esquemaLista = z.object({
  nombre: z.string().trim().min(1),
  fuente: z.string().url().optional(),
  /** Género para las canciones cuyo álbum no tiene un género de `generosPermitidos`. */
  generoPredeterminado: z.enum(GENEROS),
  /** Géneros del juego en los que se puede repartir esta lista. */
  generosPermitidos: z.array(z.enum(GENEROS)).min(1),
  pistas: z
    .array(
      z.object({
        titulo: z.string().trim().min(1),
        artista: z.string().trim().min(1),
        spotify: z.string().optional(),
      }),
    )
    .min(1),
});
export type ListaCanciones = z.infer<typeof esquemaLista>;

/** Géneros de Deezer (identificador) y el género del juego al que corresponden. */
// Los géneros del juego son generales: agrupan varios de Deezer para que ninguno quede casi vacío.
const GENEROS_DEEZER: Record<number, Genero> = {
  152: 'Rock, Metal y Alternativa', // Rock
  155: 'Rock, Metal y Alternativa', // Hard Rock
  464: 'Rock, Metal y Alternativa', // Metal
  85: 'Rock, Metal y Alternativa', // Alternativo
  132: 'Pop, Rap y Electrónica', // Pop
  165: 'Pop, Rap y Electrónica', // R&B
  169: 'Pop, Rap y Electrónica', // Soul & Funk
  116: 'Pop, Rap y Electrónica', // Rap/Hip Hop
  106: 'Pop, Rap y Electrónica', // Electro
  113: 'Pop, Rap y Electrónica', // Dance
  197: 'Latina y Reggae', // Latino
  122: 'Latina y Reggae', // Reggaetón
  67: 'Latina y Reggae', // Salsa
  71: 'Latina y Reggae', // Cumbia
  65: 'Latina y Reggae', // Música Mexicana
  144: 'Latina y Reggae', // Reggae
};

/** Resultado de importar una o varias listas. */
export interface ResumenImportacion {
  /** Canciones guardadas por género. */
  porGenero: Record<string, number>;
  /** Canciones de la lista que no tienen una grabación equivalente con muestra en Deezer. */
  noEncontradas: string[];
  /** Canciones repetidas dentro de las listas (se guardan una sola vez). */
  repetidas: number;
}

/** Primer género de Deezer (el principal va primero) que corresponde a un género permitido. */
function generoPermitido(generosDeezer: number[], lista: ListaCanciones): Genero | undefined {
  for (const id of generosDeezer) {
    const genero = GENEROS_DEEZER[id];
    if (genero && lista.generosPermitidos.includes(genero)) return genero;
  }
  return undefined;
}

/** Elige el género del álbum que la lista permite o, si no hay, el predeterminado de la lista. */
export function generoDeAlbum(generosDeezer: number[], lista: ListaCanciones): Genero {
  return generoPermitido(generosDeezer, lista) ?? lista.generoPredeterminado;
}

/**
 * Para álbumes sin un género útil (bandas sonoras, recopilaciones), usa el género más frecuente
 * entre los álbumes de las canciones más populares del artista.
 */
async function generoDeArtista(
  artistaId: number,
  lista: ListaCanciones,
  consultarProveedor: ConsultaMusica,
): Promise<Genero | undefined> {
  const votos = new Map<Genero, number>();
  for (const albumId of await albumesPrincipales(artistaId, consultarProveedor)) {
    const genero = generoPermitido((await datosAlbum(albumId, consultarProveedor)).generos, lista);
    if (genero) votos.set(genero, (votos.get(genero) ?? 0) + 1);
  }
  return [...votos].sort((a, b) => b[1] - a[1])[0]?.[0];
}

/** Lee y valida un archivo de lista. */
export async function leerLista(ruta: string): Promise<ListaCanciones> {
  return esquemaLista.parse(JSON.parse(await readFile(ruta, 'utf8')));
}

/** Busca en Deezer las canciones de las listas y las agrupa por género, sin escribir en MySQL. */
export async function resolverListas(
  listas: ListaCanciones[],
  consultarProveedor: ConsultaMusica = fetch,
): Promise<{ porGenero: Map<string, Grabacion[]>; resumen: ResumenImportacion }> {
  const porGenero = new Map<string, Grabacion[]>();
  const vistas = new Set<number>();
  const resumen: ResumenImportacion = { porGenero: {}, noEncontradas: [], repetidas: 0 };
  for (const lista of listas)
    for (const { titulo, artista } of lista.pistas) {
      const pista = await buscarGrabacion(titulo, artista, consultarProveedor);
      if (!pista) {
        resumen.noEncontradas.push(`${artista} – ${titulo}`);
        continue;
      }
      if (vistas.has(pista.id)) {
        resumen.repetidas++;
        continue;
      }
      vistas.add(pista.id);
      const album = await datosAlbum(pista.album.id, consultarProveedor);
      const genero =
        generoPermitido(album.generos, lista) ??
        (await generoDeArtista(pista.artist.id, lista, consultarProveedor)) ??
        lista.generoPredeterminado;
      const grupo = porGenero.get(genero) ?? [];
      grupo.push({ ...pista, release_date: album.fecha });
      porGenero.set(genero, grupo);
    }
  for (const [genero, pistas] of porGenero) resumen.porGenero[genero] = pistas.length;
  return { porGenero, resumen };
}

/**
 * Reemplaza el catálogo por las canciones de todas las listas de `CARPETA_LISTAS`.
 * Las canciones que ya no están en ninguna lista quedan deshabilitadas (se conserva el historial).
 */
export async function importarListas(
  consultarProveedor: ConsultaMusica = fetch,
  carpeta = CARPETA_LISTAS,
): Promise<ResumenImportacion> {
  const archivos = (await readdir(carpeta)).filter((archivo) => archivo.endsWith('.json')).sort();
  const listas = await Promise.all(
    archivos.map((archivo) => leerLista(path.join(carpeta, archivo))),
  );
  const { porGenero, resumen } = await resolverListas(listas, consultarProveedor);
  await transaccion(async (bd) => {
    await escribir("UPDATE medios_cancion SET habilitada=FALSE WHERE fuente='deezer'", [], bd);
    for (const [genero, pistas] of porGenero) await almacenarGrabaciones(genero, pistas, bd);
  });
  return resumen;
}
