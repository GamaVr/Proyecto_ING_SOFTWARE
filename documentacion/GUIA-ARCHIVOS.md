# Guía de archivos

Carpetas, archivos, funciones, variables, tipos, rutas de la API, tablas y columnas usan nombres en español, sin tildes ni espacios. Cada módulo empieza con un comentario que explica su responsabilidad. La organización por capas se describe en [Arquitectura](ARQUITECTURA.md).

## Servidor (`servidor/`)

| Archivo                        | Qué hace                                                                    |
| ------------------------------ | --------------------------------------------------------------------------- |
| `principal.ts`                 | Punto de entrada: arranca HTTP, tiempo real y la carga del catálogo.        |
| `aplicacion.ts`                | Middleware de seguridad, montaje de las rutas y respuesta de errores.       |
| `tiempo-real.ts`               | Canales de Socket.IO, sus permisos y el reloj de las partidas multijugador. |
| `configuracion.ts`             | Valida las variables de entorno y los orígenes permitidos.                  |
| `errores.ts`                   | `ErrorHttp`, errores con un código HTTP seguro de mostrar.                  |
| `validacion.ts`                | Esquemas Zod de formularios y peticiones.                                   |
| `datos/base-datos.ts`          | Conexiones a MySQL, consultas parametrizadas y transacciones.               |
| `rutas/autenticacion.ts`       | Registro, inicio y cierre de sesión, recuperación de contraseña.            |
| `rutas/perfil.ts`              | Perfil, contraseña, código de recuperación y preferencias.                  |
| `rutas/partidas.ts`            | Crear, consultar, escuchar, responder, avanzar y abandonar partidas.        |
| `rutas/salas.ts`               | Salas privadas: crear, unirse, confirmar, chatear, iniciar y salir.         |
| `rutas/social.ts`              | Amigos, búsqueda de personas e invitaciones.                                |
| `rutas/musica.ts`              | Géneros disponibles, búsqueda en el catálogo y muestras de audio.           |
| `servicios/sesiones.ts`        | Cookie de sesión, hash de tokens y `exigirUsuario`.                         |
| `servicios/partidas.ts`        | Rondas, respuestas, resultados y estadísticas.                              |
| `servicios/salas.ts`           | Capacidad, equipos, anfitrión, confirmaciones y chat.                       |
| `servicios/social.ts`          | Amistades e invitaciones con sus permisos.                                  |
| `servicios/puntuacion.ts`      | Normalización de respuestas, puntos y barajado.                             |
| `servicios/musica/deezer.ts`   | Cliente de Deezer y transmisión segura de las muestras.                     |
| `servicios/musica/catalogo.ts` | Guardado de canciones y géneros disponibles para jugar.                     |
| `servicios/musica/listas.ts`   | Importación de listas: busca cada canción en Deezer y le asigna su género.  |

## Código compartido (`compartido/`)

| Archivo            | Qué hace                                           |
| ------------------ | -------------------------------------------------- |
| `tipos.ts`         | Contratos de datos entre el cliente y el servidor. |
| `musica.ts`        | Opciones del catálogo y géneros retirados.         |
| `reloj-partida.ts` | Contador de la ronda; se congela al responder.     |

## Cliente (`src/`)

| Archivo                       | Qué hace                                                             |
| ----------------------------- | -------------------------------------------------------------------- |
| `principal.tsx`               | Carga React, las fuentes y los estilos.                              |
| `Aplicacion.tsx`              | Sesión, navegación por rutas hash y avisos.                          |
| `estilos.css`                 | Colores, distribución y adaptación a móviles.                        |
| `paginas/Acceso.tsx`          | Registro, inicio de sesión y recuperación.                           |
| `paginas/Inicio.tsx`          | Selección de modo de juego.                                          |
| `paginas/PrepararPartida.tsx` | Género, rondas y tiempo del modo individual.                         |
| `paginas/Partida.tsx`         | Rondas, reproducción del fragmento y resultados.                     |
| `paginas/Multijugador.tsx`    | Crear salas de duelo o equipos y sala de espera.                     |
| `paginas/Amigos.tsx`          | Amigos, solicitudes e invitaciones.                                  |
| `paginas/Opciones.tsx`        | Audio, accesibilidad y cuenta.                                       |
| `componentes/comunes.tsx`     | Botones, tarjetas, iconos y `useEnVivo` (sincronización por socket). |
| `estado/contexto.tsx`         | Contexto de sesión y preferencias.                                   |
| `estado/social.tsx`           | Contexto de amigos e invitaciones.                                   |
| `servicios/api.ts`            | Peticiones HTTP a la API y sus errores.                              |
| `servicios/audio.ts`          | Aviso sonoro de cuenta atrás.                                        |
| `servicios/musica.ts`         | Opciones musicales para configurar partidas.                         |

