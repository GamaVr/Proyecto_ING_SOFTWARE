/** Inicia el cliente Vite y el servidor durante el desarrollo. */
import { spawn } from 'node:child_process';
import path from 'node:path';

/** Arranca cliente y API con el mismo ejecutable Node y termina ambos al cerrar la sesión. */
function start(): void {
  const children = [
    spawn(process.execPath, ['--watch', '--import', 'tsx', 'server/servidor.ts'], {
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
  function stop(): void {
    for (const child of children) child.kill();
  }
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  for (const child of children)
    child.on('exit', (code) => {
      if (code) {
        stop();
        process.exitCode = code;
      }
    });
}
start();
