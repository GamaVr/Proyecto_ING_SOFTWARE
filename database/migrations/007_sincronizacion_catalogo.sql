-- Publicaciones completas por género; la huella cambia al modificar artistas o selección de éxitos.
CREATE TABLE IF NOT EXISTS music_catalog_sync (
  genre VARCHAR(40) PRIMARY KEY,
  version CHAR(64) NOT NULL,
  artist_count SMALLINT UNSIGNED NOT NULL,
  track_count SMALLINT UNSIGNED NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
