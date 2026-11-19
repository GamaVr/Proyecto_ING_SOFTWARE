/** Cliente de Deezer: valida respuestas, obtiene canciones por artista y transmite las muestras de audio. */
import type { Request, Response } from 'express';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { z } from 'zod';
import { ErrorHttp } from '../../errores.js';
import { PISTAS_POR_ARTISTA } from './artistas.js';

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
const fechasAlbum = new Map<number, Promise<string | undefined>>();
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
  const vistos = new Set<string>();
  return resultado.data.data
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
    .filter((pista) => {
      const clave = `${pista.artist.id}:${claveArtista(pista.title_short || pista.title)}`;
      if (vistos.has(clave)) return false;
      vistos.add(clave);
      return true;
    });
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
/** Reutiliza la fecha del álbum publicada por Deezer; no inventa fechas si faltan metadatos. */

async function fechaAlbum(
  id: number,
  consultarProveedor: ConsultaMusica,
): Promise<string | undefined> {
  const previo = fechasAlbum.get(id);
  if (previo) return previo;
  const operacion = consultarJsonProveedor(`/album/${id}`, consultarProveedor)
    .then((datos) => {
      const analizado = z
        .object({ release_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) })
        .safeParse(datos);
      return analizado.success ? analizado.data.release_date : undefined;
    })
    .catch(() => {
      fechasAlbum.delete(id);
      return undefined;
    });
  fechasAlbum.set(id, operacion);
  return operacion;
}
/** Obtiene canciones del artista original, sin aceptar coincidencias aproximadas con otros intérpretes. */

export async function obtenerGrabacionesArtista(
  nombre: string,
  consultarProveedor: ConsultaMusica = fetch,
): Promise<Grabacion[]> {
  const respuestaHttp = await consultarJsonProveedor(
    `/search/artist?q=${encodeURIComponent(nombre)}&limit=100&order=RANKING`,
    consultarProveedor,
  );
  const artistas = z.object({ data: z.array(z.unknown()).max(100) }).safeParse(respuestaHttp);
  const artista = artistas.success
    ? artistas.data.data
        .flatMap((valor) => {
          const analizado = esquemaArtista.safeParse(valor);
          return analizado.success ? [analizado.data] : [];
        })
        .filter((elemento) => claveArtista(elemento.name) === claveArtista(nombre))
        .sort((a, b) => b.nb_fan - a.nb_fan)[0]
    : undefined;
  if (!artista) throw new ErrorHttp(502, `No se encontró el perfil original de ${nombre}.`);
  const pistas = interpretarGrabaciones(
    await consultarJsonProveedor(`/artist/${artista.id}/top?limit=100`, consultarProveedor),
    artista.id,
  ).slice(0, PISTAS_POR_ARTISTA);
  return Promise.all(
    pistas.map(async (pista) => ({
      ...pista,
      release_date: await fechaAlbum(pista.album.id, consultarProveedor),
    })),
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
