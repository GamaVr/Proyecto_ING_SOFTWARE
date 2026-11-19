/** Detiene únicamente el MySQL portátil del proyecto. */
import { readFile } from 'node:fs/promises';
import mysql from 'mysql2/promise';

/** Apaga de forma ordenada solo la instancia portátil del proyecto en el puerto 3307. */
async function detener(): Promise<void> {
  const administrador = await readFile('.runtime/mysql-admin.env', 'utf8');
  const contrasena = administrador
    .split('\n')
    .find((linea) => linea.startsWith('DB_PASSWORD='))
    ?.slice(12);
  if (!contrasena) throw new Error('No se encontró la configuración de administrador local.');
  const bd = await mysql.createConnection({
    host: '127.0.0.1',
    port: 3307,
    user: 'root',
    password: contrasena,
  });
  try {
    await bd.query('SHUTDOWN');
    console.log('MySQL portátil detenido correctamente.');
  } finally {
    await bd.end().catch(() => {});
  }
}
detener().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
