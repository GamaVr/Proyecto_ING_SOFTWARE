# Arquitectura y reglas

## Flujo de datos

El navegador consume `/api`. Vite reenvía esa ruta y `/socket.io` a Express durante desarrollo; en la compilación final Express sirve también `dist/`. Toda persistencia de usuarios, sesiones, preferencias, respuestas, salas, amistades, invitaciones y mensajes utiliza MySQL.

Las páginas se identifican mediante rutas hash, por ejemplo `#/partida/<uuid>` y `#/sala/<código>`. Un enlace de invitación conserva su destino cuando es necesario iniciar sesión.

Socket.IO anuncia que un recurso cambió; no transmite indiscriminadamente el contenido de una partida. Cada usuario recupera su estado autorizado por HTTP. El sondeo de respaldo permite recuperar actualizaciones tras una desconexión.

## Responsabilidades

| Archivo                   | Responsabilidad                                                    |
| ------------------------- | ------------------------------------------------------------------ |
| `server/aplicacion.ts`    | Rutas HTTP, validación, límites de solicitudes y errores públicos. |
| `server/autenticacion.ts` | Cookies de sesión, hash de tokens y autorización.                  |
| `server/base-datos.ts`    | Pool, consultas parametrizadas y transacciones.                    |
| `server/partidas.ts`      | Rondas, respuestas, pistas, resultados y estadísticas.             |
| `server/salas.ts`         | Capacidad, equipos, anfitrión, confirmaciones y chat.              |
| `server/social.ts`        | Búsqueda de usuarios, amistades e invitaciones autorizadas.        |
| `server/puntuacion.ts`    | Funciones de dominio independientes para respuestas y puntos.      |
| `server/servidor.ts`      | HTTP, suscripciones de sockets y reloj multijugador.               |
| `src/componentes.tsx`     | Controles visuales, sincronización y operaciones asíncronas.       |
| `src/audio.ts`            | Cuenta atrás sonora.                                               |

## Seguridad y consistencia

- bcrypt genera hashes de contraseñas; se rechazan entradas que excedan sus 72 bytes efectivos.
- El navegador recibe una cookie aleatoria HttpOnly. MySQL conserva solo su SHA-256 y vencimiento.
- La cookie usa SameSite=Lax y Secure en producción. Las escrituras del navegador verifican el origen.
- Zod limita tipos, tamaños, configuraciones y códigos. Las consultas usan parámetros.
- Cada lectura y escritura de partida exige pertenencia. El audio también pasa por autorización.
- La API no entrega identificadores ni títulos de rondas futuras. Las respuestas ajenas de la ronda activa permanecen ocultas.
- Un bloqueo `FOR UPDATE` y la clave primaria de respuestas impiden puntuar dos veces. El índice de ronda se vuelve a comprobar dentro del bloqueo para rechazar solicitudes tardías.
- El reloj, la corrección y las puntuaciones se calculan en el servidor. No se acepta un marcador enviado por el navegador.
- El chat se representa como texto mediante React; nunca se interpreta como HTML.
- Los secretos, ejecutables locales y datos de MySQL están fuera de Git.

## Juego

Una partida conserva su configuración y una selección aleatoria sin repetición. La primera ronda dispone de 1,5 segundos de preparación. Cada jugador envía una sola respuesta por ronda. Se permiten título y alias exactos normalizados; opcionalmente se acepta el compositor. Se ignoran mayúsculas, tildes y puntuación, pero no se aceptan fragmentos del título.

Una respuesta correcta a tiempo recibe `(500 + 500 × fracción de tiempo restante) × multiplicador × penalización de pistas`, redondeada. El bonus de velocidad añade 0,20; no repetir audio añade 0,35. Cada pista usada reduce 0,15 la puntuación, hasta un mínimo de 0,50. Hay dos pistas por jugador y partida.

