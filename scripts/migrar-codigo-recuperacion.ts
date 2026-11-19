/** Aplica únicamente la columna para códigos de recuperación, sin sincronizar el catálogo musical. */
import { readFile } from 'node:fs/promises';
import mysql, { type RowDataPacket } from 'mysql2/promise';
import { env } from '../server/configuracion.js';

async function migrate(): Promise<void> {
  const adminConfig = (await readFile('.runtime/mysql-admin.env', 'utf8')).split('\n');
  const password = adminConfig.find((line) => line.startsWith('DB_PASSWORD='))?.slice(12);
  if (!password) throw new Error('No se encontró la configuración de administrador local.');
  const db = await mysql.createConnection({
    host: env.DB_HOST,
    port: env.DB_PORT,
    user: 'root',
    password,
    database: env.DB_NAME,
  });
  try {
    const [columns] = await db.query<Array<{ COLUMN_NAME: string } & RowDataPacket>>(
      "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='users' AND COLUMN_NAME='recovery_code_hash'",
    );
    if (columns.length === 0) {
      await db.query(await readFile('database/migrations/010_codigo_recuperacion.sql', 'utf8'));
      console.log('Columna de código de recuperación agregada a MySQL.');
    } else {
      console.log('La columna de código de recuperación ya existe.');
    }
  } finally {
    await db.end();
  }
}

migrate().catch((error) => {
  console.error('Migración de recuperación:', error instanceof Error ? error.message : 'Error desconocido.');
  process.exitCode = 1;
});
