-- MySQL 8.4+. El script es repetible y no elimina datos existentes.
CREATE TABLE IF NOT EXISTS users (
  id CHAR(36) PRIMARY KEY,
  name VARCHAR(30) NOT NULL,
  email VARCHAR(254) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  recovery_code_hash VARCHAR(255) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS sessions (
  token_hash CHAR(64) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  expires_at BIGINT NOT NULL,
  INDEX sessions_expiry (expires_at),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_settings (
  user_id CHAR(36) PRIMARY KEY,
  settings JSON NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS songs (
  id VARCHAR(40) PRIMARY KEY,
  title VARCHAR(150) NOT NULL,
  artist VARCHAR(150) NOT NULL,
  aliases JSON NOT NULL,
  genre VARCHAR(40) NOT NULL,
  release_year SMALLINT NOT NULL,
  audio_file VARCHAR(100) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS games (
  id CHAR(36) PRIMARY KEY,
  mode ENUM('solo','duel','teams') NOT NULL,
  status ENUM('playing','finished','abandoned') NOT NULL DEFAULT 'playing',
  config JSON NOT NULL,
  song_ids JSON NOT NULL,
  current_round SMALLINT NOT NULL DEFAULT 0,
  round_started_at BIGINT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS game_players (
  game_id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  team SMALLINT NOT NULL DEFAULT 0,
  PRIMARY KEY (game_id,user_id),
  FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS answers (
  game_id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  round_index SMALLINT NOT NULL,
  answer VARCHAR(200) NOT NULL,
  correct BOOLEAN NOT NULL,
  points INT NOT NULL,
  elapsed_ms INT NOT NULL,
  PRIMARY KEY (game_id,user_id,round_index),
  FOREIGN KEY (game_id,user_id) REFERENCES game_players(game_id,user_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS rooms (
  code CHAR(6) PRIMARY KEY,
  name VARCHAR(60) NOT NULL,
  mode ENUM('duel','teams') NOT NULL,
  host_id CHAR(36) NOT NULL,
  config JSON NOT NULL,
  game_id CHAR(36) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (host_id) REFERENCES users(id),
  FOREIGN KEY (game_id) REFERENCES games(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS room_players (
  room_code CHAR(6) NOT NULL,
  user_id CHAR(36) NOT NULL,
  team SMALLINT NOT NULL,
  ready BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY (room_code,user_id),
  FOREIGN KEY (room_code) REFERENCES rooms(code) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS room_messages (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  room_code CHAR(6) NOT NULL,
  user_id CHAR(36) NOT NULL,
  message VARCHAR(300) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (room_code) REFERENCES rooms(code) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
-- Una única relación canónica evita solicitudes cruzadas duplicadas.
CREATE TABLE IF NOT EXISTS friendships (
  user_low CHAR(36) NOT NULL,
  user_high CHAR(36) NOT NULL,
  requester_id CHAR(36) NOT NULL,
  status ENUM('pending','accepted') NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_low,user_high),
  CHECK (user_low <> user_high),
  FOREIGN KEY (user_low) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (user_high) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (requester_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS room_invitations (
  id CHAR(36) PRIMARY KEY,
  room_code CHAR(6) NOT NULL,
  sender_id CHAR(36) NOT NULL,
  recipient_id CHAR(36) NOT NULL,
  status ENUM('pending','accepted','declined') NOT NULL DEFAULT 'pending',
  expires_at BIGINT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY invitation_recipient (room_code,recipient_id),
  INDEX invitation_inbox (recipient_id,status,expires_at),
  CHECK (sender_id <> recipient_id),
  FOREIGN KEY (room_code) REFERENCES rooms(code) ON DELETE CASCADE,
  FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (recipient_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS song_media (
  song_id VARCHAR(40) PRIMARY KEY,
  source ENUM('builtin','local','jamendo','audius','deezer') NOT NULL,
  external_id VARCHAR(40) NULL,
  audio_url TEXT NULL,
  license_url VARCHAR(255) NULL,
  source_url VARCHAR(255) NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  clip_start SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  duration SMALLINT UNSIGNED NOT NULL DEFAULT 12,
  content_hash CHAR(64) NULL UNIQUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY provider_track (source,external_id),
  FOREIGN KEY (song_id) REFERENCES songs(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO song_media(song_id,source,enabled) SELECT id,'builtin',FALSE FROM songs;

CREATE TABLE IF NOT EXISTS music_catalog_sync (
  genre VARCHAR(40) PRIMARY KEY,
  version CHAR(64) NOT NULL,
  artist_count SMALLINT UNSIGNED NOT NULL,
  track_count SMALLINT UNSIGNED NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
