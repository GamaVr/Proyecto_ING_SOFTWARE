-- Convierte una base creada con el esquema anterior (tablas y columnas en inglés) al esquema en español.
-- Se ejecuta una sola vez, desde scripts/aplicar-esquema.ts, solo si todavía existe la tabla `users`.
-- Las claves de los JSON (configuración de partidas y salas, preferencias) se convierten después
-- en el mismo script, porque requieren conservar los valores ausentes.
-- MySQL no revierte DDL en transacciones: haz una copia de seguridad antes de ejecutarla.

-- Tablas del flujo de correo retirado (verificación de cuenta y enlaces de recuperación).
DROP TABLE IF EXISTS password_reset_tokens;
DROP TABLE IF EXISTS pending_registrations;

RENAME TABLE
  users TO usuarios,
  sessions TO sesiones,
  user_settings TO preferencias_usuario,
  songs TO canciones,
  games TO partidas,
  game_players TO jugadores_partida,
  answers TO respuestas,
  rooms TO salas,
  room_players TO jugadores_sala,
  room_messages TO mensajes_sala,
  friendships TO amistades,
  room_invitations TO invitaciones_sala,
  song_media TO medios_cancion,
  music_catalog_sync TO sincronizacion_catalogo;

ALTER TABLE usuarios
  RENAME COLUMN name TO nombre,
  RENAME COLUMN email TO correo,
  RENAME COLUMN password_hash TO hash_contrasena,
  RENAME COLUMN recovery_code_hash TO hash_codigo_recuperacion,
  RENAME COLUMN created_at TO creado_en;

ALTER TABLE sesiones
  RENAME COLUMN token_hash TO hash_token,
  RENAME COLUMN user_id TO usuario_id,
  RENAME COLUMN expires_at TO expira_en,
  RENAME INDEX sessions_expiry TO sesiones_expiracion;

ALTER TABLE preferencias_usuario
  RENAME COLUMN user_id TO usuario_id,
  RENAME COLUMN settings TO preferencias;

ALTER TABLE canciones
  RENAME COLUMN title TO titulo,
  RENAME COLUMN artist TO artista,
  RENAME COLUMN aliases TO alias,
  RENAME COLUMN genre TO genero,
  RENAME COLUMN release_year TO anio_lanzamiento,
  RENAME COLUMN audio_file TO archivo_audio;

ALTER TABLE partidas
  RENAME COLUMN mode TO modo,
  RENAME COLUMN status TO estado,
  RENAME COLUMN config TO configuracion,
  RENAME COLUMN song_ids TO canciones_ids,
  RENAME COLUMN current_round TO ronda_actual,
  RENAME COLUMN round_started_at TO ronda_iniciada_en,
  RENAME COLUMN created_at TO creado_en;

ALTER TABLE jugadores_partida
  RENAME COLUMN game_id TO partida_id,
  RENAME COLUMN user_id TO usuario_id,
  RENAME COLUMN team TO equipo;

ALTER TABLE respuestas
  RENAME COLUMN game_id TO partida_id,
  RENAME COLUMN user_id TO usuario_id,
  RENAME COLUMN round_index TO indice_ronda,
  RENAME COLUMN answer TO respuesta,
  RENAME COLUMN correct TO correcta,
  RENAME COLUMN points TO puntos,
  RENAME COLUMN elapsed_ms TO transcurrido_ms;

ALTER TABLE salas
  RENAME COLUMN code TO codigo,
  RENAME COLUMN name TO nombre,
  RENAME COLUMN mode TO modo,
  RENAME COLUMN host_id TO anfitrion_id,
  RENAME COLUMN config TO configuracion,
  RENAME COLUMN game_id TO partida_id,
  RENAME COLUMN created_at TO creado_en;

ALTER TABLE jugadores_sala
  RENAME COLUMN room_code TO sala_codigo,
  RENAME COLUMN user_id TO usuario_id,
  RENAME COLUMN team TO equipo,
  RENAME COLUMN ready TO listo;

ALTER TABLE mensajes_sala
  RENAME COLUMN room_code TO sala_codigo,
  RENAME COLUMN user_id TO usuario_id,
  RENAME COLUMN message TO mensaje,
  RENAME COLUMN created_at TO creado_en;

-- Las restricciones CHECK impiden renombrar sus columnas: scripts/aplicar-esquema.ts las quita
-- antes de esta migración y aquí se vuelven a crear con las columnas nuevas.
ALTER TABLE amistades
  RENAME COLUMN user_low TO usuario_menor,
  RENAME COLUMN user_high TO usuario_mayor,
  RENAME COLUMN requester_id TO solicitante_id,
  RENAME COLUMN status TO estado,
  RENAME COLUMN created_at TO creado_en;
