-- Conserva el historial y excluye de nuevas partidas todos los proveedores anteriores.
ALTER TABLE song_media MODIFY source ENUM('builtin','local','jamendo','audius','deezer') NOT NULL;
SET @official_media_upgrade = IF(
  EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='song_media' AND column_name='updated_at'),
  'SELECT 1',
  'ALTER TABLE song_media ADD COLUMN updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP'
);
PREPARE official_media_statement FROM @official_media_upgrade;
EXECUTE official_media_statement;
DEALLOCATE PREPARE official_media_statement;
UPDATE song_media SET enabled=FALSE WHERE source<>'deezer';
