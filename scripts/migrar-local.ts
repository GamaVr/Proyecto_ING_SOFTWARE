/** Aplica el esquema (y, si hace falta, la conversión al español) al MySQL portátil existente. */
import { readFile } from 'node:fs/promises';
import mysql from 'mysql2/promise';
import { entorno } from '../servidor/configuracion.js';
import { aplicarEsquema } from './aplicar-esquema.js';

/** Aplica el esquema idempotente con el administrador local sin ampliar permisos del usuario de aplicación. */
async function migrar(): Promise<void> {
  const lineas = (await readFile('.runtime/mysql-admin.env', 'utf8')).split('\n');
  const contrasena = lineas.find((linea) => linea.startsWith('DB_PASSWORD='))?.slice(12);
  if (!contrasena) throw new Error('No se encontró la configuración de administrador local.');
  const bd = await mysql.createConnection({
    host: entorno.DB_HOST,
    port: entorno.DB_PORT,
    user: 'root',
    password: contrasena,
    database: entorno.DB_NAME,
    multipleStatements: true,
  });
  try {
    const convertida = await aplicarEsquema(bd);
    console.log(
      convertida
        ? 'Base convertida al esquema en español. Usuarios, partidas y preferencias conservados.'
        : 'El esquema ya estaba al día.',
    );
  } finally {
    await bd.end();
  }
}
migrar().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