Individual: la siguiente ronda comienza al pulsar el botón. Multijugador: el servidor espera las respuestas o el límite de tiempo, muestra 2,2 segundos de transición y avanza automáticamente. Los ausentes reciben cero en esa ronda. La siguiente ronda concede nuevamente 1,5 segundos de preparación. Si se abandona una partida se cancela para todos.

Al completar una partida, el servidor conserva el resultado y las puntuaciones. Los equipos suman los puntos de sus integrantes. Las estadísticas personales muestran partidas completadas, mejor racha y récord.

## Alcance operativo

La reproducción no es un sistema DRM. Una persona con herramientas de desarrollo puede capturar un audio que ya recibió. Las salas privadas no simulan usuarios conectados ni rivales. Una reconexión recupera el estado de MySQL por su enlace mientras siga existiendo la sala o partida.

## Grabaciones oficiales

`server/musica.ts` consulta la API pública de Deezer. Verifica perfiles exactos, identificadores del artista, muestras reproducibles y títulos únicos. `server/catalogo-musical.ts` define 35 artistas principales por cada uno de los nueve géneros y suplentes para perfiles sin cinco muestras disponibles. Se elige el perfil exacto con más seguidores para evitar homónimos y se validan por separado los resultados de búsqueda. Las cinco canciones se obtienen de las cien pistas populares del artista, ordenadas por `rank`, excluyendo versiones y duplicados. El objetivo verificado es 315 artistas distintos y 1.575 canciones. Las solicitudes reales se separan al menos 140 ms y tienen tiempo límite. Tres géneros pueden prepararse simultáneamente.

MySQL guarda referencias estables y `music_catalog_sync` conserva una huella de la configuración, fecha y conteos por género. Una transacción publica únicamente lotes completos de 35 artistas y 175 canciones; desactiva las selecciones anteriores conservando el historial. Las publicaciones recientes se reutilizan doce horas incluso tras reiniciar. Las sincronizaciones comparten promesas por género y un coordinador para todo el catálogo; los fallos esperan un minuto antes de reintentar. Las actualizaciones automáticas permiten usar el catálogo publicado mientras se preparan en segundo plano. La primera carga espera a disponer de música. `pnpm music:sync` fuerza una actualización y señala los géneros incompletos.

Los tres modos seleccionan exclusivamente `song_media.source='deezer'` activo. La migración 005 desactiva las fuentes anteriores y conserva usuarios e historial. Las URL firmadas de las muestras se resuelven al reproducir cada ronda, sin persistir ni descargar los MP3 en disco.

La ruta de audio comprueba sesión, membresía y estado. Valida el identificador devuelto por Deezer y cada destino HTTPS del CDN, y transmite respuestas Range. El navegador reproduce doce segundos de la muestra oficial de hasta treinta segundos. No es reproducción de canciones completas ni un sistema DRM.

No hay biblioteca, reproductor independiente, cargas, CSV ni permisos de administrador musical. Los géneros disponibles se obtienen de MySQL y aparecen al crear partidas y salas. Los créditos se revelan junto a la respuesta. Consulta [audio y condiciones](INTEGRACION-MUSICAL.md).

## Relaciones sociales

Consulta [Amigos e invitaciones](SOCIAL.md). Una relación canónica por par evita solicitudes duplicadas. La aceptación de una invitación utiliza el bloqueo de capacidad de la sala. Su identificador se conserva internamente para las rutas y la API; la interfaz no muestra códigos ni entrada manual. Los dos modos privados requieren confirmación de todos y comienzo explícito del anfitrión. El canal personal del usuario se conserva al cambiar su suscripción de sala o partida.

El contador personal usa `shared/reloj-partida.ts`: después de responder conserva el tiempo restante calculado con `elapsed_ms` persistido por el servidor. Recargar no reanuda ese contador; una nueva ronda sí. En multijugador la respuesta de otro participante no detiene tu reloj. La pantalla de resultados conserva las acciones de volver a jugar e inicio, sin compartir resultados.
