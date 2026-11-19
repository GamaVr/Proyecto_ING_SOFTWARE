/** Administra la conexión a MySQL y las transacciones. */
import mysql, {
  type PoolConnection,
  type ResultSetHeader,
  type RowDataPacket,
} from 'mysql2/promise';
import { env } from './configuracion.js';

export const pool = mysql.createPool({
  host: env.DB_HOST,
  port: env.DB_PORT,
  user: env.DB_USER,
  password: env.DB_PASSWORD,
  database: env.DB_NAME,
  connectionLimit: 10,
  charset: 'utf8mb4',
  timezone: 'Z',
  supportBigNumbers: true,
  bigNumberStrings: true,
  multipleStatements: false,
});
export type Database = typeof pool | PoolConnection;
type SqlValue = string | number | boolean | null | Date | Buffer;

/** Ejecuta una consulta parametrizada y devuelve sus filas con el tipo solicitado. */
export async function query<T>(
  sql: string,
  values: SqlValue[] = [],
  db: Database = pool,
): Promise<T[]> {
  const [rows] = await db.execute<RowDataPacket[]>(sql, values);
  return rows as T[];
}

/** Ejecuta una escritura parametrizada sin habilitar sentencias SQL múltiples. */
export async function write(
  sql: string,
  values: SqlValue[] = [],
  db: Database = pool,
): Promise<ResultSetHeader> {
  const [result] = await db.execute<ResultSetHeader>(sql, values);
  return result;
}

/** Confirma todas las escrituras de una operación o las revierte ante cualquier fallo. */
export async function transaction<T>(operation: (db: PoolConnection) => Promise<T>): Promise<T> {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const result = await operation(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
