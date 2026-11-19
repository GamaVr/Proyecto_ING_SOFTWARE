# Guess The Beat

Juego web de reconocimiento musical en español basado en el [diseño de Figma](https://www.figma.com/design/c4bZAKu5L1sIpvnPZWrCNm/Guess-the-beat?node-id=0-1). Usa React, TypeScript, Express, Socket.IO y **MySQL 8.4**.

## Canciones reales dentro del juego

Individual, duelo 1 vs 1 y equipos 2 vs 2 utilizan **muestras de grabaciones oficiales de Deezer**, reproducidas en fragmentos de 12 segundos. El servidor obtiene los géneros y las referencias de las canciones automáticamente. No se necesita cargar archivos ni configurar una clave privada para el acceso público comprobado durante el desarrollo.

Los géneros consultados incluyen Rock, Pop, Hip hop/Rap, Electrónica, Latina, Reggae, R&B/Soul, Metal y Alternativa. Solo se muestran categorías con suficientes pistas reproducibles. Incluye Linkin Park, Deftones, Imagine Dragons, Katy Perry y muchos más. Cada género reúne **35 artistas con cinco canciones por artista: 315 artistas y 1.575 canciones** en la carga verificada. Las canciones se seleccionan por popularidad en Deezer; la lista de artistas es representativa. Blues, Jazz y Country están retirados. [Ver repertorio](docs/CATALOGO-ARTISTAS.md). Deezer ofrece muestras de hasta 30 segundos; el juego usa 12 segundos por ronda y requiere una partida nueva después de actualizar.

**No hay sección Música, biblioteca, reproductor independiente, cargas ni CSV.** Las melodías sintetizadas del catálogo anterior quedan excluidas de nuevas partidas y no se reproducen como respaldo. El audio requiere Internet. Consulta [la integración de audio](docs/INTEGRACION-MUSICAL.md).

## Funciones

- Registro e inicio de sesión con alias, correo y contraseña; el registro pide un código numérico de recuperación de al menos 4 dígitos. El correo identifica la cuenta, pero esta versión no lo verifica ni envía mensajes.
- Recuperación de contraseña con correo, código numérico y contraseña nueva. El hash del código se guarda en MySQL; la persona puede cambiarlo desde Opciones > Cuenta tras confirmar su contraseña actual.
- Partidas individuales de 5, 8 o 10 rondas con género y tiempo.
- Duelo y equipos mediante salas privadas e invitaciones entre amigos: todos confirman y el anfitrión inicia. Los códigos de sala no se muestran en la interfaz.
- Géneros visibles y seleccionables al crear salas.
- Amigos, solicitudes e invitaciones a los dos modos multijugador.
- Chat de sala, cambio de equipo y estadísticas personales.
- Contador detenido al responder y reiniciado en cada nueva ronda. Los resultados no incluyen una opción para compartir.
- Búsqueda en el campo de respuesta por título o artista, con coincidencias del catálogo cargado y controles para escuchar la muestra oficial antes de responder. El reloj de la ronda sigue avanzando durante la vista previa.
- Preferencias personales de audio y accesibilidad, guardadas en MySQL.
- Interfaz de tonos negros y verdes opacos, sin degradados.

## Ejecutar en esta computadora

La instalación preparada utiliza MySQL Community Server 8.4.6 portátil en `127.0.0.1:3307`, independiente de XAMPP. `.env` contiene una cuenta de aplicación con permisos CRUD. Los secretos y ejecutables están ignorados por Git.

```powershell
./scripts/iniciar-mysql-local.ps1
pnpm exec tsx scripts/migrar-local.ts
pnpm music:sync
pnpm build
pnpm start
```

Abre [http://127.0.0.1:3001](http://127.0.0.1:3001). El servidor prepara automáticamente el catálogo de grabaciones; la primera carga puede tardar varios minutos. Las actualizaciones posteriores reutilizan la versión publicada para poder seguir jugando. Para desarrollo usa `pnpm dev` y abre [http://127.0.0.1:5173](http://127.0.0.1:5173).

Si pnpm no está en PATH, la instalación de esta computadora tiene `C:\Users\xTale\.cache\codex-runtimes\codex-primary-runtime\dependencies\bin\fallback\pnpm.cmd`. También puedes usar npm y los scripts equivalentes.

## Instalar en otra computadora

Para Windows, sigue la [guía de instalación en una laptop](docs/INSTALAR-EN-LAPTOP.md). Incluye MySQL, comandos compatibles con PowerShell y el lanzador `iniciar-juego.cmd`.

Requisitos: Node.js 22.12+, pnpm o npm, MySQL 8.4 e Internet.

```powershell
pnpm install
Copy-Item .env.example .env
```

Configura MySQL según [docs/MYSQL.md](docs/MYSQL.md). Una cuenta de instalación ejecuta `pnpm db:setup` para crear el esquema y sincronizar referencias del proveedor; después configura una cuenta de aplicación con permisos limitados. No se utiliza SQLite ni almacenamiento simulado como sustituto de MySQL.

También se incluye `compose.yaml` con la imagen oficial `mysql:8.4`. Define sus contraseñas en tu entorno antes de `docker compose up -d mysql`.

## Verificación

```powershell
pnpm check
pnpm test
pnpm test:integration
pnpm format:check
pnpm build
```

Las pruebas de integración usan una base separada terminada en `_test`, registros propios y respuestas HTTP simuladas del proveedor. Las verificaciones manuales también deben reproducir audio real desde Deezer. No se muestran pistas ni resultados ficticios cuando falla el proveedor en la aplicación normal.

## Código y documentación

La [guía de archivos](docs/GUIA-ARCHIVOS.md) explica qué hace cada módulo, muestra los nombres anteriores y sus equivalentes en español, y señala los nombres que conservan las herramientas. El proyecto utiliza TypeScript: por ejemplo, `validation.ts` ahora es `validacion.ts`.

`src/` contiene las pantallas del juego y el reproductor de ronda; `server/` contiene autenticación, juego, salas, amigos e integración Deezer. `shared/` define los contratos, `database/` las tablas y migraciones, `scripts/` las herramientas de instalación y `tests/` las comprobaciones. Las funciones principales tienen comentarios en español.

Consulta [arquitectura](docs/ARQUITECTURA.md), [API](docs/API.md), [amigos](docs/SOCIAL.md) y [audio](docs/INTEGRACION-MUSICAL.md).

La [revisión de limpieza](docs/LIMPIEZA.md) detalla los archivos retirados y los componentes que se conservan por estar en uso. Para generar una entrega del código sin credenciales ni archivos temporales, ejecuta `./scripts/empaquetar-codigo.ps1` desde la raíz del proyecto.

## Despliegue

`pnpm build` genera el cliente y `pnpm start` sirve `dist/` y la API. Para un servidor público configura `NODE_ENV=production`, tu URL HTTPS en `APP_ORIGIN`, un proxy HTTPS y MySQL persistente. El reloj y los sockets actuales están diseñados para una instancia Node.js.

La aplicación está preparada y probada localmente. No se publica automáticamente en un proveedor externo. Deezer es un servicio externo cuya disponibilidad y [condiciones](https://developers.deezer.com/termsofuse) se deben respetar. La integración no concede derechos sobre las grabaciones; el carácter universitario y sin ingresos no sustituye los permisos necesarios.

Para una demostración breve, Cloudflare Quick Tunnel puede exponer temporalmente el servidor local en el puerto configurado. El túnel no es un despliegue permanente: la aplicación y MySQL deben permanecer activos y la URL temporal puede cambiar al reiniciar el túnel.
