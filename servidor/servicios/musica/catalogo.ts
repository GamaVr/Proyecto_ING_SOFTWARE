/** Consulta Deezer, sincroniza canciones y entrega el audio autorizado. */
import { createHash } from 'node:crypto';
import { consultar, escribir, transaccion, type BaseDatos } from '../../datos/base-datos.js';
import { entorno } from '../../configuracion.js';
import { ErrorHttp } from '../../errores.js';
import { GENEROS_RETIRADOS, type OpcionesMusica } from '../../../compartido/musica.js';
import { GENEROS_GRABACIONES, ARTISTAS_POR_GENERO, PISTAS_POR_ARTISTA } from './artistas.js';
import {
  TERMINOS_DEEZER,
  obtenerGrabacionesArtista,
  type ConsultaMusica,
  type Grabacion,
} from './deezer.js';
export {
  GENEROS_GRABACIONES as RECORDING_GENRES,
  ARTISTAS_POR_GENERO as ARTISTS_PER_GENRE,
  PISTAS_POR_ARTISTA as TRACKS_PER_ARTIST,
} from './artistas.js';

const enCurso = new Map<string, Promise<void>>(),
  ultimoExito = new Map<string, number>(),
  ultimoFallo = new Map<string, number>();
let actualizacionEnSegundoPlano: Promise<void> | undefined;

/** Reúne un género conservando a los artistas disponibles si falla otro perfil. */
async function obtenerGrabaciones(
  genero: string,
  consultarProveedor: ConsultaMusica = fetch,
): Promise<Grabacion[]> {
  const correspondencia = GENEROS_GRABACIONES.find((elemento) => elemento.nombre === genero);
  if (!correspondencia) throw new ErrorHttp(422, 'Ese género no está disponible.');
  const pistas: Grabacion[] = [];
  const seleccionado = new Set<number>();
  for (const nombre of [...correspondencia.artistas, ...correspondencia.alternativos]) {
    if (seleccionado.size === ARTISTAS_POR_GENERO) break;
    try {
      const canciones = await obtenerGrabacionesArtista(nombre, consultarProveedor);
      if (canciones.length !== PISTAS_POR_ARTISTA)
        throw new Error(`solo ${canciones.length} muestras disponibles`);
      if (seleccionado.has(canciones[0].artist.id)) continue;
      seleccionado.add(canciones[0].artist.id);
      pistas.push(...canciones);
    } catch (error) {
      if (consultarProveedor === fetch)
        console.warn(
          `Catálogo pendiente: ${nombre}`,
          error instanceof Error ? error.message : 'proveedor',
        );
    }
  }
  if (
    seleccionado.size !== ARTISTAS_POR_GENERO ||
    new Set(pistas.map((pista) => pista.id)).size !== ARTISTAS_POR_GENERO * PISTAS_POR_ARTISTA
  )
    throw new ErrorHttp(
      502,
      `${genero}: solo se encontraron ${seleccionado.size}/${ARTISTAS_POR_GENERO} artistas con cinco canciones oficiales disponibles.`,
    );
  return pistas;
}

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

/** Comparte sincronizaciones por género y reutiliza referencias recientes incluso después de reiniciar. */
export async function asegurarGeneroGrabaciones(
  genero: string,
  consultarProveedor: ConsultaMusica = fetch,
  forzar = false,
): Promise<void> {
  if (!forzar && entorno.NODE_ENV === 'test') return;
  const ahora = Date.now();
  if (!forzar && ahora - (ultimoExito.get(genero) || 0) < 12 * 3600000) return;
  if (!forzar && ahora - (ultimoFallo.get(genero) || 0) < 60000) return;
  const pendiente = enCurso.get(genero);
  if (pendiente) return pendiente;
  const operacion = (async () => {
    try {
      const correspondencia = GENEROS_GRABACIONES.find((elemento) => elemento.nombre === genero);
      if (!correspondencia) throw new ErrorHttp(422, 'Ese género no está disponible.');
      const version = createHash('sha256')
        .update(
          JSON.stringify({ correspondencia, pistas: PISTAS_POR_ARTISTA, seleccion: 'rank-v2' }),
        )
        .digest('hex');
      const [enCache] = forzar
        ? []
        : await consultar<{ genero: string }>(
            'SELECT genero FROM sincronizacion_catalogo WHERE genero=? AND version=? AND actualizado_en>DATE_SUB(NOW(),INTERVAL 12 HOUR)',
            [genero, version],
          );
      if (!enCache) {
        const pistas = await obtenerGrabaciones(genero, consultarProveedor);
        await transaccion(async (bd) => {
          await escribir(
            "UPDATE medios_cancion m JOIN canciones s ON s.id=m.cancion_id SET m.habilitada=FALSE WHERE m.fuente='deezer' AND s.genero=?",
            [genero],
            bd,
          );
          await almacenarGrabaciones(genero, pistas, bd);
          await escribir(
            'INSERT INTO sincronizacion_catalogo(genero,version,cantidad_artistas,cantidad_pistas) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE version=VALUES(version),cantidad_artistas=VALUES(cantidad_artistas),cantidad_pistas=VALUES(cantidad_pistas),actualizado_en=CURRENT_TIMESTAMP',
            [genero, version, ARTISTAS_POR_GENERO, pistas.length],
            bd,
          );
        });
        if (consultarProveedor === fetch)
          console.log(
            `${genero}: ${ARTISTAS_POR_GENERO} artistas · ${pistas.length} canciones oficiales.`,
          );
      }
      ultimoExito.set(genero, Date.now());
      ultimoFallo.delete(genero);
    } catch (error) {
      ultimoFallo.set(genero, Date.now());
      throw error;
    } finally {
      enCurso.delete(genero);
    }
  })();
  enCurso.set(genero, operacion);
  return operacion;
}