## Base de datos (`base-datos/`)

| Archivo                                  | Qué hace                                                                                            |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `esquema.sql`                            | Esquema completo con tablas y columnas en español.                                                  |
| `migraciones/002` a `010`                | Historial de cambios del esquema anterior (en inglés); solo se usan para actualizar bases antiguas. |
| `migraciones/011_nombres_en_espanol.sql` | Convierte una base del esquema anterior al esquema actual.                                          |

## Scripts (`scripts/`)

| Archivo                     | Qué hace                                                                                          |
| --------------------------- | ------------------------------------------------------------------------------------------------- |
| `aplicar-esquema.ts`        | Crea el esquema o convierte una base antigua (lo usan los dos siguientes).                        |
| `preparar-base-datos.ts`    | `pnpm bd:preparar`: esquema y catálogo inicial (o datos de prueba).                               |
| `migrar-local.ts`           | `pnpm bd:migrar`: actualiza el MySQL portátil con la cuenta administrativa.                       |
| `preparar-entorno-local.ts` | Prepara una instancia local nueva y sus credenciales.                                             |
| `iniciar-mysql-local.ps1`   | Inicia MySQL portátil sin instalar un servicio de Windows.                                        |
| `detener-mysql-local.ts`    | `pnpm mysql:detener`.                                                                             |
| `importar-listas.ts`        | `pnpm musica:importar`: importa al catálogo las listas de `base-datos/listas/`.                   |
| `leer-lista-spotify.ts`     | `pnpm musica:leer-spotify`: crea el archivo de una lista pública de Spotify (máx. 100 canciones). |
| `restablecer-contrasena.ts` | Recupera una cuenta desde la consola de administración.                                           |
| `probar-integracion.ts`     | `pnpm test:integracion`: pruebas contra una base MySQL aislada `_test`.                           |
| `desarrollo.ts`             | `pnpm dev`: cliente Vite y servidor con recarga.                                                  |
| `empaquetar-codigo.ps1`     | Genera un ZIP de entrega sin credenciales y lo verifica por SHA-256.                              |

## Pruebas (`pruebas/`)

`unitarias/` comprueba puntuación, reloj y reglas del catálogo sin base de datos. `integracion/` levanta la API contra MySQL real (`api`, `musica`, `social`).

## Nombres que se conservan en inglés

Se conservan porque los exige una herramienta, una librería o un servicio externo; cambiarlos rompería el proyecto o su instalación:

- Archivos de herramientas: `package.json`, `pnpm-lock.yaml`, `tsconfig.json`, `vite.config.ts`, `index.html`, `compose.yaml`, `.env`, `.gitignore`, `.prettierrc.json`, `README.md`, y las carpetas `src/`, `public/`, `node_modules/`, `dist/`.
- Los comandos estándar de pnpm: `dev`, `build`, `start`, `test`, `check`, `format`.
- Variables de entorno (`DB_HOST`, `DB_USER`, `PORT`, `NODE_ENV`…), porque las lee cada instalación desde su `.env`.
- Convenciones de React y Express: `children`, `className`, `onClick`, `key`, el prefijo `use` de los hooks, y los parámetros `req`/`res` de los manejadores.
- Opciones de librerías (`httpOnly`, `sameSite`, `connectionLimit`…) y los campos de la API de Deezer (`title_short`, `preview`, `nb_fan`…).
- Los nombres de iconos de `componentes/comunes.tsx` y las clases CSS de `estilos.css`, que enlazan con los recursos del diseño de Figma.
- La extensión `.test.ts`, que identifica los archivos de prueba.
- Los archivos de migración históricos `002`–`010`, que describen el esquema anterior tal como era.
