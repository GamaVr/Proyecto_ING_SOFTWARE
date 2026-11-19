/** Prepara el esquema MySQL y el catálogo inicial o los datos de prueba. */
import { readFile } from 'node:fs/promises';
import mysql, { type RowDataPacket } from 'mysql2/promise';
import { env } from '../server/configuracion.js';
import { prepareRecordings } from '../server/musica.js';
import { pool } from '../server/base-datos.js';

/** Crea el esquema y obtiene referencias de canciones reales; no sintetiza ni genera grabaciones. */
async function setup(): Promise<void> {
  const db = await mysql.createConnection({
    host: env.DB_HOST,
    port: env.DB_PORT,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    multipleStatements: true,
  });
  try {
    await db.query(
      `CREATE DATABASE IF NOT EXISTS \`${env.DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
    );
    await db.changeUser({ database: env.DB_NAME });
    await db.query(await readFile('database/esquema.sql', 'utf8'));
    await db.query(await readFile('database/migrations/002_amigos_y_salas.sql', 'utf8'));
    await db.query(await readFile('database/migrations/004_grabaciones_reales.sql', 'utf8'));
    await db.query(await readFile('database/migrations/005_grabaciones_oficiales.sql', 'utf8'));
    await db.query(await readFile('database/migrations/006_retirar_generos.sql', 'utf8'));
    await db.query(await readFile('database/migrations/007_sincronizacion_catalogo.sql', 'utf8'));
    await db.query(await readFile('database/migrations/008_recuperacion_contrasena.sql', 'utf8'));
    await db.query(await readFile('database/migrations/009_verificacion_correo.sql', 'utf8'));
    const [recoveryColumns] = await db.query<Array<{ COLUMN_NAME: string } & RowDataPacket>>(
      "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='users' AND COLUMN_NAME='recovery_code_hash'",
    );
    if (recoveryColumns.length === 0)
      await db.query(await readFile('database/migrations/010_codigo_recuperacion.sql', 'utf8'));
    if (env.NODE_ENV === 'test') {
      // Datos ficticios exclusivos de la base aislada: no se usan en la aplicación entregada.
      if (!env.DB_NAME.endsWith('_test'))
        throw new Error('Los datos de prueba solo se admiten en bases terminadas en _test.');
      for (let i = 0; i < 20; i++) {
        const externalId = String(9000000000000 + i);
        const id = `deezer-${externalId}`;
        await db.execute(
          'INSERT IGNORE INTO songs(id,title,artist,aliases,genre,release_year,audio_file) VALUES (?,?,?,?,?,?,?)',
          [id, `Grabación de prueba ${i}`, 'Artista QA', '[]', 'Rock', 2024, `${id}.wav`],
        );
        await db.execute(
          "INSERT INTO song_media(song_id,source,external_id,audio_url,license_url,source_url,duration,clip_start) VALUES (?,'deezer',?,?,?,?,30,0) ON DUPLICATE KEY UPDATE enabled=TRUE",
          [
            id,
            externalId,
            `https://api.deezer.com/track/${externalId}`,
            'https://developers.deezer.com/termsofuse',
            `https://www.deezer.com/track/${externalId}`,
          ],
        );
      }
      console.log('MySQL de pruebas preparado con datos exclusivos de prueba.');
    } else {
      await prepareRecordings(fetch, true);
      console.log('MySQL preparado con referencias de grabaciones oficiales de Deezer.');
    }
  } finally {
    await db.end();
    await pool.end();
  }
}
setup().catch((error) => {
  console.error('Preparación MySQL:', error.message);
  process.exitCode = 1;
});
