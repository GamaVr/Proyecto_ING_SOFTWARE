-- Registros pendientes hasta que la persona confirme que controla el correo.
CREATE TABLE IF NOT EXISTS pending_registrations (
  token_hash CHAR(64) PRIMARY KEY,
  email VARCHAR(254) NOT NULL UNIQUE,
  name VARCHAR(30) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  expires_at BIGINT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX pending_registration_expiry (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
