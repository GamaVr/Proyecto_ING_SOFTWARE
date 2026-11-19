/** Actualiza los artistas y canciones oficiales del catálogo. */
import { prepararGrabaciones } from '../servidor/servicios/musica/catalogo.js';
import { consultar, conexiones } from '../servidor/datos/base-datos.js';

/** Actualiza referencias oficiales en MySQL sin descargar ni distribuir archivos musicales. */
async function sincronizar(): Promise<void> {
  try {
    await prepararGrabaciones(fetch, true);
    console.table(
      await consultar(
        "SELECT s.genero,COUNT(*) AS canciones,COUNT(DISTINCT s.artista) AS artistas FROM canciones s JOIN medios_cancion m ON m.cancion_id=s.id WHERE m.fuente='deezer' AND m.habilitada=1 GROUP BY s.genero ORDER BY s.genero",
      ),
    );
    const incorrecta = await consultar<{ genero: string; artista: string; cantidad: number }>(
      "SELECT s.genero,s.artista,COUNT(*) AS cantidad FROM canciones s JOIN medios_cancion m ON m.cancion_id=s.id WHERE m.fuente='deezer' AND m.habilitada=1 GROUP BY s.genero,s.artista HAVING COUNT(*)<>5",
    );
    if (incorrecta.length)
      throw new Error('Se detectaron artistas sin exactamente cinco canciones activas.');
  } finally {
    await conexiones.end();
  }
}
sincronizar().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
