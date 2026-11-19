# Guía de archivos de la aplicación

Los archivos propios usan nombres en español, sin tildes ni espacios para facilitar su uso en Windows y otras plataformas. Sus comentarios explican las responsabilidades de los módulos y funciones. Las carpetas conservan la estructura existente.

## Archivos renombrados

| Antes                                             | Ahora                                                                                                           | Qué hace                                                                |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `server/auth.ts`                                  | [`server/autenticacion.ts`](../server/autenticacion.ts)                                                         | Gestiona sesiones, cookies y acceso de usuarios.                        |
| `server/app.ts`                                   | [`server/aplicacion.ts`](../server/aplicacion.ts)                                                               | Construye las rutas HTTP de la API y sus protecciones.                  |
| `server/config.ts`                                | [`server/configuracion.ts`](../server/configuracion.ts)                                                         | Valida las variables de entorno y los orígenes permitidos.              |
| `server/db.ts`                                    | [`server/base-datos.ts`](../server/base-datos.ts)                                                               | Administra la conexión a MySQL y las transacciones.                     |
| `server/errors.ts`                                | [`server/errores.ts`](../server/errores.ts)                                                                     | Define los errores HTTP que puede comunicar la API.                     |
| `server/games.ts`                                 | [`server/partidas.ts`](../server/partidas.ts)                                                                   | Controla rondas, respuestas, pistas, resultados y estadísticas.         |
| `server/index.ts`                                 | [`server/servidor.ts`](../server/servidor.ts)                                                                   | Inicia HTTP, Socket.IO y el reloj de las partidas multijugador.         |
| `server/music.ts`                                 | [`server/musica.ts`](../server/musica.ts)                                                                       | Consulta Deezer, sincroniza canciones y entrega el audio autorizado.    |
| `server/music-catalog.ts`                         | [`server/catalogo-musical.ts`](../server/catalogo-musical.ts)                                                   | Define los artistas y la cantidad de canciones de cada género.          |
| `server/rooms.ts`                                 | [`server/salas.ts`](../server/salas.ts)                                                                         | Gestiona salas privadas, participantes, equipos y chat.                 |
| `server/scoring.ts`                               | [`server/puntuacion.ts`](../server/puntuacion.ts)                                                               | Compara respuestas y calcula los puntos obtenidos.                      |
| `server/validation.ts`                            | [`server/validacion.ts`](../server/validacion.ts)                                                               | Valida formularios, contraseñas y peticiones con Zod.                   |
| `shared/types.ts`                                 | [`shared/tipos.ts`](../shared/tipos.ts)                                                                         | Define los datos que comparten el cliente y el servidor.                |
| `shared/music.ts`                                 | [`shared/musica.ts`](../shared/musica.ts)                                                                       | Define las opciones del catálogo y los géneros retirados.               |
| `shared/game-clock.ts`                            | [`shared/reloj-partida.ts`](../shared/reloj-partida.ts)                                                         | Calcula el contador y lo congela al responder una ronda.                |
| `src/App.tsx`                                     | [`src/Aplicacion.tsx`](../src/Aplicacion.tsx)                                                                   | Coordina las pantallas, la sesión y la navegación principal.            |
| `src/main.tsx`                                    | [`src/principal.tsx`](../src/principal.tsx)                                                                     | Carga React, las fuentes y los estilos de la aplicación.                |
| `src/components.tsx`                              | [`src/componentes.tsx`](../src/componentes.tsx)                                                                 | Reúne los controles visuales y utilidades comunes de las pantallas.     |
| `src/context.tsx`                                 | [`src/contexto.tsx`](../src/contexto.tsx)                                                                       | Comparte la sesión y las preferencias entre los componentes.            |
| `src/music.ts`                                    | [`src/musica.ts`](../src/musica.ts)                                                                             | Obtiene las opciones musicales disponibles para configurar partidas.    |
| `src/styles.css`                                  | [`src/estilos.css`](../src/estilos.css)                                                                         | Define colores, distribución, adaptación a móviles y estilos visuales.  |
| `src/pages/Auth.tsx`                              | [`src/pages/Acceso.tsx`](../src/pages/Acceso.tsx)                                                               | Muestra los formularios de registro e inicio de sesión.                 |
| `src/pages/Friends.tsx`                           | [`src/pages/Amigos.tsx`](../src/pages/Amigos.tsx)                                                               | Muestra amigos, solicitudes e invitaciones a salas.                     |
| `src/pages/Game.tsx`                              | [`src/pages/Partida.tsx`](../src/pages/Partida.tsx)                                                             | Muestra las rondas, reproduce los fragmentos y presenta los resultados. |
| `src/pages/Home.tsx`                              | [`src/pages/Inicio.tsx`](../src/pages/Inicio.tsx)                                                               | Muestra el inicio y la selección de modos de juego.                     |
| `src/pages/Multiplayer.tsx`                       | [`src/pages/Multijugador.tsx`](../src/pages/Multijugador.tsx)                                                   | Permite crear salas, unirse y preparar duelos o equipos.                |
| `src/pages/Settings.tsx`                          | [`src/pages/Opciones.tsx`](../src/pages/Opciones.tsx)                                                           | Permite modificar audio, accesibilidad y datos de la cuenta.            |
| `src/pages/Setup.tsx`                             | [`src/pages/PrepararPartida.tsx`](../src/pages/PrepararPartida.tsx)                                             | Configura género, rondas y tiempo del modo individual.                 |
| `scripts/dev.ts`                                  | [`scripts/desarrollo.ts`](../scripts/desarrollo.ts)                                                             | Inicia el cliente Vite y el servidor durante el desarrollo.             |
| `scripts/migrate-local.ts`                        | [`scripts/migrar-local.ts`](../scripts/migrar-local.ts)                                                         | Aplica el esquema y las migraciones al MySQL portátil existente.        |
| `scripts/provision-local.ts`                      | [`scripts/preparar-entorno-local.ts`](../scripts/preparar-entorno-local.ts)                                     | Prepara una instancia local nueva y sus credenciales protegidas.        |
| `scripts/reset-password.ts`                       | [`scripts/restablecer-contrasena.ts`](../scripts/restablecer-contrasena.ts)                                     | Permite recuperar una cuenta desde la consola administrativa.           |
| `scripts/setup-db.ts`                             | [`scripts/preparar-base-datos.ts`](../scripts/preparar-base-datos.ts)                                           | Prepara el esquema MySQL y el catálogo inicial o los datos de prueba.   |
| `scripts/start-local-mysql.ps1`                   | [`scripts/iniciar-mysql-local.ps1`](../scripts/iniciar-mysql-local.ps1)                                         | Inicia MySQL portátil sin instalar un servicio de Windows.              |
| `scripts/stop-local-mysql.ts`                     | [`scripts/detener-mysql-local.ts`](../scripts/detener-mysql-local.ts)                                           | Detiene únicamente el MySQL portátil del proyecto.                      |
| `scripts/sync-music.ts`                           | [`scripts/sincronizar-musica.ts`](../scripts/sincronizar-musica.ts)                                             | Actualiza los artistas y canciones oficiales del catálogo.              |
| `scripts/test-integration.ts`                     | [`scripts/probar-integracion.ts`](../scripts/probar-integracion.ts)                                             | Ejecuta las pruebas contra una base MySQL aislada.                      |
| `tests/scoring.test.ts`                           | [`tests/puntuacion.test.ts`](../tests/puntuacion.test.ts)                                                       | Comprueba respuestas, puntuación y validación de configuración.         |
| `tests/music.test.ts`                             | [`tests/musica.test.ts`](../tests/musica.test.ts)                                                               | Comprueba perfiles, popularidad, catálogo y seguridad del audio.        |
| `tests/game-clock.test.ts`                        | [`tests/reloj-partida.test.ts`](../tests/reloj-partida.test.ts)                                                 | Comprueba el contador, su detención y el reinicio de las rondas.        |
| `tests/integration/music.test.ts`                 | [`tests/integration/musica.test.ts`](../tests/integration/musica.test.ts)                                       | Verifica el catálogo y el audio de los modos de juego con MySQL.        |
| `database/schema.sql`                             | [`database/esquema.sql`](../database/esquema.sql)                                                               | Define las tablas y relaciones de la base MySQL.                        |
| `database/migrations/002_social_rooms.sql`        | [`database/migrations/002_amigos_y_salas.sql`](../database/migrations/002_amigos_y_salas.sql)                   | Actualiza amistades, invitaciones y salas privadas.                     |
| `database/migrations/004_real_recordings.sql`     | [`database/migrations/004_grabaciones_reales.sql`](../database/migrations/004_grabaciones_reales.sql)           | Introduce referencias de grabaciones y excluye melodías antiguas.       |
| `database/migrations/005_official_recordings.sql` | [`database/migrations/005_grabaciones_oficiales.sql`](../database/migrations/005_grabaciones_oficiales.sql)     | Habilita las muestras oficiales de Deezer y conserva el historial.      |
| `database/migrations/006_remove_genres.sql`       | [`database/migrations/006_retirar_generos.sql`](../database/migrations/006_retirar_generos.sql)                 | Retira Blues, Jazz y Country del catálogo jugable.                      |
| `database/migrations/007_catalog_sync.sql`        | [`database/migrations/007_sincronizacion_catalogo.sql`](../database/migrations/007_sincronizacion_catalogo.sql) | Guarda las versiones y los conteos de las sincronizaciones completas.   |
| `docs/ARCHITECTURE.md`                            | [`docs/ARQUITECTURA.md`](../docs/ARQUITECTURA.md)                                                               | Explica cómo se comunican y organizan los módulos de la aplicación.     |
| `docs/DESIGN.md`                                  | [`docs/DISENO.md`](../docs/DISENO.md)                                                                           | Documenta las pantallas y las decisiones del diseño visual.             |
| `docs/ADDING-MUSIC.md`                            | [`docs/INTEGRACION-MUSICAL.md`](../docs/INTEGRACION-MUSICAL.md)                                                 | Explica el catálogo, la integración con Deezer y la reproducción.       |

