# Preparación de MySQL

## Instancia portátil preparada

Se descargó la distribución oficial MySQL Community Server 8.4.6 para Windows. Está en `.runtime/mysql-8.4.6-winx64/`; sus datos están en `.runtime/mysql-data/` y escucha exclusivamente en `127.0.0.1:3307`.

Esta instancia no utiliza el directorio de datos de XAMPP. La distribución de XAMPP encontrada era MariaDB 10.4, por eso se preparó una instancia MySQL independiente.

`scripts/preparar-entorno-local.ts` crea una contraseña administrativa aleatoria, prepara el esquema, genera el catálogo y configura `guess_app` con SELECT, INSERT, UPDATE y DELETE. `.env` y `.runtime/mysql-admin.env` están ignorados por Git. No publiques ni copies esos archivos a documentación o incidencias.

Para arrancar desde PowerShell: `./scripts/iniciar-mysql-local.ps1`. Para detenerla limpiamente: `pnpm mysql:detener`. Para aplicar el esquema en esta instalación (y convertir una base antigua): `pnpm bd:migrar`.

## Otra instalación MySQL

1. Crea una cuenta de instalación o usa una cuenta administrativa durante la preparación.
2. Configura `.env` temporalmente con esa cuenta y la base `guess_the_beat`.
3. Ejecuta `pnpm bd:preparar`. El script crea la base si falta, las tablas y el catálogo. Si encuentra una base del esquema anterior, la convierte conservando usuarios y partidas.
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

Espera a que el contenedor esté healthy. Ejecuta `pnpm bd:preparar` con una cuenta que pueda crear el esquema; luego vuelve a las credenciales de aplicación. El usuario inicial creado por la imagen tiene permisos sobre su base; puedes reducirlos a CRUD después de la instalación.

## Tablas

| Tabla                   | Contenido                                                                     |
| ----------------------- | ----------------------------------------------------------------------------- |
| usuarios                | Perfiles, hash bcrypt de la contraseña y del código de recuperación.          |
| sesiones                | Hash SHA-256 del token y vencimiento.                                         |
| preferencias_usuario    | Preferencias JSON por usuario.                                                |
| canciones               | Título, artista, alias, género y año.                                         |
| medios_cancion          | Fuente del audio, referencia de Deezer, licencia, fragmento y disponibilidad. |
| sincronizacion_catalogo | Huella y conteos de la última publicación de cada género.                     |
| partidas                | Modo, estado, configuración, canciones elegidas, ronda y reloj.               |
| jugadores_partida       | Integrantes y equipos de cada partida.                                        |
| respuestas              | Una respuesta por persona y ronda, corrección, puntos y tiempo.               |
| salas                   | Código, nombre, anfitrión, reglas y partida asociada.                         |
| jugadores_sala          | Integrantes, equipo y confirmación.                                           |
| mensajes_sala           | Historial del chat.                                                           |
| amistades               | Solicitudes y amistades aceptadas, una relación por par.                      |
| invitaciones_sala       | Invitaciones con remitente, destinatario, estado y vencimiento.               |

Todas las relaciones usan claves foráneas y la intercalación `utf8mb4_unicode_ci`. La clave primaria compuesta de `respuestas` evita duplicados incluso con solicitudes simultáneas. El índice `partidas_estado` acelera la consulta que hace el reloj cada segundo.

## Conversión desde el esquema anterior

Las bases creadas antes de la traducción tienen tablas y columnas en inglés (`users`, `games`…). `pnpm bd:migrar` o `pnpm bd:preparar` las detectan y ejecutan `scripts/aplicar-esquema.ts`, que:

1. Aplica las migraciones históricas pendientes (002–010).
2. Ejecuta `base-datos/migraciones/011_nombres_en_espanol.sql`: renombra tablas, columnas e índices, traduce los valores de modos y estados y elimina las tablas del flujo de correo retirado.
3. Traduce las claves de los JSON guardados (configuración de partidas y salas, preferencias).

MySQL no revierte cambios de estructura dentro de una transacción. **Haz una copia de seguridad antes** (`mysqldump --single-transaction guess_the_beat > respaldo.sql`).

## Diagnóstico

- `/api/estado` devuelve la versión del motor y 200 cuando hay conexión. Un fallo devuelve 503; no activa un almacenamiento alternativo.
- `ECONNREFUSED`: comprueba que MySQL esté arrancado y que el puerto coincida con `.env`.
- `ER_ACCESS_DENIED_ERROR`: revisa usuario, contraseña y host de la cuenta MySQL.
- `ER_BAD_DB_ERROR`: ejecuta la preparación con una cuenta de instalación.
- No ejecutes `bd:preparar` con una cuenta CRUD esperando que pueda crear tablas. En la instancia portátil usa la migración administrativa indicada arriba.

Para compartir el proyecto conserva el código y su configuración de ejemplo. Las grabaciones se transmiten desde Deezer; no se distribuye un catálogo de audio. No distribuyas el directorio de datos ni secretos administrativos. Un respaldo de producción debe hacerse con las herramientas de MySQL y una política de recuperación propia.

`sincronizacion_catalogo` guarda género, huella de configuración, número de artistas y canciones y fecha. Una publicación completa y sus referencias de audio se confirman en la misma transacción. Consulta [el catálogo de artistas](CATALOGO-ARTISTAS.md).
