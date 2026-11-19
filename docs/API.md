# API HTTP

Prefijo `/api`. JSON para entradas y salidas. Autenticación con cookie `beat_session`. Las respuestas de error usan `{ "error": "mensaje" }`. Códigos: 401 sin sesión, 403 sin permiso, 404 inexistente, 409 conflicto, 422 entrada inválida, 429 límite y 503 MySQL indisponible.

| Método y ruta                | Entrada o propósito                                                         |
| ---------------------------- | --------------------------------------------------------------------------- |
| GET `/health`                | Disponibilidad y versión real de MySQL.                                     |
| POST `/auth/register`        | `name`, `email`, `password`. Crea sesión.                                   |
| POST `/auth/login`           | `email`, `password`, `remember` opcional.                                   |
| POST `/auth/logout`          | Revoca la sesión actual.                                                    |
| GET `/me`                    | Perfil y estadísticas personales de partidas.                               |
| PUT `/me`                    | Actualiza `name`.                                                           |
| PUT `/me/password`           | `currentPassword`, `newPassword`; revoca sesiones anteriores.               |
| GET/PUT `/settings`          | Preferencias de audio y accesibilidad validadas.                            |
| POST `/games`                | Crea una partida individual con `GameConfig`.                               |
| GET `/games/:id`             | Estado autorizado de la partida.                                            |
| GET `/games/:id/audio`       | Grabación real privada de la ronda actual, sin nombre de canción en la URL. |
| POST `/games/:id/answer`     | `answer`, `round`; valida una respuesta única.                              |
| POST `/games/:id/next`       | `round`; avanza una partida individual.                                     |
| POST `/games/:id/abandon`    | Cancela una partida que aún está en juego.                                  |
| POST `/rooms`                | `name`, `mode` y `config`; crea sala privada.                               |
| POST `/rooms/join`           | `code`; entra a una sala.                                                   |
| GET `/rooms/:code`           | Sala, jugadores y últimos 50 mensajes.                                      |
| PATCH `/rooms/:code/player`  | `action: "ready"` con `ready`, o `action: "team"`.                          |
| POST `/rooms/:code/start`    | Solo anfitrión; capacidad y confirmaciones completas.                       |
| POST `/rooms/:code/messages` | `text`, máximo 300 caracteres.                                              |
| POST `/rooms/:code/leave`    | Sale y transfiere anfitrión o elimina la sala vacía.                        |

## Configuración

```json
{
  "genre": "Todas",
  "rounds": 10,
  "seconds": 20,
  "answerMode": "both",
}
```

Géneros: `Todas` o cualquier género activo del catálogo. Obtén las opciones con `/music/options`. Rondas: 5, 8, 10. Segundos: 20 o 30. Respuesta: `both` o `title`. Los contratos están en `shared/tipos.ts` y `shared/musica.ts`.

## Audio real de las partidas

GET `/music/options` devuelve `genres` (objetos `name`, `count`, `artists`), `total` de canciones y `artists` total. Los conteos numéricos se calculan con grabaciones Deezer activas. El repertorio objetivo contiene nueve géneros con 35 artistas y 175 canciones cada uno. No hay rutas de biblioteca, cargas, edición, configuración o vistas previas; esas rutas devuelven 404.

GET `/games/:id/audio` exige ser participante de una partida en curso y transmite MP3 del proveedor con soporte de Range. También valida los destinos HTTPS de todas las redirecciones. No sirve los antiguos WAV sintetizados. El cliente recibe `audioStart`, `audioDuration` y `audioSource` para reproducir el mismo corte de 12 segundos en los tres modos.

Los títulos, artista y enlaces de créditos aparecen solo en las respuestas reveladas y resultados. Una caída externa produce 502, o 503 si no hay catálogo. Nunca se sustituye una grabación por una melodía local. Consulta [Audio de juego](INTEGRACION-MUSICAL.md).

## Sockets

La conexión usa la misma cookie. El cliente envía `subscribe` con `room:<código>` o `game:<uuid>`. El servidor comprueba la membresía antes de suscribirlo. Cada conexión conserva además el canal personal `user:<su propio uuid>` para avisos de amigos e invitaciones; no se autoriza suscribirse al canal de otra persona. `refresh` señala que debe pedir de nuevo el recurso a la API. No se permiten respuestas de juego ni comandos de chat arbitrarios por socket.

## Amigos e invitaciones

| Método y ruta                   | Entrada o propósito                                                           |
| ------------------------------- | ----------------------------------------------------------------------------- |
| GET `/social`                   | Amigos, solicitudes propias e invitaciones vigentes recibidas y enviadas.     |
| GET `/users/search?q=texto`     | Busca por nombre o correo exacto; solo devuelve perfiles públicos, máximo 20. |
| POST `/friends`                 | `userId`; crea una solicitud de amistad.                                      |
| POST `/friends/:userId/accept`  | Acepta una solicitud recibida de ese usuario.                                 |
| DELETE `/friends/:userId`       | Rechaza, cancela o retira la propia relación.                                 |
| POST `/rooms/:code/invitations` | `userId`; invita a un amigo a la sala, con vigencia de 15 minutos.            |
| POST `/invitations/:id/respond` | `accept: true` para entrar o `false` para rechazar; solo destinatario.        |

Entrar a una sala de duelo no inicia la partida. Ambos modos utilizan confirmación y la ruta de comienzo del anfitrión.
