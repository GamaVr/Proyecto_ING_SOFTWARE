/** Detiene únicamente el MySQL portátil del proyecto. */
import { readFile } from 'node:fs/promises';
import mysql from 'mysql2/promise';

/** Apaga de forma ordenada solo la instancia portátil del proyecto en el puerto 3307. */
async function stop(): Promise<void> {
  const admin = await readFile('.runtime/mysql-admin.env', 'utf8');
  const password = admin
    .split('\n')
    .find((line) => line.startsWith('DB_PASSWORD='))
    ?.slice(12);
  if (!password) throw new Error('No se encontró la configuración de administrador local.');
  const db = await mysql.createConnection({
    host: '127.0.0.1',
    port: 3307,
    user: 'root',
    password,
  });
  try {
    await db.query('SHUTDOWN');
    console.log('MySQL portátil detenido correctamente.');
  } finally {
    await db.end().catch(() => {});
  }
}
stop().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
