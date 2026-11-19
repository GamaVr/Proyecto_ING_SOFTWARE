/** Prepara una instancia local nueva y sus credenciales protegidas. */
import { randomBytes } from 'node:crypto';
import { writeFile, access } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import mysql from 'mysql2/promise';

/** Prepara la instancia portátil nueva, crea un usuario limitado y guarda secretos solo en archivos ignorados. */
async function provision(): Promise<void> {
  try {
    await access('.env');
    throw new Error('Ya existe .env; usa db:setup para conservar su configuración.');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  const db = await mysql.createConnection({ host: '127.0.0.1', port: 3307, user: 'root' });
  const appPassword = randomBytes(24).toString('hex'),
    rootPassword = randomBytes(32).toString('hex');
  try {
    await db.query(
      'CREATE DATABASE IF NOT EXISTS guess_the_beat CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci',
    );
    await db.query("CREATE USER IF NOT EXISTS 'guess_app'@'127.0.0.1' IDENTIFIED BY ?", [
      appPassword,
    ]);
    await db.query("ALTER USER 'guess_app'@'127.0.0.1' IDENTIFIED BY ?", [appPassword]);
    await db.query(
      "GRANT SELECT,INSERT,UPDATE,DELETE ON guess_the_beat.* TO 'guess_app'@'127.0.0.1'",
    );
    const setup = spawnSync(
      process.execPath,
      ['--import', 'tsx', 'scripts/preparar-base-datos.ts'],
      {
        stdio: 'inherit',
        env: {
          ...process.env,
          DB_HOST: '127.0.0.1',
          DB_PORT: '3307',
          DB_USER: 'root',
          DB_PASSWORD: '',
          DB_NAME: 'guess_the_beat',
        },
      },
    );
    if (setup.status !== 0) throw new Error('Falló la creación del esquema.');
    await db.query("ALTER USER 'root'@'localhost' IDENTIFIED BY ?", [rootPassword]);
    await writeFile(
      '.env',
      `PORT=3001\nHOST=127.0.0.1\nAPP_ORIGIN=http://localhost:5173\nDB_HOST=127.0.0.1\nDB_PORT=3307\nDB_USER=guess_app\nDB_PASSWORD=${appPassword}\nDB_NAME=guess_the_beat\n`,
    );
    await writeFile(
      '.runtime/mysql-admin.env',
      `DB_USER=root\nDB_PASSWORD=${rootPassword}\nDB_PORT=3307\n`,
    );
    console.log(
      'MySQL configurado. Usuario de aplicación limitado y credenciales locales protegidas por .gitignore.',
    );
  } finally {
    await db.end();
  }
}
provision().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
