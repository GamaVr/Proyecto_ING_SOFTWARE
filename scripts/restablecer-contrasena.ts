/** Permite recuperar una cuenta desde la consola administrativa. */
import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
import bcrypt from 'bcryptjs';
import { query, write, transaction, pool } from '../server/base-datos.js';
import { passwordSchema } from '../server/validacion.js';

/** Recupera una cuenta desde la consola del administrador ocultando la contraseña y revocando sesiones. */
async function resetPassword(): Promise<void> {
  let muted = false;
  const output = new Writable({
    write(chunk, _encoding, callback) {
      if (!muted) process.stdout.write(chunk);
      callback();
    },
  });
  const prompt = createInterface({ input: process.stdin, output, terminal: !!process.stdin.isTTY });
  try {
    const email = (await prompt.question('Correo de la cuenta: ')).trim().toLowerCase();
    const [user] = await query<{ id: string }>('SELECT id FROM users WHERE email=?', [email]);
    if (!user) throw new Error('No existe esa cuenta.');
    process.stdout.write('Nueva contraseña (entrada oculta): ');
    muted = true;
    const password = await prompt.question('');
    muted = false;
    process.stdout.write('\n');
    passwordSchema.parse(password);
    const hash = await bcrypt.hash(password, 12);
    await transaction(async (db) => {
      await write('UPDATE users SET password_hash=? WHERE id=?', [hash, user.id], db);
      await write('DELETE FROM sessions WHERE user_id=?', [user.id], db);
    });
    console.log('Contraseña actualizada; todas las sesiones anteriores fueron cerradas.');
  } finally {
    muted = false;
    prompt.close();
    await pool.end();
  }
}
resetPassword().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
