-- Amplía el origen sin borrar las canciones utilizadas por partidas anteriores.
ALTER TABLE song_media MODIFY source ENUM('builtin','local','jamendo','audius','deezer') NOT NULL;
UPDATE song_media SET enabled=FALSE WHERE source='builtin';
