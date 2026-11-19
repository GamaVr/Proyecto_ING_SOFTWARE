/** Importa al catálogo las listas de base-datos/listas buscando cada canción en Deezer. */
import { importarListas } from '../servidor/servicios/musica/listas.js';
import { consultar, conexiones } from '../servidor/datos/base-datos.js';

/** Reemplaza el catálogo por el contenido actual de las listas y muestra el resultado. */
async function importar(): Promise<void> {
  try {
    const resumen = await importarListas();
    console.table(
      await consultar(
        "SELECT s.genero,COUNT(*) AS canciones,COUNT(DISTINCT s.artista) AS artistas FROM canciones s JOIN medios_cancion m ON m.cancion_id=s.id WHERE m.fuente='deezer' AND m.habilitada=1 GROUP BY s.genero ORDER BY s.genero",
      ),
    );
    if (resumen.repetidas) console.log(`Canciones repetidas en las listas: ${resumen.repetidas}.`);
    if (resumen.noEncontradas.length)
      console.warn(
        `Sin equivalente con muestra en Deezer (${resumen.noEncontradas.length}):\n- ${resumen.noEncontradas.join('\n- ')}`,
      );
  } finally {
    await conexiones.end();
  }
}
importar().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