## Nombres conservados

- `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`: nombres que utilizan Node.js y el gestor de paquetes. Los comandos `pnpm start`, `pnpm build`, `pnpm test` y los demás comandos existentes siguen funcionando.
- `tsconfig.json`, `vite.config.ts`, `index.html`: configuración y punto de entrada que reconocen TypeScript y Vite.
- `.env`, `.env.example`, `.gitignore`, `.prettierignore`, `.prettierrc.json`, `compose.yaml`: configuración de herramientas e instalación.
- `README.md`: documento principal que reconocen los repositorios y editores.
- `api.ts`, `audio.ts`, `social.tsx`, `social.ts`, `API.md`, `MYSQL.md`, `SOCIAL.md`: siglas, nombres propios o palabras que también se usan en español.
- La terminación `.test.ts` y las extensiones `.ts`, `.tsx`, `.css`, `.sql`, `.ps1` se mantienen para que las herramientas identifiquen cada archivo.
- Los recursos de Figma utilizados, las fuentes y dependencias mantienen sus nombres originales y sus referencias. Se eliminaron los manifiestos temporales de descarga que no utiliza la aplicación.

## Compatibilidad

`scripts/empaquetar-codigo.ps1` genera una entrega del código fuente actual y comprueba sus archivos por SHA-256. Excluye las credenciales, la base local, las dependencias y los archivos compilados.

Los módulos que ya tenían un nombre válido en español o una sigla reconocida también conservan sus comentarios:

- `src/api.ts` envía las peticiones HTTP de las pantallas al servidor y comunica los errores.
- `src/audio.ts` genera el aviso sonoro de cuenta atrás.
- `src/social.tsx` comparte el estado de amigos e invitaciones entre las pantallas.
- `server/social.ts` gestiona amistades e invitaciones en MySQL y comprueba sus permisos.

Los cambios afectan a nombres de archivos y sus referencias. Se mantienen las rutas HTTP, los nombres de tablas y columnas de MySQL, las variables de entorno, los contratos de datos y los identificadores de las bibliotecas. No es necesario volver a crear la base ni perder usuarios, canciones o partidas.

Las importaciones del servidor terminadas en `.js` siguen siendo válidas: TypeScript y `tsx` las resuelven a sus fuentes `.ts`; no hay que crear archivos JavaScript duplicados.
