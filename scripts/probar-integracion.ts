/** Ejecuta las pruebas contra una base MySQL aislada. */
import { readFile, readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import mysql from 'mysql2/promise';
import { env } from '../server/configuracion.js';

/** Prepara una base separada para pruebas y ejecuta el conjunto contra MySQL real. */
async function run(): Promise<void> {
  const database = process.env.TEST_DB_NAME || `${env.DB_NAME}_test`;
  if (!/^[a-zA-Z0-9_]+_test$/.test(database))
    throw new Error('TEST_DB_NAME debe ser un identificador que termine en _test.');
  if (env.DB_PORT === 3307 && ['127.0.0.1', 'localhost'].includes(env.DB_HOST)) {
    const admin = await readFile('.runtime/mysql-admin.env', 'utf8');
    const password = admin
      .split('\n')
      .find((line) => line.startsWith('DB_PASSWORD='))
      ?.slice(12);
    if (!password) throw new Error('No se encontró la cuenta de administrador del MySQL portátil.');
    const setup = spawnSync(
      process.execPath,
      ['--import', 'tsx', 'scripts/preparar-base-datos.ts'],
      {
        stdio: 'inherit',
        env: {
          ...process.env,
          DB_NAME: database,
          DB_USER: 'root',
          DB_PASSWORD: password,
          NODE_ENV: 'test',
        },
      },
    );
    if (setup.status !== 0) throw new Error('No se pudo preparar la base de pruebas.');
    const adminDb = await mysql.createConnection({
      host: env.DB_HOST,
      port: env.DB_PORT,
      user: 'root',
      password,
    });
    try {
      await adminDb.query(
        `GRANT SELECT,INSERT,UPDATE,DELETE ON \`${database}\`.* TO ?@'127.0.0.1'`,
        [env.DB_USER],
      );
    } finally {
      await adminDb.end();
    }
  }
  const result = spawnSync(
    process.execPath,
    [
      '--import',
      'tsx',
      '--test',
      '--test-concurrency=1',
      ...(await readdir('tests/integration'))
        .filter((file) => file.endsWith('.test.ts'))
        .map((file) => `tests/integration/${file}`),
    ],
    { stdio: 'inherit', env: { ...process.env, DB_NAME: database, NODE_ENV: 'test' } },
  );
  process.exitCode = result.status || 0;
}
run().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
