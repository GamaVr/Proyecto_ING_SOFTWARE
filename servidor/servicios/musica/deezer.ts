/** Cliente de Deezer: valida respuestas, busca canciones y álbumes y transmite las muestras de audio. */
import type { Request, Response } from 'express';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { z } from 'zod';
import { ErrorHttp } from '../../errores.js';

export type ConsultaMusica = typeof fetch;
const esquemaArtista = z.object({
  id: z.number().int().positive(),
  name: z.string().trim().min(1).max(150),
  nb_fan: z.number().int().nonnegative().optional().default(0),
});
const esquemaGrabacion = z.object({
  id: z.number().int().positive(),
  title: z.string().trim().min(1).max(150),
  title_short: z.string().trim().min(1).max(150).optional(),
  title_version: z.string().optional(),
  artist: esquemaArtista,
  album: z.object({ id: z.number().int().positive() }),
  readable: z.literal(true),
  preview: z.string().url(),
  release_date: z.string().optional(),
  rank: z.number().int().nonnegative().optional().default(0),
});
export type Grabacion = z.infer<typeof esquemaGrabacion>;
export const TERMINOS_DEEZER = 'https://developers.deezer.com/termsofuse';
const albumes = new Map<number, Promise<DatosAlbum>>();
let siguienteSolicitud = 0;
/** Normaliza nombres para exigir el perfil exacto y excluir artistas de covers o tributos. */
function claveArtista(nombre: string): string {
  return nombre
    .replace(/[Яя]/g, 'r')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}
/** Acepta exclusivamente el CDN HTTPS de muestras de Deezer, sin credenciales ni puertos alternativos. */

export function validarAudioGrabacion(valor: string): URL {
  let url: URL;
  try {
    url = new URL(valor);
  } catch {
    throw new ErrorHttp(502, 'Dirección de audio inválida.');
  }
  if (
    url.protocol !== 'https:' ||
    !url.hostname.endsWith('.dzcdn.net') ||
    url.username ||
    url.password ||
    (url.port && url.port !== '443')
  )
    throw new ErrorHttp(502, 'Destino de audio no autorizado por el proveedor.');
  return url;
}
/** Valida pistas originales del perfil seleccionado y descarta muestras ausentes, bloqueadas o inseguras. */

export function interpretarGrabaciones(datos: unknown, artistaId?: number): Grabacion[] {
  const resultado = z.object({ data: z.array(z.unknown()).max(100) }).safeParse(datos);
  if (!resultado.success) throw new ErrorHttp(502, 'Deezer devolvió un catálogo inválido.');
  const vistos = new Set<number>();
  return (
    resultado.data.data
      .flatMap((valor) => {
        const analizado = esquemaGrabacion.safeParse(valor);
        if (!analizado.success) return [];
        const pista = analizado.data;
        if (artistaId !== undefined && pista.artist.id !== artistaId) return [];
        if (/\b(live|remix|karaoke|tribute)\b/i.test(pista.title_version || '')) return [];
        try {
          validarAudioGrabacion(pista.preview);
        } catch {
          return [];
        }
        return [pista];
      })
      .sort((a, b) => b.rank - a.rank)
      // Solo se quitan pistas repetidas; las versiones con el mismo título se filtran al buscar.
      .filter((pista) => {
        if (vistos.has(pista.id)) return false;
        vistos.add(pista.id);
        return true;
      })
  );
}
/** Consulta JSON oficial con tiempo límite y separa llamadas reales para evitar ráfagas. */
async function consultarJsonProveedor(
  ruta: string,
  consultarProveedor: ConsultaMusica,
): Promise<unknown> {
  if (consultarProveedor === fetch) {
    const inicio = Math.max(Date.now(), siguienteSolicitud);
    siguienteSolicitud = inicio + 140;
    if (inicio > Date.now())
      await new Promise((resolve) => setTimeout(resolve, inicio - Date.now()));
  }
  try {
    const respuestaHttp = await consultarProveedor(new URL(ruta, 'https://api.deezer.com'), {
      signal: AbortSignal.timeout(15000),
      redirect: 'error',
    });
    if (!respuestaHttp.ok) throw new Error('provider');
    const datos: unknown = await respuestaHttp.json();
    if (typeof datos === 'object' && datos !== null && 'error' in datos)
      throw new Error('provider');
    return datos;
  } catch {
    throw new ErrorHttp(
      502,
      'No pudimos consultar las canciones oficiales de Deezer. Comprueba Internet y vuelve a intentar.',
    );
  }
}
/** Fecha de publicación y géneros (identificadores de Deezer, el principal primero) de un álbum. */
export interface DatosAlbum {
  fecha?: string;
  generos: number[];
}
const esquemaAlbum = z.object({
  release_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  genres: z.object({ data: z.array(z.object({ id: z.number().int() })) }).optional(),
});

