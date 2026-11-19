-- Retira estas canciones del catálogo jugable conservando respuestas e historial existentes.
UPDATE song_media m JOIN songs s ON s.id=m.song_id
SET m.enabled=FALSE WHERE s.genre IN ('Blues','Jazz','Country');

-- Las salas pendientes con una categoría retirada vuelven al repertorio general.
UPDATE rooms SET config=JSON_SET(config,'$.genre','Todas')
WHERE game_id IS NULL AND JSON_UNQUOTE(JSON_EXTRACT(config,'$.genre')) IN ('Blues','Jazz','Country');
