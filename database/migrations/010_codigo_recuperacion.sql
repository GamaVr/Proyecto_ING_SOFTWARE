-- Añade almacenamiento hash para el código secreto que permite recuperar la contraseña.
ALTER TABLE users ADD COLUMN recovery_code_hash VARCHAR(255) NULL;