/** Consulta una sola vez cada álbum; si faltan metadatos no inventa fecha ni género. */
export async function datosAlbum(
  id: number,
  consultarProveedor: ConsultaMusica = fetch,
): Promise<DatosAlbum> {
  const previo = albumes.get(id);
  if (previo) return previo;
  const operacion = consultarJsonProveedor(`/album/${id}`, consultarProveedor)
    .then((datos) => {
      const analizado = esquemaAlbum.safeParse(datos);
      if (!analizado.success) return { generos: [] };
      return {
        fecha: analizado.data.release_date,
        generos: analizado.data.genres?.data.map((genero) => genero.id) ?? [],
      };
    })
    .catch(() => {
      albumes.delete(id);
      return { generos: [] };
    });
  albumes.set(id, operacion);
  return operacion;
}

/** Álbumes de las canciones más populares de un artista (sin repetir). */
export async function albumesPrincipales(
  artistaId: number,
  consultarProveedor: ConsultaMusica = fetch,
): Promise<number[]> {
  const datos = await consultarJsonProveedor(
    `/artist/${artistaId}/top?limit=10`,
    consultarProveedor,
  );
  const analizado = z
    .object({ data: z.array(z.object({ album: z.object({ id: z.number().int() }) })) })
    .safeParse(datos);
  return analizado.success ? [...new Set(analizado.data.data.map((pista) => pista.album.id))] : [];
}

/** Palabras que identifican una versión distinta de la grabación original. */
const VERSIONES_ALTERNATIVAS =
  /\b(remix|mix|acoustic|acústica|acustica|extended|live|en vivo|instrumental|karaoke|slowed|reverb|sped up|piano|orchestral|unplugged|cover)\b/g;

/**
 * Título comparable: sin sufijos de edición (" - Remastered 2023", " - From ... Soundtrack")
 * ni partes entre paréntesis o corchetes, en minúsculas y sin signos ni tildes.
 */
export function claveTitulo(titulo: string): string {
  return claveArtista(titulo.split(' - ')[0].replace(/\s*[([][^)\]]*[)\]]/g, ''));
}

/**
 * Busca en Deezer la grabación original de una canción concreta (por ejemplo, de una lista de
 * Spotify). Exige el mismo artista principal y el mismo título, descarta versiones en vivo,
 * remezclas y pistas sin muestra, y entre las coincidencias elige la más popular.
 */