/** Prepara tres géneros simultáneos con un límite global de consultas al proveedor. */
export async function prepararGrabaciones(
  consultarProveedor: ConsultaMusica = fetch,
  forzar = false,
): Promise<void> {
  if (!forzar && entorno.NODE_ENV === 'test') return;
  /** Recorre los géneros sin multiplicar las consultas por cada navegador conectado. */
  async function sincronizarGeneros(): Promise<void> {
    const fallos: string[] = [];
    for (let i = 0; i < GENEROS_GRABACIONES.length; i += 3) {
      const grupo = GENEROS_GRABACIONES.slice(i, i + 3);
      const resultados = await Promise.allSettled(
        grupo.map((genero) => asegurarGeneroGrabaciones(genero.nombre, consultarProveedor, forzar)),
      );
      resultados.forEach((resultado, indice) => {
        if (resultado.status === 'rejected') fallos.push(grupo[indice].nombre);
      });
    }
    if (fallos.length) console.warn('Géneros pendientes de Deezer:', fallos.join(', '));
    if (forzar && fallos.length)
      throw new ErrorHttp(
        502,
        `No se completó el catálogo de: ${fallos.join(', ')}. Se conservó el catálogo anterior de esos géneros.`,
      );
  }
  if (forzar) {
    await sincronizarGeneros();
    return;
  }
  const [disponibles] = await consultar<{ cantidad: number }>(
    "SELECT COUNT(*) AS cantidad FROM medios_cancion m JOIN canciones s ON s.id=m.cancion_id WHERE m.fuente='deezer' AND m.habilitada=1 AND s.genero NOT IN (?,?,?)",
    [...GENEROS_RETIRADOS],
  );
  const operacion =
    actualizacionEnSegundoPlano ??
    (actualizacionEnSegundoPlano = sincronizarGeneros().finally(() => {
      actualizacionEnSegundoPlano = undefined;
    }));
  if (Number(disponibles.cantidad) >= 5) {
    // El repertorio publicado sigue disponible mientras se renueva el catálogo grande.
    void operacion.catch((error) =>
      console.warn(
        'Actualización musical pendiente:',
        error instanceof Error ? error.message : 'proveedor',
      ),
    );
  } else await operacion;
}

/** Ofrece únicamente categorías con suficientes grabaciones oficiales para comenzar una partida. */
export async function opcionesMusica(
  consultarProveedor: ConsultaMusica = fetch,
): Promise<OpcionesMusica> {
  await prepararGrabaciones(consultarProveedor);
  const generos = await consultar<{ nombre: string; cantidad: number; artistas: number }>(
    "SELECT s.genero AS nombre,COUNT(*) AS cantidad,COUNT(DISTINCT s.artista) AS artistas FROM canciones s JOIN medios_cancion m ON m.cancion_id=s.id WHERE m.habilitada=1 AND m.fuente='deezer' AND s.genero NOT IN (?,?,?) GROUP BY s.genero HAVING COUNT(*)>=5 ORDER BY s.genero",
    [...GENEROS_RETIRADOS],
  );
  const total = generos.reduce((suma, elemento) => suma + Number(elemento.cantidad), 0);
  if (!total)
    throw new ErrorHttp(
      503,
      'El catálogo de canciones oficiales aún no está disponible. Comprueba Internet y vuelve a cargar.',
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