-- En una sentencia aparte: combinarla con el cambio de nombres obliga a copiar la tabla, y MySQL
-- no lo permite cuando se renombran columnas con claves foráneas.
ALTER TABLE amistades ADD CONSTRAINT amistades_usuarios_distintos CHECK (usuario_menor <> usuario_mayor);

ALTER TABLE invitaciones_sala
  RENAME COLUMN room_code TO sala_codigo,
  RENAME COLUMN sender_id TO remitente_id,
  RENAME COLUMN recipient_id TO destinatario_id,
  RENAME COLUMN status TO estado,
  RENAME COLUMN expires_at TO expira_en,
  RENAME COLUMN created_at TO creado_en,
  RENAME INDEX invitation_recipient TO invitacion_destinatario,
  RENAME INDEX invitation_inbox TO invitaciones_bandeja;
ALTER TABLE invitaciones_sala
  ADD CONSTRAINT invitaciones_personas_distintas CHECK (remitente_id <> destinatario_id);

ALTER TABLE medios_cancion
  RENAME COLUMN song_id TO cancion_id,
  RENAME COLUMN source TO fuente,
  RENAME COLUMN external_id TO id_externo,
  RENAME COLUMN audio_url TO url_audio,
  RENAME COLUMN license_url TO url_licencia,
  RENAME COLUMN source_url TO url_fuente,
  RENAME COLUMN enabled TO habilitada,
  RENAME COLUMN clip_start TO inicio_fragmento,
  RENAME COLUMN duration TO duracion,
  RENAME COLUMN content_hash TO hash_contenido,
  RENAME COLUMN created_at TO creado_en,
  RENAME COLUMN updated_at TO actualizado_en,
  RENAME INDEX provider_track TO pista_proveedor;

ALTER TABLE sincronizacion_catalogo
  RENAME COLUMN genre TO genero,
  RENAME COLUMN artist_count TO cantidad_artistas,
  RENAME COLUMN track_count TO cantidad_pistas,
  RENAME COLUMN updated_at TO actualizado_en;

-- Valores de enumeración: se amplía el ENUM, se traducen los datos y se deja solo el español.
ALTER TABLE partidas
  MODIFY modo ENUM('solo','duel','teams','individual','duelo','equipos') NOT NULL,
  MODIFY estado ENUM('playing','finished','abandoned','en_curso','terminada','abandonada') NOT NULL DEFAULT 'playing';
UPDATE partidas SET
  modo = CASE modo WHEN 'solo' THEN 'individual' WHEN 'duel' THEN 'duelo' WHEN 'teams' THEN 'equipos' ELSE modo END,
  estado = CASE estado WHEN 'playing' THEN 'en_curso' WHEN 'finished' THEN 'terminada' WHEN 'abandoned' THEN 'abandonada' ELSE estado END;
ALTER TABLE partidas
  MODIFY modo ENUM('individual','duelo','equipos') NOT NULL,
  MODIFY estado ENUM('en_curso','terminada','abandonada') NOT NULL DEFAULT 'en_curso',
  ADD INDEX partidas_estado (estado, modo);

ALTER TABLE salas MODIFY modo ENUM('duel','teams','duelo','equipos') NOT NULL;
UPDATE salas SET modo = CASE modo WHEN 'duel' THEN 'duelo' WHEN 'teams' THEN 'equipos' ELSE modo END;
ALTER TABLE salas MODIFY modo ENUM('duelo','equipos') NOT NULL;

ALTER TABLE amistades MODIFY estado ENUM('pending','accepted','pendiente','aceptada') NOT NULL DEFAULT 'pending';
UPDATE amistades SET estado = CASE estado WHEN 'pending' THEN 'pendiente' WHEN 'accepted' THEN 'aceptada' ELSE estado END;
ALTER TABLE amistades MODIFY estado ENUM('pendiente','aceptada') NOT NULL DEFAULT 'pendiente';

ALTER TABLE invitaciones_sala
  MODIFY estado ENUM('pending','accepted','declined','pendiente','aceptada','rechazada') NOT NULL DEFAULT 'pending';
UPDATE invitaciones_sala SET estado = CASE estado
  WHEN 'pending' THEN 'pendiente' WHEN 'accepted' THEN 'aceptada' WHEN 'declined' THEN 'rechazada' ELSE estado END;
ALTER TABLE invitaciones_sala
  MODIFY estado ENUM('pendiente','aceptada','rechazada') NOT NULL DEFAULT 'pendiente';

ALTER TABLE medios_cancion
  MODIFY fuente ENUM('builtin','integrado','local','jamendo','audius','deezer') NOT NULL;
UPDATE medios_cancion SET fuente = 'integrado' WHERE fuente = 'builtin';
ALTER TABLE medios_cancion
  MODIFY fuente ENUM('integrado','local','jamendo','audius','deezer') NOT NULL;
