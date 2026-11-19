/** Aplica el esquema de MySQL: crea una base nueva o convierte una base del esquema anterior en inglés. */
import { readFile } from 'node:fs/promises';
import type { Connection, RowDataPacket } from 'mysql2/promise';

/** Migraciones históricas que dejan una base antigua al día antes de traducirla. */
const MIGRACIONES_HISTORICAS = [
  '002_amigos_y_salas.sql',
  '004_grabaciones_reales.sql',
  '005_grabaciones_oficiales.sql',
  '006_retirar_generos.sql',
  '007_sincronizacion_catalogo.sql',
];

const CLAVES_CONFIGURACION: Record<string, string> = {
  genre: 'genero',
  rounds: 'rondas',
  seconds: 'segundos',
  answerMode: 'modoRespuesta',
};
const VALORES_MODO_RESPUESTA: Record<string, string> = { both: 'ambos', title: 'titulo' };
const CLAVES_PREFERENCIAS: Record<string, string> = {
  volume: 'volumen',
  music: 'musica',
  effects: 'efectos',
  countdown: 'cuentaRegresiva',
  autoplay: 'reproduccionAutomatica',
  contrast: 'altoContraste',
  largeInterface: 'interfazGrande',
};

/** Lee un archivo SQL del proyecto. */
function sql(ruta: string): Promise<string> {
  return readFile(`base-datos/${ruta}`, 'utf8');
}

/** Indica si existe una tabla o una columna en la base seleccionada. */
async function existe(bd: Connection, tabla: string, columna?: string): Promise<boolean> {
  const [filas] = await bd.query<RowDataPacket[]>(
    columna
      ? 'SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND COLUMN_NAME=?'
      : 'SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=?',
    columna ? [tabla, columna] : [tabla],
  );
  return filas.length > 0;
}

/** Quita las restricciones CHECK (de nombre automático) para poder renombrar sus columnas. */
async function quitarRestriccionesCheck(bd: Connection, tablas: string[]): Promise<void> {
  const [filas] = await bd.query<RowDataPacket[]>(
    "SELECT TABLE_NAME AS tabla, CONSTRAINT_NAME AS nombre FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA=DATABASE() AND CONSTRAINT_TYPE='CHECK' AND TABLE_NAME IN (?)",
    [tablas],
  );
  for (const fila of filas)
    await bd.query(`ALTER TABLE \`${fila.tabla}\` DROP CHECK \`${fila.nombre}\``);
}

/** Devuelve un objeto con las claves traducidas; las que no están en el mapa se conservan. */
function traducirClaves(
  objeto: Record<string, unknown>,
  claves: Record<string, string>,
): Record<string, unknown> {
  return Object.fromEntries(Object.entries(objeto).map(([k, v]) => [claves[k] ?? k, v]));
}

/** Convierte las claves de los JSON guardados en partidas, salas y preferencias. */
async function convertirJson(bd: Connection): Promise<void> {
  for (const [tabla, clave] of [
    ['partidas', 'id'],
    ['salas', 'codigo'],
  ] as const) {
    const [filas] = await bd.query<RowDataPacket[]>(
      `SELECT ${clave} AS clave, configuracion FROM ${tabla} WHERE JSON_CONTAINS_PATH(configuracion,'one','$.genre','$.rounds')`,
    );
    for (const fila of filas) {
      const original =
        typeof fila.configuracion === 'string'
          ? JSON.parse(fila.configuracion)
          : fila.configuracion;
      const configuracion = traducirClaves(original, CLAVES_CONFIGURACION);
      const modo = configuracion.modoRespuesta;
      if (typeof modo === 'string')
        configuracion.modoRespuesta = VALORES_MODO_RESPUESTA[modo] ?? modo;
      await bd.query(`UPDATE ${tabla} SET configuracion=? WHERE ${clave}=?`, [
        JSON.stringify(configuracion),
        fila.clave,
      ]);
    }
  }
  const [preferencias] = await bd.query<RowDataPacket[]>(
    'SELECT usuario_id, preferencias FROM preferencias_usuario',
  );
  for (const fila of preferencias) {
    const original =
      typeof fila.preferencias === 'string' ? JSON.parse(fila.preferencias) : fila.preferencias;
    await bd.query('UPDATE preferencias_usuario SET preferencias=? WHERE usuario_id=?', [
      JSON.stringify(traducirClaves(original, CLAVES_PREFERENCIAS)),
      fila.usuario_id,
    ]);
  }
}

/**
 * Deja la base con el esquema actual. Requiere una conexión con `multipleStatements: true`
 * y la base ya seleccionada. Devuelve `true` si convirtió una base del esquema anterior.
 */
export async function aplicarEsquema(bd: Connection): Promise<boolean> {
  let convertida = false;
  if (await existe(bd, 'users')) {
    for (const archivo of MIGRACIONES_HISTORICAS)
      await bd.query(await sql(`migraciones/${archivo}`));
    if (!(await existe(bd, 'users', 'recovery_code_hash')))
      await bd.query(await sql('migraciones/010_codigo_recuperacion.sql'));
    await quitarRestriccionesCheck(bd, ['friendships', 'room_invitations']);
    await bd.query(await sql('migraciones/011_nombres_en_espanol.sql'));
    await convertirJson(bd);
    convertida = true;
  }
  await bd.query(await sql('esquema.sql'));
  await retirarRestos(bd);
  return convertida;
}

/** Columnas de funciones retiradas que ya no lee ni escribe ningún módulo. */
const COLUMNAS_RETIRADAS: [tabla: string, columna: string][] = [
  ['jugadores_partida', 'hints_used'], // sistema de pistas retirado
  ['jugadores_partida', 'current_hint'], // sistema de pistas retirado
  ['medios_cancion', 'hash_contenido'], // detección de archivos subidos (retirada)
  ['canciones', 'archivo_audio'], // audio local; ahora se transmite desde Deezer
];

/** Elimina tablas y columnas sin uso que pueden quedar en bases creadas con versiones anteriores. */
async function retirarRestos(bd: Connection): Promise<void> {
  // Configuración del antiguo administrador de música (Jamendo), sin uso en la aplicación.
  await bd.query('DROP TABLE IF EXISTS music_settings');
  // Control de la antigua descarga automática por artistas; el catálogo ahora viene de listas.
  await bd.query('DROP TABLE IF EXISTS sincronizacion_catalogo');
  for (const [tabla, columna] of COLUMNAS_RETIRADAS)
    if (await existe(bd, tabla, columna))
      await bd.query(`ALTER TABLE \`${tabla}\` DROP COLUMN \`${columna}\``);
}
