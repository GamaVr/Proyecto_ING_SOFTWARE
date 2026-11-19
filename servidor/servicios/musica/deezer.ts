/** Cliente de Deezer: valida respuestas, obtiene canciones por artista y transmite las muestras de audio. */
import type { Request, Response } from 'express';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { z } from 'zod';
import { HttpError } from '../../errores.js';
import { TRACKS_PER_ARTIST } from './artistas.js';

export type MusicFetch = typeof fetch;
const artistSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().trim().min(1).max(150),
  nb_fan: z.number().int().nonnegative().optional().default(0),
});
const recordingSchema = z.object({
  id: z.number().int().positive(),
  title: z.string().trim().min(1).max(150),
  title_short: z.string().trim().min(1).max(150).optional(),
  title_version: z.string().optional(),
  artist: artistSchema,
  album: z.object({ id: z.number().int().positive() }),
  readable: z.literal(true),
  preview: z.string().url(),
  release_date: z.string().optional(),
  rank: z.number().int().nonnegative().optional().default(0),
});
export type Recording = z.infer<typeof recordingSchema>;
export const DEEZER_TERMS = 'https://developers.deezer.com/termsofuse';
const albumDates = new Map<number, Promise<string | undefined>>();
let nextRequest = 0;
/** Normaliza nombres para exigir el perfil exacto y excluir artistas de covers o tributos. */
function artistKey(name: string): string {
  return name
    .replace(/[Яя]/g, 'r')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}
/** Acepta exclusivamente el CDN HTTPS de muestras de Deezer, sin credenciales ni puertos alternativos. */

export function safeRecordingAudio(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new HttpError(502, 'Dirección de audio inválida.');
  }
  if (
    url.protocol !== 'https:' ||
    !url.hostname.endsWith('.dzcdn.net') ||
    url.username ||
    url.password ||
    (url.port && url.port !== '443')
  )
    throw new HttpError(502, 'Destino de audio no autorizado por el proveedor.');
  return url;
}
/** Valida pistas originales del perfil seleccionado y descarta muestras ausentes, bloqueadas o inseguras. */

