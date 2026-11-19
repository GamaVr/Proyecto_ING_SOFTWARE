# Arquitectura y reglas

## Flujo de datos

El navegador consume `/api`. Durante el desarrollo Vite reenvía `/api` y `/socket.io` a Express; en la compilación final Express también sirve `dist/`. Usuarios, sesiones, preferencias, partidas, respuestas, salas, amistades, invitaciones y mensajes se guardan en MySQL.

Las páginas usan rutas hash, por ejemplo `#/partida/<uuid>` y `#/sala/<código>`. Un enlace de invitación conserva su destino cuando hay que iniciar sesión.

Socket.IO solo avisa que un recurso cambió; no transmite el contenido de una partida. Cada usuario vuelve a pedir su estado autorizado por HTTP. Un sondeo de respaldo recupera los cambios tras una desconexión.

## Capas del servidor

```
servidor/
  principal.ts         Punto de entrada: HTTP, tiempo real y carga inicial del catálogo.
  aplicacion.ts        Middleware de seguridad, montaje de las rutas y errores públicos.
  tiempo-real.ts       Socket.IO (canales y permisos) y reloj de las partidas multijugador.
  configuracion.ts     Variables de entorno validadas y orígenes permitidos.
  errores.ts           ErrorHttp: errores con un código HTTP seguro de mostrar.
  validacion.ts        Esquemas Zod de las entradas.
  datos/base-datos.ts  Conexiones MySQL, consultas parametrizadas y transacciones.
  rutas/               Un enrutador por área: autenticacion, perfil, partidas, salas, social, musica.
  servicios/           Reglas del dominio, independientes de HTTP:
    sesiones.ts          Cookies, hash de tokens y exigirUsuario.
    partidas.ts          Rondas, respuestas, resultados y estadísticas.
    salas.ts             Capacidad, equipos, anfitrión, confirmaciones y chat.
    social.ts            Búsqueda, amistades e invitaciones.
    puntuacion.ts        Normalización de respuestas y cálculo de puntos.
    musica/deezer.ts     Cliente de Deezer y transmisión de muestras.
    musica/catalogo.ts   Guardado de canciones y géneros disponibles.
    musica/listas.ts     Importación de listas de canciones al catálogo.
compartido/            Tipos y funciones que usan el cliente y el servidor.
src/
  paginas/             Una pantalla por archivo.
  componentes/         Controles visuales comunes y sincronización en vivo.
  estado/              Contextos de React (sesión, amigos).
  servicios/           Cliente HTTP, audio y opciones de música.
```

Las rutas solo validan la entrada, llaman a un servicio y responden; los servicios no conocen Express. Así cada regla del juego se puede probar sin levantar el servidor.

## Seguridad y consistencia

- bcrypt genera los hashes de contraseñas y códigos de recuperación; se rechazan entradas mayores a 72 bytes.
- La cookie de sesión es aleatoria y HttpOnly. MySQL guarda solo su SHA-256 y su vencimiento.
- La cookie usa SameSite=Lax y Secure en producción. Las escrituras verifican el encabezado Origin.
- La recuperación admite 5 solicitudes por IP y 5 fallos por cuenta cada hora.
- Zod limita tipos, tamaños, configuraciones y códigos. Todas las consultas usan parámetros.
- Cada lectura y escritura de una partida exige participar en ella; el audio también pasa por esa autorización.
- La API no entrega identificadores ni títulos de rondas futuras. Las respuestas ajenas de la ronda activa permanecen ocultas.
- Un bloqueo `FOR UPDATE` y la clave primaria de `respuestas` impiden puntuar dos veces. La ronda se vuelve a comprobar dentro del bloqueo para rechazar solicitudes tardías.
- El reloj, la corrección y la puntuación se calculan en el servidor; nunca se acepta un marcador del navegador.
- El chat se muestra como texto con React; nunca se interpreta como HTML.
- Los secretos, los ejecutables locales y los datos de MySQL están fuera de Git.

## Juego

Una partida guarda su configuración y una selección aleatoria de canciones sin repetir. Cada ronda empieza tras 1,5 s de preparación. Cada jugador envía una sola respuesta por ronda. Se aceptan el título y sus alias exactos normalizados y, si la configuración lo permite, el artista. Se ignoran mayúsculas, tildes y puntuación, pero no se aceptan fragmentos del título.

Una respuesta correcta a tiempo vale `500 + 500 × fracción de tiempo restante`, redondeado (entre 500 y 1000 puntos). Una respuesta incorrecta o tardía vale 0.

Individual: la siguiente ronda empieza al pulsar el botón. Multijugador: el servidor espera todas las respuestas o el fin del tiempo, deja 2,2 s de transición y avanza solo; quien no respondió recibe 0. Abandonar cancela la partida para todos.

Al terminar, el servidor conserva resultados y puntuaciones. Los equipos suman los puntos de sus integrantes. Las estadísticas personales muestran partidas completadas, mejor racha y mejor puntuación.

El contador personal usa `compartido/reloj-partida.ts`: al responder conserva el tiempo restante calculado con `transcurrido_ms`, que guarda el servidor. En multijugador la respuesta de otra persona no detiene tu reloj.

## Grabaciones oficiales

El catálogo sale de las listas de `base-datos/listas/` (por ejemplo, una lista de Spotify). `servicios/musica/listas.ts` busca cada canción en Deezer con `servicios/musica/deezer.ts` (mismo artista y título, sin versiones en vivo, remixes ni tributos, con muestra disponible) y la guarda en el género que Deezer asigna a su álbum, dentro de los que permite la lista. `pnpm musica:importar` reemplaza el catálogo en una transacción: las canciones que ya no están en ninguna lista quedan desactivadas sin borrar el historial. Las solicitudes a Deezer se separan al menos 140 ms y tienen tiempo límite. El servidor no descarga canciones por su cuenta.

Los tres modos usan solo `medios_cancion.fuente = 'deezer'` activas. La URL firmada de cada muestra se resuelve al reproducir la ronda; los MP3 no se guardan en disco. El navegador reproduce 12 segundos de una muestra de hasta 30. No es un sistema DRM: quien tenga herramientas de desarrollo puede capturar un audio que ya recibió. Consulta [audio y condiciones](INTEGRACION-MUSICAL.md).

## Relaciones sociales

Consulta [Amigos e invitaciones](SOCIAL.md). Una relación canónica por par (`usuario_menor`, `usuario_mayor`) evita solicitudes duplicadas. Aceptar una invitación usa el mismo bloqueo de capacidad que unirse a la sala. Los modos privados requieren la confirmación de todos y el inicio explícito del anfitrión.

## Base de datos

`base-datos/esquema.sql` describe el esquema completo con nombres en español. `scripts/aplicar-esquema.ts` lo aplica; si encuentra una base del esquema anterior en inglés, ejecuta antes las migraciones históricas y `011_nombres_en_espanol.sql`, y traduce las claves de los JSON guardados. Consulta [MySQL](MYSQL.md).
