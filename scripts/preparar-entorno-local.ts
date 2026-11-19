/** Prepara una instancia local nueva y sus credenciales protegidas. */
import { randomBytes } from 'node:crypto';
import { writeFile, access } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import mysql from 'mysql2/promise';

/** Prepara la instancia portátil nueva, crea un usuario limitado y guarda secretos solo en archivos ignorados. */
async function aprovisionar(): Promise<void> {
  try {
    await access('.env');
    throw new Error('Ya existe .env; usa db:setup para conservar su configuración.');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  const bd = await mysql.createConnection({ host: '127.0.0.1', port: 3307, user: 'root' });
  const contrasenaAplicacion = randomBytes(24).toString('hex'),
    contrasenaRaiz = randomBytes(32).toString('hex');
  try {
    await bd.query(
      'CREATE DATABASE IF NOT EXISTS guess_the_beat CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci',
    );
    await bd.query("CREATE USER IF NOT EXISTS 'guess_app'@'127.0.0.1' IDENTIFIED BY ?", [
      contrasenaAplicacion,
    ]);
    await bd.query("ALTER USER 'guess_app'@'127.0.0.1' IDENTIFIED BY ?", [contrasenaAplicacion]);
    await bd.query(
      "GRANT SELECT,INSERT,UPDATE,DELETE ON guess_the_beat.* TO 'guess_app'@'127.0.0.1'",
    );
    const preparar = spawnSync(
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
    if (preparar.status !== 0) throw new Error('Falló la creación del esquema.');
    await bd.query("ALTER USER 'root'@'localhost' IDENTIFIED BY ?", [contrasenaRaiz]);
    await writeFile(
      '.env',
      `PORT=3001\nHOST=127.0.0.1\nAPP_ORIGIN=http://localhost:5173\nDB_HOST=127.0.0.1\nDB_PORT=3307\nDB_USER=guess_app\nDB_PASSWORD=${contrasenaAplicacion}\nDB_NAME=guess_the_beat\n`,
    );
    await writeFile(
      '.runtime/mysql-admin.env',
      `DB_USER=root\nDB_PASSWORD=${contrasenaRaiz}\nDB_PORT=3307\n`,
    );
    console.log(
      'MySQL configurado. Usuario de aplicación limitado y credenciales locales protegidas por .gitignore.',
    );
  } finally {
    await bd.end();
  }
}
aprovisionar().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