export function parseRecordings(data: unknown, artistId?: number): Recording[] {
  const result = z.object({ data: z.array(z.unknown()).max(100) }).safeParse(data);
  if (!result.success) throw new HttpError(502, 'Deezer devolvió un catálogo inválido.');
  const seen = new Set<string>();
  return result.data.data
    .flatMap((value) => {
      const parsed = recordingSchema.safeParse(value);
      if (!parsed.success) return [];
      const track = parsed.data;
      if (artistId !== undefined && track.artist.id !== artistId) return [];
      if (/\b(live|remix|karaoke|tribute)\b/i.test(track.title_version || '')) return [];
      try {
        safeRecordingAudio(track.preview);
      } catch {
        return [];
      }
      return [track];
    })
    .sort((a, b) => b.rank - a.rank)
    .filter((track) => {
      const key = `${track.artist.id}:${artistKey(track.title_short || track.title)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}
/** Consulta JSON oficial con tiempo límite y separa llamadas reales para evitar ráfagas. */
async function providerJson(path: string, fetcher: MusicFetch): Promise<unknown> {
  if (fetcher === fetch) {
    const start = Math.max(Date.now(), nextRequest);
    nextRequest = start + 140;
    if (start > Date.now()) await new Promise((resolve) => setTimeout(resolve, start - Date.now()));
  }
  try {
    const response = await fetcher(new URL(path, 'https://api.deezer.com'), {
      signal: AbortSignal.timeout(15000),
      redirect: 'error',
    });
    if (!response.ok) throw new Error('provider');
    const data: unknown = await response.json();
    if (typeof data === 'object' && data !== null && 'error' in data) throw new Error('provider');
    return data;
  } catch {
    throw new HttpError(
      502,
      'No pudimos consultar las canciones oficiales de Deezer. Comprueba Internet y vuelve a intentar.',
    );
  }
}
/** Reutiliza la fecha del álbum publicada por Deezer; no inventa fechas si faltan metadatos. */

async function albumDate(id: number, fetcher: MusicFetch): Promise<string | undefined> {
  const previous = albumDates.get(id);
  if (previous) return previous;
  const operation = providerJson(`/album/${id}`, fetcher)
    .then((data) => {
      const parsed = z
        .object({ release_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) })
        .safeParse(data);
      return parsed.success ? parsed.data.release_date : undefined;
    })
    .catch(() => {
      albumDates.delete(id);
      return undefined;
    });
  albumDates.set(id, operation);
  return operation;
}
/** Obtiene canciones del artista original, sin aceptar coincidencias aproximadas con otros intérpretes. */

export async function fetchArtistRecordings(
  name: string,
  fetcher: MusicFetch = fetch,
): Promise<Recording[]> {
  const response = await providerJson(
    `/search/artist?q=${encodeURIComponent(name)}&limit=100&order=RANKING`,
    fetcher,
  );
  const artists = z.object({ data: z.array(z.unknown()).max(100) }).safeParse(response);
  const artist = artists.success
    ? artists.data.data
        .flatMap((value) => {
          const parsed = artistSchema.safeParse(value);
          return parsed.success ? [parsed.data] : [];
        })
        .filter((item) => artistKey(item.name) === artistKey(name))
        .sort((a, b) => b.nb_fan - a.nb_fan)[0]
    : undefined;
  if (!artist) throw new HttpError(502, `No se encontró el perfil original de ${name}.`);
  const tracks = parseRecordings(
    await providerJson(`/artist/${artist.id}/top?limit=100`, fetcher),
    artist.id,
  ).slice(0, TRACKS_PER_ARTIST);
  return Promise.all(
    tracks.map(async (track) => ({
      ...track,
      release_date: await albumDate(track.album.id, fetcher),
    })),
  );
}
/** Resuelve una muestra vigente desde el identificador oficial, evitando enlaces firmados caducados. */

export async function resolveRecordingPreview(
  value: string,
  fetcher: MusicFetch = fetch,
): Promise<URL> {
  const match = /^https:\/\/api\.deezer\.com\/track\/(\d+)$/.exec(value);
  if (!match) throw new HttpError(502, 'Referencia de canción oficial inválida.');
  const data = await providerJson(`/track/${match[1]}`, fetcher);
  const parsed = z
    .object({
      id: z.number().int().positive(),
      readable: z.literal(true),
      preview: z.string().url(),
    })
    .safeParse(data);
  if (!parsed.success || String(parsed.data.id) !== match[1])
    throw new HttpError(502, 'Esta canción no tiene una muestra disponible en tu región.');
  return safeRecordingAudio(parsed.data.preview);
}
/** Transmite la muestra oficial solo para una ronda autorizada y valida cada redirección del CDN. */

export async function serveMusicAudio(
  media: { url: string | null },
  req: Request,
  res: Response,
  fetcher: MusicFetch = fetch,
): Promise<void> {
  if (!media.url)
    throw new HttpError(409, 'Esta partida usa el catálogo anterior. Crea una partida nueva.');
  let url = await resolveRecordingPreview(media.url, fetcher);
  res.set('Cache-Control', 'private, no-store');
  for (let redirect = 0; redirect < 5; redirect++) {
    let upstream: globalThis.Response;
    try {
      upstream = await fetcher(url, {
        redirect: 'manual',
        signal: AbortSignal.timeout(30000),
        headers: { ...(req.headers.range ? { Range: req.headers.range } : {}) },
      });
    } catch {
      throw new HttpError(
        502,
        'La muestra oficial no está disponible. Comprueba Internet e inténtalo nuevamente.',
      );
    }
    if ([301, 302, 303, 307, 308].includes(upstream.status)) {
      const target = upstream.headers.get('location');
      await upstream.body?.cancel();
      if (!target) break;
      url = safeRecordingAudio(new URL(target, url).href);
      continue;
    }
    if (
      ![200, 206, 416].includes(upstream.status) ||
      (upstream.status !== 416 && !/^audio\//i.test(upstream.headers.get('content-type') || ''))
    ) {
      await upstream.body?.cancel();
      throw new HttpError(502, 'Deezer no pudo reproducir esta muestra oficial.');
    }
    res.status(upstream.status);
    for (const header of ['content-type', 'content-length', 'content-range', 'accept-ranges']) {
      const value = upstream.headers.get(header);
      if (value) res.set(header, value);
    }
    if (upstream.body)
      await pipeline(
        Readable.fromWeb(upstream.body as Parameters<typeof Readable.fromWeb>[0]),
        res,
      );
    else res.end();
    return;
  }
  throw new HttpError(502, 'No se pudo resolver la muestra oficial de la ronda.');
}
