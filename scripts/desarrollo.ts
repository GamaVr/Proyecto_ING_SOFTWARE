/** Inicia el cliente Vite y el servidor durante el desarrollo. */
import { spawn } from 'node:child_process';
import path from 'node:path';

/** Arranca cliente y API con el mismo ejecutable Node y termina ambos al cerrar la sesión. */
function inicio(): void {
  const children = [
    spawn(process.execPath, ['--watch', '--import', 'tsx', 'servidor/principal.ts'], {
      stdio: 'inherit',
      env: process.env,
    }),
    spawn(
      process.execPath,
      [path.resolve('node_modules/vite/bin/vite.js'), '--host', '127.0.0.1'],
      { stdio: 'inherit', env: process.env },
    ),
  ];
  /** Detiene únicamente los procesos creados por este lanzador. */
  function detener(): void {
    for (const hijo of children) hijo.kill();
  }
  process.on('SIGINT', detener);
  process.on('SIGTERM', detener);
  for (const hijo of children)
    hijo.on('exit', (codigo) => {
      if (codigo) {
        detener();
        process.exitCode = codigo;
      }
    });
}
inicio();
