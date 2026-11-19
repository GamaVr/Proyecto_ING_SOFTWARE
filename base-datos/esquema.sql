-- Esquema completo de Guess The Beat para MySQL 8.4+.
-- Es repetible (CREATE TABLE IF NOT EXISTS) y no elimina datos existentes.
-- Las bases creadas con el esquema anterior en inglés se convierten con
-- base-datos/migraciones/011_nombres_en_espanol.sql (scripts/aplicar-esquema.ts lo decide).

CREATE TABLE IF NOT EXISTS usuarios (
  id CHAR(36) PRIMARY KEY,
  nombre VARCHAR(30) NOT NULL,
  correo VARCHAR(254) NOT NULL UNIQUE,
  hash_contrasena VARCHAR(255) NOT NULL,
  hash_codigo_recuperacion VARCHAR(255) NULL,
  creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Solo se guarda el hash SHA-256 del token; la cookie nunca se almacena en claro.
CREATE TABLE IF NOT EXISTS sesiones (
  hash_token CHAR(64) PRIMARY KEY,
  usuario_id CHAR(36) NOT NULL,
  expira_en BIGINT NOT NULL,
  INDEX sesiones_expiracion (expira_en),
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS preferencias_usuario (
  usuario_id CHAR(36) PRIMARY KEY,
  preferencias JSON NOT NULL,
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS canciones (
  id VARCHAR(40) PRIMARY KEY,
  titulo VARCHAR(150) NOT NULL,
  artista VARCHAR(150) NOT NULL,
  alias JSON NOT NULL,
  genero VARCHAR(40) NOT NULL,
  anio_lanzamiento SMALLINT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS partidas (
  id CHAR(36) PRIMARY KEY,
  modo ENUM('individual','duelo','equipos') NOT NULL,
  estado ENUM('en_curso','terminada','abandonada') NOT NULL DEFAULT 'en_curso',
  configuracion JSON NOT NULL,
  canciones_ids JSON NOT NULL,
  ronda_actual SMALLINT NOT NULL DEFAULT 0,
  ronda_iniciada_en BIGINT NOT NULL,
  creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX partidas_estado (estado, modo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS jugadores_partida (
  partida_id CHAR(36) NOT NULL,
  usuario_id CHAR(36) NOT NULL,
  equipo SMALLINT NOT NULL DEFAULT 0,
  PRIMARY KEY (partida_id,usuario_id),
  FOREIGN KEY (partida_id) REFERENCES partidas(id) ON DELETE CASCADE,
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS respuestas (
  partida_id CHAR(36) NOT NULL,
  usuario_id CHAR(36) NOT NULL,
  indice_ronda SMALLINT NOT NULL,
  respuesta VARCHAR(200) NOT NULL,
  correcta BOOLEAN NOT NULL,
  puntos INT NOT NULL,
  transcurrido_ms INT NOT NULL,
  PRIMARY KEY (partida_id,usuario_id,indice_ronda),
  FOREIGN KEY (partida_id,usuario_id) REFERENCES jugadores_partida(partida_id,usuario_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS salas (
  codigo CHAR(6) PRIMARY KEY,
  nombre VARCHAR(60) NOT NULL,
  modo ENUM('duelo','equipos') NOT NULL,
  anfitrion_id CHAR(36) NOT NULL,
  configuracion JSON NOT NULL,
  partida_id CHAR(36) NULL,
  creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (anfitrion_id) REFERENCES usuarios(id),
  FOREIGN KEY (partida_id) REFERENCES partidas(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS jugadores_sala (
  sala_codigo CHAR(6) NOT NULL,
  usuario_id CHAR(36) NOT NULL,
  equipo SMALLINT NOT NULL,
  listo BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY (sala_codigo,usuario_id),
  FOREIGN KEY (sala_codigo) REFERENCES salas(codigo) ON DELETE CASCADE,
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS mensajes_sala (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  sala_codigo CHAR(6) NOT NULL,
  usuario_id CHAR(36) NOT NULL,
  mensaje VARCHAR(300) NOT NULL,
  creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (sala_codigo) REFERENCES salas(codigo) ON DELETE CASCADE,
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Una única relación canónica (id menor, id mayor) evita solicitudes cruzadas duplicadas.
CREATE TABLE IF NOT EXISTS amistades (
  usuario_menor CHAR(36) NOT NULL,
  usuario_mayor CHAR(36) NOT NULL,
  solicitante_id CHAR(36) NOT NULL,
  estado ENUM('pendiente','aceptada') NOT NULL DEFAULT 'pendiente',
  creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (usuario_menor,usuario_mayor),
  CHECK (usuario_menor <> usuario_mayor),
  FOREIGN KEY (usuario_menor) REFERENCES usuarios(id) ON DELETE CASCADE,
  FOREIGN KEY (usuario_mayor) REFERENCES usuarios(id) ON DELETE CASCADE,
  FOREIGN KEY (solicitante_id) REFERENCES usuarios(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS invitaciones_sala (
  id CHAR(36) PRIMARY KEY,
  sala_codigo CHAR(6) NOT NULL,
  remitente_id CHAR(36) NOT NULL,
  destinatario_id CHAR(36) NOT NULL,
  estado ENUM('pendiente','aceptada','rechazada') NOT NULL DEFAULT 'pendiente',
  expira_en BIGINT NOT NULL,
  creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY invitacion_destinatario (sala_codigo,destinatario_id),
  INDEX invitaciones_bandeja (destinatario_id,estado,expira_en),
  CHECK (remitente_id <> destinatario_id),
  FOREIGN KEY (sala_codigo) REFERENCES salas(codigo) ON DELETE CASCADE,
  FOREIGN KEY (remitente_id) REFERENCES usuarios(id) ON DELETE CASCADE,
  FOREIGN KEY (destinatario_id) REFERENCES usuarios(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Referencia a la muestra oficial de cada canción; el audio se resuelve al reproducir la ronda.
CREATE TABLE IF NOT EXISTS medios_cancion (
  cancion_id VARCHAR(40) PRIMARY KEY,
  fuente ENUM('integrado','local','jamendo','audius','deezer') NOT NULL,
  id_externo VARCHAR(40) NULL,
  url_audio TEXT NULL,
  url_licencia VARCHAR(255) NULL,
  url_fuente VARCHAR(255) NULL,
  habilitada BOOLEAN NOT NULL DEFAULT TRUE,
  inicio_fragmento SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  duracion SMALLINT UNSIGNED NOT NULL DEFAULT 12,
  creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  actualizado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY pista_proveedor (fuente,id_externo),
  FOREIGN KEY (cancion_id) REFERENCES canciones(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Publicaciones completas por género; la huella cambia al modificar artistas o selección de éxitos.
CREATE TABLE IF NOT EXISTS sincronizacion_catalogo (
  genero VARCHAR(40) PRIMARY KEY,
  version CHAR(64) NOT NULL,
  cantidad_artistas SMALLINT UNSIGNED NOT NULL,
  cantidad_pistas SMALLINT UNSIGNED NOT NULL,
  actualizado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
