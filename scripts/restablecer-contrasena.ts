/** Permite recuperar una cuenta desde la consola administrativa. */
import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
import bcrypt from 'bcryptjs';
import { consultar, escribir, transaccion, conexiones } from '../servidor/datos/base-datos.js';
import { esquemaContrasena } from '../servidor/validacion.js';

/** Recupera una cuenta desde la consola del administrador ocultando la contraseña y revocando sesiones. */
async function restablecerContrasena(): Promise<void> {
  let silenciado = false;
  const salida = new Writable({
    write(fragmento, _encoding, responder) {
      if (!silenciado) process.stdout.write(fragmento);
      responder();
    },
  });
  const indicacion = createInterface({
    input: process.stdin,
    output: salida,
    terminal: !!process.stdin.isTTY,
  });
  try {
    const correo = (await indicacion.question('Correo de la cuenta: ')).trim().toLowerCase();
    const [usuario] = await consultar<{ id: string }>('SELECT id FROM usuarios WHERE correo=?', [
      correo,
    ]);
    if (!usuario) throw new Error('No existe esa cuenta.');
    process.stdout.write('Nueva contraseña (entrada oculta): ');
    silenciado = true;
    const contrasena = await indicacion.question('');
    silenciado = false;
    process.stdout.write('\n');
    esquemaContrasena.parse(contrasena);
    const hash = await bcrypt.hash(contrasena, 12);
    await transaccion(async (bd) => {
      await escribir('UPDATE usuarios SET hash_contrasena=? WHERE id=?', [hash, usuario.id], bd);
      await escribir('DELETE FROM sesiones WHERE usuario_id=?', [usuario.id], bd);
    });
    console.log('Contraseña actualizada; todas las sesiones anteriores fueron cerradas.');
  } finally {
    silenciado = false;
    indicacion.close();
    await conexiones.end();
  }
}
restablecerContrasena().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
