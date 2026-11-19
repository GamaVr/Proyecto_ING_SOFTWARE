/** Administra la conexión a MySQL y las transacciones. */
import mysql, {
  type PoolConnection,
  type ResultSetHeader,
  type RowDataPacket,
} from 'mysql2/promise';
import { entorno } from '../configuracion.js';

export const conexiones = mysql.createPool({
  host: entorno.DB_HOST,
  port: entorno.DB_PORT,
  user: entorno.DB_USER,
  password: entorno.DB_PASSWORD,
  database: entorno.DB_NAME,
  connectionLimit: 10,
  charset: 'utf8mb4',
  timezone: 'Z',
  supportBigNumbers: true,
  bigNumberStrings: true,
  multipleStatements: false,
});
export type BaseDatos = typeof conexiones | PoolConnection;
type ValorSql = string | number | boolean | null | Date | Buffer;

/** Ejecuta una consulta parametrizada y devuelve sus filas con el tipo solicitado. */
export async function consultar<T>(
  sql: string,
  valores: ValorSql[] = [],
  bd: BaseDatos = conexiones,
): Promise<T[]> {
  const [filas] = await bd.execute<RowDataPacket[]>(sql, valores);
  return filas as T[];
}

/** Ejecuta una escritura parametrizada sin habilitar sentencias SQL múltiples. */
export async function escribir(
  sql: string,
  valores: ValorSql[] = [],
  bd: BaseDatos = conexiones,
): Promise<ResultSetHeader> {
  const [resultado] = await bd.execute<ResultSetHeader>(sql, valores);
  return resultado;
}

/** Confirma todas las escrituras de una operación o las revierte ante cualquier fallo. */
export async function transaccion<T>(operacion: (bd: PoolConnection) => Promise<T>): Promise<T> {
  const conexion = await conexiones.getConnection();
  try {
    await conexion.beginTransaction();
    const resultado = await operacion(conexion);
    await conexion.commit();
    return resultado;
  } catch (error) {
    await conexion.rollback();
    throw error;
  } finally {
    conexion.release();
  }
}
