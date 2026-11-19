/** Guarda las canciones del catálogo y calcula los géneros disponibles para jugar. */
import { consultar, escribir, transaccion, type BaseDatos } from '../../datos/base-datos.js';
import { ErrorHttp } from '../../errores.js';
import { GENEROS_RETIRADOS, type OpcionesMusica } from '../../../compartido/musica.js';
import { TERMINOS_DEEZER, type Grabacion } from './deezer.js';

/** Persiste referencias y metadatos; las URL firmadas de audio se resuelven al reproducir cada ronda. */
export async function almacenarGrabaciones(
  genero: string,
  pistas: Grabacion[],
  conexion?: BaseDatos,
): Promise<void> {
  if (
    GENEROS_RETIRADOS.some((eliminado) => eliminado.toLowerCase() === genero.trim().toLowerCase())
  )
    throw new ErrorHttp(422, 'Esta categoría fue retirada del juego.');
  /** Escribe un lote con la misma transacción para no publicar catálogos parciales. */
  async function almacenar(bd: BaseDatos): Promise<void> {
    for (const pista of pistas) {
      const id = `deezer-${pista.id}`,
        anio = Number(pista.release_date?.slice(0, 4)) || 0;
      const alias = JSON.stringify(
        pista.title_short && pista.title_short !== pista.title ? [pista.title_short] : [],
      );
      await escribir(
        'INSERT INTO canciones(id,titulo,artista,alias,genero,anio_lanzamiento) VALUES (?,?,?,?,?,?) ON DUPLICATE KEY UPDATE titulo=VALUES(titulo),artista=VALUES(artista),alias=VALUES(alias),genero=VALUES(genero),anio_lanzamiento=VALUES(anio_lanzamiento)',
        [id, pista.title, pista.artist.name, alias, genero, anio],
        bd,
      );
      await escribir(
        "INSERT INTO medios_cancion(cancion_id,fuente,id_externo,url_audio,url_licencia,url_fuente,habilitada,inicio_fragmento,duracion) VALUES (?,'deezer',?,?,?,?,TRUE,0,30) ON DUPLICATE KEY UPDATE habilitada=TRUE,url_audio=VALUES(url_audio),url_licencia=VALUES(url_licencia),url_fuente=VALUES(url_fuente),inicio_fragmento=0,duracion=30,actualizado_en=CURRENT_TIMESTAMP",
        [
          id,
          String(pista.id),
          `https://api.deezer.com/track/${pista.id}`,
          TERMINOS_DEEZER,
          `https://www.deezer.com/track/${pista.id}`,
        ],
        bd,
      );
    }
  }
  if (conexion) await almacenar(conexion);
  else await transaccion(almacenar);
}

/** Ofrece únicamente géneros con al menos cinco canciones disponibles para comenzar una partida. */
export async function opcionesMusica(): Promise<OpcionesMusica> {
  const generos = await consultar<{ nombre: string; cantidad: number; artistas: number }>(
    "SELECT s.genero AS nombre,COUNT(*) AS cantidad,COUNT(DISTINCT s.artista) AS artistas FROM canciones s JOIN medios_cancion m ON m.cancion_id=s.id WHERE m.habilitada=1 AND m.fuente='deezer' AND s.genero NOT IN (?,?,?) GROUP BY s.genero HAVING COUNT(*)>=5 ORDER BY s.genero",
    [...GENEROS_RETIRADOS],
  );
  const total = generos.reduce((suma, elemento) => suma + Number(elemento.cantidad), 0);
  if (!total)
    throw new ErrorHttp(
      503,
      'Todavía no hay canciones en el catálogo. Importa las listas con pnpm musica:importar.',
    );
  return {
    generos: generos.map((elemento) => ({
      ...elemento,
      cantidad: Number(elemento.cantidad),
      artistas: Number(elemento.artistas),
    })),
    artistas: generos.reduce((suma, elemento) => suma + Number(elemento.artistas), 0),
    total,
  };
}
