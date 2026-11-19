# API HTTP

Prefijo `/api`. JSON para entradas y salidas. Autenticación con la cookie HttpOnly `beat_sesion`. Los errores usan `{ "error": "mensaje" }`. Códigos: 401 sin sesión, 403 sin permiso, 404 inexistente, 409 conflicto, 422 entrada inválida, 429 límite de intentos, 502 fallo del proveedor de música y 503 MySQL no disponible.

Cada grupo de rutas vive en su propio módulo de `servidor/rutas/`; la lógica está en `servidor/servicios/`.

## Cuenta (`rutas/autenticacion.ts`, públicas)

| Método y ruta                        | Entrada o propósito                                                                                           |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| GET `/estado`                        | Disponibilidad y versión real de MySQL.                                                                       |
| POST `/autenticacion/registro`       | `nombre`, `correo`, `contrasena`, `codigoRecuperacion` (4+ dígitos). Crea la sesión.                          |
| POST `/autenticacion/iniciar-sesion` | `correo`, `contrasena`, `recordar` opcional (30 días).                                                        |
| POST `/autenticacion/recuperar`      | `correo`, `codigoRecuperacion`, `contrasena` nueva. Máx. 5 fallos por cuenta y 5 solicitudes por IP por hora. |
| POST `/autenticacion/cerrar-sesion`  | Revoca la sesión actual.                                                                                      |

## Perfil (`rutas/perfil.ts`)

| Método y ruta                     | Entrada o propósito                                                      |
| --------------------------------- | ------------------------------------------------------------------------ |
| GET `/perfil`                     | `usuario` y `estadisticas` (`jugadas`, `mejorRacha`, `mejorPuntuacion`). |
| PUT `/perfil`                     | Cambia `nombre`.                                                         |
| PUT `/perfil/contrasena`          | `contrasenaActual`, `contrasenaNueva`; revoca las demás sesiones.        |
| PUT `/perfil/codigo-recuperacion` | `contrasenaActual`, `codigoRecuperacion` nuevo.                          |
| GET/PUT `/preferencias`           | Preferencias de audio y accesibilidad (ver abajo).                       |

## Partidas (`rutas/partidas.ts`)

| Método y ruta                  | Entrada o propósito                                                  |
| ------------------------------ | -------------------------------------------------------------------- |
| POST `/partidas`               | Crea una partida individual con una `ConfiguracionPartida`.          |
| GET `/partidas/:id`            | Estado autorizado de la partida (`EstadoPartida`).                   |
| GET `/partidas/:id/audio`      | Muestra oficial de la ronda actual, sin nombre de canción en la URL. |
| POST `/partidas/:id/respuesta` | `respuesta`, `ronda`; acepta una sola respuesta por ronda.           |
| POST `/partidas/:id/siguiente` | `ronda`; avanza una partida individual.                              |
| POST `/partidas/:id/abandonar` | Cancela una partida en curso.                                        |

## Salas (`rutas/salas.ts`)

| Método y ruta                  | Entrada o propósito                                               |
| ------------------------------ | ----------------------------------------------------------------- |
| POST `/salas`                  | `nombre`, `modo` (`duelo` o `equipos`) y `configuracion`.         |
| POST `/salas/unirse`           | `codigo`; entra a una sala.                                       |
| GET `/salas/:codigo`           | Sala, jugadores y últimos 50 mensajes.                            |
| PATCH `/salas/:codigo/jugador` | `accion: "listo"` con `listo`, o `accion: "equipo"` para cambiar. |
| POST `/salas/:codigo/iniciar`  | Solo el anfitrión; exige capacidad completa y confirmaciones.     |
| POST `/salas/:codigo/mensajes` | `texto`, máximo 300 caracteres.                                   |
| POST `/salas/:codigo/salir`    | Sale; transfiere el anfitrión o elimina la sala vacía.            |

## Amigos e invitaciones (`rutas/social.ts`)

| Método y ruta                      | Entrada o propósito                                                        |
| ---------------------------------- | -------------------------------------------------------------------------- |
| GET `/social`                      | Amigos, solicitudes e invitaciones vigentes recibidas y enviadas.          |
| GET `/usuarios/buscar?q=texto`     | Busca por nombre o correo exacto; solo perfiles públicos, máximo 20.       |
| POST `/amigos`                     | `usuarioId`; envía una solicitud de amistad.                               |
| POST `/amigos/:usuarioId/aceptar`  | Acepta una solicitud recibida de ese usuario.                              |
| DELETE `/amigos/:usuarioId`        | Rechaza, cancela o retira la relación.                                     |
| POST `/salas/:codigo/invitaciones` | `usuarioId`; invita a un amigo a la sala, con vigencia de 15 minutos.      |
| POST `/invitaciones/:id/responder` | `aceptar: true` para entrar o `false` para rechazar; solo el destinatario. |

Entrar a una sala no inicia la partida: todos confirman y el anfitrión la inicia.

## Música (`rutas/musica.ts`)

| Método y ruta                  | Entrada o propósito                                                              |
| ------------------------------ | -------------------------------------------------------------------------------- |
| GET `/musica/opciones`         | `generos` (`nombre`, `cantidad`, `artistas`), `total` de canciones y `artistas`. |
| GET `/musica/buscar?q=texto`   | Hasta 12 canciones del catálogo por título o artista.                            |
| GET `/musica/buscar/:id/audio` | Muestra oficial de una canción del catálogo.                                     |

## Formatos

Configuración de partida y sala:

```json
{ "genero": "Todas", "rondas": 10, "segundos": 20, "modoRespuesta": "ambos" }
```

`genero`: `Todas` o un género activo (consulta `/musica/opciones`). `rondas`: 5, 8 o 10. `segundos`: 20 o 30. `modoRespuesta`: `ambos` (canción o artista) o `titulo`.

Preferencias: `volumen`, `musica`, `efectos` (0–100), `cuentaRegresiva`, `reproduccionAutomatica`, `altoContraste`, `interfazGrande` (booleanos).

Valores de estado: partida `en_curso`, `terminada` o `abandonada`; modo `individual`, `duelo` o `equipos`. Los contratos completos están en `compartido/tipos.ts` y `compartido/musica.ts`.

## Audio de las rondas

`GET /partidas/:id/audio` exige participar en una partida en curso y transmite el MP3 del proveedor con soporte de `Range`. Valida el identificador devuelto por Deezer y cada destino HTTPS de las redirecciones. El cliente recibe `inicioAudio`, `duracionAudio` y `fuenteAudio` para reproducir el mismo corte de 12 segundos en los tres modos. Títulos, artistas y créditos solo aparecen en respuestas reveladas y resultados. Consulta [Audio de juego](INTEGRACION-MUSICAL.md).

## Tiempo real (Socket.IO, `servidor/tiempo-real.ts`)

La conexión usa la misma cookie. El cliente emite `suscribir` con `sala:<código>` o `partida:<uuid>`; el servidor comprueba la participación antes de aceptar y responde `error-suscripcion` si no corresponde. Cada conexión conserva el canal personal `usuario:<su uuid>` para avisos de amigos e invitaciones; no se puede escuchar el canal de otra persona. El evento `actualizar` indica que el cliente debe volver a pedir el recurso por HTTP. No se aceptan respuestas de juego ni comandos por socket.
