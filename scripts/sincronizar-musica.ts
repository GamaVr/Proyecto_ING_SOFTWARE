/** Actualiza los artistas y canciones oficiales del catálogo. */
import { prepareRecordings } from '../server/musica.js';
import { query, pool } from '../server/base-datos.js';

/** Actualiza referencias oficiales en MySQL sin descargar ni distribuir archivos musicales. */
async function sync(): Promise<void> {
  try {
    await prepareRecordings(fetch, true);
    console.table(
      await query(
        "SELECT s.genre,COUNT(*) AS canciones,COUNT(DISTINCT s.artist) AS artistas FROM songs s JOIN song_media m ON m.song_id=s.id WHERE m.source='deezer' AND m.enabled=1 GROUP BY s.genre ORDER BY s.genre",
      ),
    );
    const incorrect = await query<{ genre: string; artist: string; count: number }>(
      "SELECT s.genre,s.artist,COUNT(*) AS count FROM songs s JOIN song_media m ON m.song_id=s.id WHERE m.source='deezer' AND m.enabled=1 GROUP BY s.genre,s.artist HAVING COUNT(*)<>5",
    );
    if (incorrect.length)
      throw new Error('Se detectaron artistas sin exactamente cinco canciones activas.');
  } finally {
    await pool.end();
  }
}
sync().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
