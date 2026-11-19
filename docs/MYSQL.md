# Preparación de MySQL

## Instancia portátil preparada

Se descargó la distribución oficial MySQL Community Server 8.4.6 para Windows. Está en `.runtime/mysql-8.4.6-winx64/`; sus datos están en `.runtime/mysql-data/` y escucha exclusivamente en `127.0.0.1:3307`.

Esta instancia no utiliza el directorio de datos de XAMPP. La distribución de XAMPP encontrada era MariaDB 10.4, por eso se preparó una instancia MySQL independiente.

`scripts/preparar-entorno-local.ts` crea una contraseña administrativa aleatoria, prepara el esquema, genera el catálogo y configura `guess_app` con SELECT, INSERT, UPDATE y DELETE. `.env` y `.runtime/mysql-admin.env` están ignorados por Git. No publiques ni copies esos archivos a documentación o incidencias.

Para arrancar desde PowerShell: `./scripts/iniciar-mysql-local.ps1`. Para detenerla limpiamente: `pnpm mysql:stop`. Para aplicar cambios de esquema idempotentes en esta instalación: `pnpm exec tsx scripts/migrar-local.ts`.

## Otra instalación MySQL

1. Crea una cuenta de instalación o usa una cuenta administrativa durante la preparación.
2. Configura `.env` temporalmente con esa cuenta y la base `guess_the_beat`.
3. Ejecuta `pnpm db:setup`. El script crea la base si falta, las tablas y el catálogo, y aplica la migración de funciones. Conserva usuarios y partidas; retira las tablas de las funciones eliminadas.
4. Crea una cuenta de aplicación y otórgale únicamente los permisos necesarios:

   ```sql
   CREATE USER 'guess_app'@'127.0.0.1' IDENTIFIED BY 'UNA_CLAVE_UNICA_Y_SEGURA';
   GRANT SELECT, INSERT, UPDATE, DELETE ON guess_the_beat.* TO 'guess_app'@'127.0.0.1';
   ```

5. Cambia `.env` a esa cuenta. La contraseña de ejemplo no es una credencial preparada.

Si Node y MySQL están en contenedores o máquinas diferentes, adapta el host del usuario MySQL y `DB_HOST`. Evita publicar el puerto de MySQL a Internet.

## Docker

El archivo `compose.yaml` inicia la imagen oficial `mysql:8.4` y conserva los datos en el volumen `mysql_data`. El puerto expuesto se limita a `127.0.0.1:3306`.

Define en `.env` una contraseña administrativa `MYSQL_ROOT_PASSWORD` y `DB_PASSWORD` para el usuario de aplicación. Después:

```powershell
docker compose up -d mysql
```

Espera a que el contenedor esté healthy. Ejecuta `pnpm db:setup` con una cuenta que pueda crear el esquema; luego vuelve a las credenciales de aplicación. El usuario inicial creado por la imagen tiene permisos sobre su base; puedes reducirlos a CRUD después de la instalación.

## Tablas

| Tabla            | Contenido                                                                     |
| ---------------- | ----------------------------------------------------------------------------- |
| users            | Perfiles y hash bcrypt.                                                       |
| sessions         | Hash SHA-256 del token y vencimiento.                                         |
| user_settings    | Preferencias JSON por usuario.                                                |
| songs            | Título, compositor, alias, género, año y audio privado.                       |
| games            | Configuración, canciones privadas, estado, ronda y reloj.                     |
| game_players     | Miembros y equipos de cada partida.                                           |
| answers          | Una respuesta por usuario/ronda, corrección, puntos y tiempo.                 |
| rooms            | Código, nombre, anfitrión, reglas y partida asociada.                         |
| room_players     | Integrantes, equipo y confirmación.                                           |
| room_messages    | Historial de chat.                                                            |
| friendships      | Solicitudes y amistades aceptadas, una relación por par.                      |
| room_invitations | Invitaciones de sala con remitente, destinatario, estado y vencimiento.       |
| song_media       | Origen del audio, licencia, fragmento, disponibilidad y huella de duplicados. |

Todas las relaciones utilizan claves foráneas. Las tablas con identificadores relacionados comparten `utf8mb4_unicode_ci` para evitar incompatibilidades entre intercalaciones. La clave primaria compuesta de `answers` evita duplicados incluso con solicitudes simultáneas.

## Actualización de funciones

El esquema nuevo se aplica junto con `database/migrations/002_amigos_y_salas.sql`; esa migración retira exclusivamente las tablas de funciones eliminadas. `db:setup` y la migración local aplican ambos archivos. Conservan usuarios y partidas. Consulta [Amigos e invitaciones](SOCIAL.md).

## Diagnóstico

- `/api/health` devuelve la versión del motor y 200 cuando hay conexión. Un fallo devuelve 503; no activa un almacenamiento alternativo.
- `ECONNREFUSED`: comprueba que MySQL esté arrancado y que el puerto coincida con `.env`.
- `ER_ACCESS_DENIED_ERROR`: revisa usuario, contraseña y host de la cuenta MySQL.
- `ER_BAD_DB_ERROR`: ejecuta la preparación con una cuenta de instalación.
- No ejecutes `db:setup` con una cuenta CRUD esperando que pueda crear tablas. En la instancia portátil usa la migración administrativa indicada arriba.

Para compartir el proyecto conserva el código y su configuración de ejemplo. Las grabaciones se transmiten desde Deezer; no se distribuye un catálogo de audio. No distribuyas el directorio de datos ni secretos administrativos. Un respaldo de producción debe hacerse con las herramientas de MySQL y una política de recuperación propia.

La migración 007 incorpora `music_catalog_sync`, con género, huella de configuración, número de artistas, canciones y fecha. Una publicación completa y sus referencias de audio se confirman en la misma transacción. Consulta [el catálogo de artistas](CATALOGO-ARTISTAS.md).
