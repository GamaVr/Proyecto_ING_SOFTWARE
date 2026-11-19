-- Retira exclusivamente las tablas de las funciones eliminadas a petición del usuario.
-- Los usuarios, sus partidas y puntuaciones de cada sesión permanecen intactos.
DROP TABLE IF EXISTS matchmaking_queue;
DROP TABLE IF EXISTS matchmaking_mutex;
DROP TABLE IF EXISTS player_ratings;
