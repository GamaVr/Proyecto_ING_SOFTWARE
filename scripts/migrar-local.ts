/** Aplica el esquema y las migraciones al MySQL portátil existente. */
import { readFile } from 'node:fs/promises';
import mysql from 'mysql2/promise';
import { env } from '../servidor/configuracion.js';

/** Aplica el esquema idempotente con el administrador local sin ampliar permisos del usuario de aplicación. */
async function migrate(): Promise<void> {
  const lines = (await readFile('.runtime/mysql-admin.env', 'utf8')).split('\n');
  const password = lines.find((line) => line.startsWith('DB_PASSWORD='))?.slice(12);
  if (!password) throw new Error('No se encontró la configuración de administrador local.');
  const db = await mysql.createConnection({
    host: env.DB_HOST,
    port: env.DB_PORT,
    user: 'root',
    password,
    database: env.DB_NAME,
    multipleStatements: true,
  });
  try {
    await db.query(await readFile('base-datos/esquema.sql', 'utf8'));
    await db.query(await readFile('base-datos/migraciones/002_amigos_y_salas.sql', 'utf8'));
    await db.query(await readFile('base-datos/migraciones/004_grabaciones_reales.sql', 'utf8'));
    await db.query(await readFile('base-datos/migraciones/005_grabaciones_oficiales.sql', 'utf8'));
    await db.query(await readFile('base-datos/migraciones/006_retirar_generos.sql', 'utf8'));
    await db.query(
      await readFile('base-datos/migraciones/007_sincronizacion_catalogo.sql', 'utf8'),
    );
    await db.query(
      await readFile('base-datos/migraciones/008_recuperacion_contrasena.sql', 'utf8'),
    );
    await db.query(await readFile('base-datos/migraciones/009_verificacion_correo.sql', 'utf8'));
    console.log(
      'Esquema actualizado para grabaciones reales. Usuarios y partidas conservados; melodías sintetizadas excluidas.',
    );
  } finally {
    await db.end();
  }
}
migrate().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
