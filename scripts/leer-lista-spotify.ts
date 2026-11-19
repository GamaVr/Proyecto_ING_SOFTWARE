/**
 * Crea un archivo de base-datos/listas/ a partir de una lista pública de Spotify.
 * Uso: pnpm musica:leer-spotify <enlace de la lista> <nombre-archivo> [género predeterminado]
 *
 * Lee el reproductor incrustado público de Spotify, que entrega como máximo las primeras
 * 100 canciones. Solo se guardan título, artista principal e identificador de Spotify;
 * el audio se busca después en Deezer con pnpm musica:importar.
 */
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { GENEROS } from '../compartido/musica.js';
import { CARPETA_LISTAS } from '../servidor/servicios/musica/listas.js';

const esquemaPagina = z.object({
  props: z.object({
    pageProps: z.object({
      state: z.object({
        data: z.object({
          entity: z.object({
            name: z.string(),
            trackList: z.array(
              z.object({ title: z.string(), subtitle: z.string(), uri: z.string() }),
            ),
          }),
        }),
      }),
    }),
  }),
});

/** Descarga los datos públicos de la lista y escribe el archivo JSON. */
async function leer(): Promise<void> {
  const [enlace, archivo, predeterminado = 'Pop, Rap y Electrónica'] = process.argv.slice(2);
  const id = /playlist\/([A-Za-z0-9]+)/.exec(enlace ?? '')?.[1];
  if (!id || !archivo)
    throw new Error(
      'Uso: pnpm musica:leer-spotify <enlace de la lista> <nombre-archivo> [género predeterminado]',
    );
  const genero = z.enum(GENEROS).parse(predeterminado);
  const html = await (await fetch(`https://open.spotify.com/embed/playlist/${id}`)).text();
  const datos = /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/.exec(
    html,
  )?.[1];
  if (!datos) throw new Error('Spotify no devolvió la lista. ¿Es pública?');
  const lista = esquemaPagina.parse(JSON.parse(datos)).props.pageProps.state.data.entity;
  const destino = path.join(CARPETA_LISTAS, `${archivo.replace(/\.json$/, '')}.json`);
  await writeFile(
    destino,
    JSON.stringify(
      {
        nombre: lista.name,
        fuente: `https://open.spotify.com/playlist/${id}`,
        generoPredeterminado: genero,
        generosPermitidos: [...GENEROS],
        pistas: lista.trackList.map((pista) => ({
          titulo: pista.title,
          artista: pista.subtitle.split(',')[0].trim(),
          spotify: pista.uri.split(':').pop(),
        })),
      },
      null,
      2,
    ) + '\n',
  );
  console.log(`${lista.trackList.length} canciones de «${lista.name}» guardadas en ${destino}.`);
  if (lista.trackList.length === 100)
    console.warn('Spotify entrega como máximo 100 canciones; si la lista tiene más, faltan.');
}
leer().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