export async function buscarGrabacion(
  titulo: string,
  artista: string,
  consultarProveedor: ConsultaMusica = fetch,
): Promise<Grabacion | undefined> {
  const tituloBase =
    titulo
      .split(' - ')[0]
      .replace(/\s*[([][^)\]]*[)\]]/g, '')
      .trim() || titulo;
  const datos = await consultarJsonProveedor(
    `/search?q=${encodeURIComponent(`${artista} ${tituloBase}`)}&limit=50`,
    consultarProveedor,
  );
  // Una versión alternativa (remix, acústica, extendida...) solo vale si la lista la pide.
  const versionesPedidas = new Set(titulo.toLowerCase().match(VERSIONES_ALTERNATIVAS) ?? []);
  const esOtraVersion = (pista: Grabacion): boolean =>
    (
      `${pista.title} ${pista.title_version ?? ''}`.toLowerCase().match(VERSIONES_ALTERNATIVAS) ??
      []
    ).some((palabra) => !versionesPedidas.has(palabra));
  return interpretarGrabaciones(datos).find(
    (pista) =>
      claveArtista(pista.artist.name) === claveArtista(artista) &&
      claveTitulo(pista.title_short || pista.title) === claveTitulo(titulo) &&
      !esOtraVersion(pista),
  );
}
/** Resuelve una muestra vigente desde el identificador oficial, evitando enlaces firmados caducados. */

export async function resolverMuestraGrabacion(
  valor: string,
  consultarProveedor: ConsultaMusica = fetch,
): Promise<URL> {
  const coincidencia = /^https:\/\/api\.deezer\.com\/track\/(\d+)$/.exec(valor);
  if (!coincidencia) throw new ErrorHttp(502, 'Referencia de canción oficial inválida.');
  const datos = await consultarJsonProveedor(`/track/${coincidencia[1]}`, consultarProveedor);
  const analizado = z
    .object({
      id: z.number().int().positive(),
      readable: z.literal(true),
      preview: z.string().url(),
    })
    .safeParse(datos);
  if (!analizado.success || String(analizado.data.id) !== coincidencia[1])
    throw new ErrorHttp(502, 'Esta canción no tiene una muestra disponible en tu región.');
  return validarAudioGrabacion(analizado.data.preview);
}
/** Transmite la muestra oficial solo para una ronda autorizada y valida cada redirección del CDN. */

export async function transmitirAudioMusica(
  medio: { url: string | null },
  req: Request,
  res: Response,
  consultarProveedor: ConsultaMusica = fetch,
): Promise<void> {
  if (!medio.url)
    throw new ErrorHttp(409, 'Esta partida usa el catálogo anterior. Crea una partida nueva.');
  let url = await resolverMuestraGrabacion(medio.url, consultarProveedor);
  res.set('Cache-Control', 'private, no-store');
  for (let redireccion = 0; redireccion < 5; redireccion++) {
    let origenAudio: globalThis.Response;
    try {
      origenAudio = await consultarProveedor(url, {
        redirect: 'manual',
        signal: AbortSignal.timeout(30000),
        headers: { ...(req.headers.range ? { Range: req.headers.range } : {}) },
      });
    } catch {
      throw new ErrorHttp(
        502,
        'La muestra oficial no está disponible. Comprueba Internet e inténtalo nuevamente.',
      );
    }
    if ([301, 302, 303, 307, 308].includes(origenAudio.status)) {
      const destino = origenAudio.headers.get('location');
      await origenAudio.body?.cancel();
      if (!destino) break;
      url = validarAudioGrabacion(new URL(destino, url).href);
      continue;
    }
    if (
      ![200, 206, 416].includes(origenAudio.status) ||
      (origenAudio.status !== 416 &&
        !/^audio\//i.test(origenAudio.headers.get('content-type') || ''))
    ) {
      await origenAudio.body?.cancel();
      throw new ErrorHttp(502, 'Deezer no pudo reproducir esta muestra oficial.');
    }
    res.status(origenAudio.status);
    for (const encabezado of ['content-type', 'content-length', 'content-range', 'accept-ranges']) {
      const valor = origenAudio.headers.get(encabezado);
      if (valor) res.set(encabezado, valor);
    }
    if (origenAudio.body)
      await pipeline(
        Readable.fromWeb(origenAudio.body as Parameters<typeof Readable.fromWeb>[0]),
        res,
      );
    else res.end();
    return;
  }
  throw new ErrorHttp(502, 'No se pudo resolver la muestra oficial de la ronda.');
}
