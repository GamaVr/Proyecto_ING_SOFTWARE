/** Ejecuta las pruebas contra una base MySQL aislada. */
import { readFile, readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import mysql from 'mysql2/promise';
import { entorno } from '../servidor/configuracion.js';

/** Prepara una base separada para pruebas y ejecuta el conjunto contra MySQL real. */
async function ejecutar(): Promise<void> {
  const baseDatos = process.env.TEST_DB_NAME || `${entorno.DB_NAME}_test`;
  if (!/^[a-zA-Z0-9_]+_test$/.test(baseDatos))
    throw new Error('TEST_DB_NAME debe ser un identificador que termine en _test.');
  if (entorno.DB_PORT === 3307 && ['127.0.0.1', 'localhost'].includes(entorno.DB_HOST)) {
    const administrador = await readFile('.runtime/mysql-admin.env', 'utf8');
    const contrasena = administrador
      .split('\n')
      .find((linea) => linea.startsWith('DB_PASSWORD='))
      ?.slice(12);
    if (!contrasena)
      throw new Error('No se encontró la cuenta de administrador del MySQL portátil.');
    const preparar = spawnSync(
      process.execPath,
      ['--import', 'tsx', 'scripts/preparar-base-datos.ts'],
      {
        stdio: 'inherit',
        env: {
          ...process.env,
          DB_NAME: baseDatos,
          DB_USER: 'root',
          DB_PASSWORD: contrasena,
          NODE_ENV: 'test',
        },
      },
    );
    if (preparar.status !== 0) throw new Error('No se pudo preparar la base de pruebas.');
    const bdAdministrador = await mysql.createConnection({
      host: entorno.DB_HOST,
      port: entorno.DB_PORT,
      user: 'root',
      password: contrasena,
    });
    try {
      await bdAdministrador.query(
        `GRANT SELECT,INSERT,UPDATE,DELETE ON \`${baseDatos}\`.* TO ?@'127.0.0.1'`,
        [entorno.DB_USER],
      );
    } finally {
      await bdAdministrador.end();
    }
  }
  const resultado = spawnSync(
    process.execPath,
    [
      '--import',
      'tsx',
      '--test',
      '--test-concurrency=1',
      ...(await readdir('pruebas/integracion'))
        .filter((archivo) => archivo.endsWith('.test.ts'))
        .map((archivo) => `pruebas/integracion/${archivo}`),
    ],
    { stdio: 'inherit', env: { ...process.env, DB_NAME: baseDatos, NODE_ENV: 'test' } },
  );
  process.exitCode = resultado.status || 0;
}
ejecutar().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
