/** Prepara el esquema MySQL y el catálogo inicial o los datos de prueba. */
import mysql from 'mysql2/promise';
import { aplicarEsquema } from './aplicar-esquema.js';
import { entorno } from '../servidor/configuracion.js';
import { prepararGrabaciones } from '../servidor/servicios/musica/catalogo.js';
import { conexiones } from '../servidor/datos/base-datos.js';

/** Crea el esquema y obtiene referencias de canciones reales; no sintetiza ni genera grabaciones. */
async function preparar(): Promise<void> {
  const bd = await mysql.createConnection({
    host: entorno.DB_HOST,
    port: entorno.DB_PORT,
    user: entorno.DB_USER,
    password: entorno.DB_PASSWORD,
    multipleStatements: true,
  });
  try {
    await bd.query(
      `CREATE DATABASE IF NOT EXISTS \`${entorno.DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
    );
    await bd.changeUser({ database: entorno.DB_NAME });
    if (await aplicarEsquema(bd))
      console.log('Base del esquema anterior convertida a nombres en español.');
    if (entorno.NODE_ENV === 'test') {
      // Datos ficticios exclusivos de la base aislada: no se usan en la aplicación entregada.
      if (!entorno.DB_NAME.endsWith('_test'))
        throw new Error('Los datos de prueba solo se admiten en bases terminadas en _test.');
      for (let i = 0; i < 20; i++) {
        const idExterno = String(9000000000000 + i);
        const id = `deezer-${idExterno}`;
        await bd.execute(
          'INSERT IGNORE INTO canciones(id,titulo,artista,alias,genero,anio_lanzamiento) VALUES (?,?,?,?,?,?)',
          [id, `Grabación de prueba ${i}`, 'Artista QA', '[]', 'Rock', 2024],
        );
        await bd.execute(
          "INSERT INTO medios_cancion(cancion_id,fuente,id_externo,url_audio,url_licencia,url_fuente,duracion,inicio_fragmento) VALUES (?,'deezer',?,?,?,?,30,0) ON DUPLICATE KEY UPDATE habilitada=TRUE",
          [
            id,
            idExterno,
            `https://api.deezer.com/track/${idExterno}`,
            'https://developers.deezer.com/termsofuse',
            `https://www.deezer.com/track/${idExterno}`,
          ],
        );
      }
      console.log('MySQL de pruebas preparado con datos exclusivos de prueba.');
    } else {
      await prepararGrabaciones(fetch, true);
      console.log('MySQL preparado con referencias de grabaciones oficiales de Deezer.');
    }
  } finally {
    await bd.end();
    await conexiones.end();
  }
}
preparar().catch((error) => {
  console.error('Preparación MySQL:', error.message);
  process.exitCode = 1;
});
