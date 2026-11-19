# Amigos e invitaciones

## Agregar usuarios

En **Amigos**, busca el nombre del jugador o su correo completo y pulsa **Agregar**. La otra persona recibirá una solicitud en esa misma sección. Cuando la acepte, aparecerán en la lista de amigos de ambos. También puedes rechazar solicitudes recibidas, cancelar las enviadas o retirar una amistad.

Los resultados muestran únicamente el nombre y un identificador corto; no publican correos de otras cuentas. Las personas deben estar registradas en la misma instalación de Guess The Beat.

## Invitar a jugar

- Desde la lista de amigos, elige **Invitar a duelo 1 vs 1** o **Invitar a equipos 2 vs 2**. Se creará una sala y se enviará la invitación dentro de la aplicación.
- Desde una sala existente, usa **Invitar amigos**, selecciona a alguien y pulsa **Enviar invitación**. Los demás integrantes también pueden invitar a sus amigos mientras queden lugares.
- El destinatario verá la invitación en **Amigos → Invitaciones recibidas**, incluso si se encontraba en otra pantalla. El contador de Amigos señala invitaciones y solicitudes pendientes.
- Al aceptar, la persona entra a la sala. Ambos modos requieren que todos pulsen **Estoy listo** y que el anfitrión pulse **Empezar partida**. El duelo admite dos personas; equipos admite cuatro, distribuidas dos por lado.

La interfaz permite entrar a salas mediante las invitaciones de Amigos, sin mostrar códigos ni ofrecer entrada manual o copia de enlaces. El identificador interno se conserva para las rutas, la API y las notificaciones de la sala. Las invitaciones no reservan lugares: si la sala se completa antes de aceptar, se informa de ello y no se añade otro jugador.

## Persistencia y permisos

Las amistades, solicitudes e invitaciones se guardan en MySQL. Las invitaciones duran **15 minutos**; se ocultan al caducar, responderlas, desaparecer la sala o comenzar la partida. Para reenviar una invitación caducada o rechazada se genera un identificador nuevo. Retirar una amistad invalida las invitaciones pendientes entre esas dos personas.

Solo el destinatario puede aceptar una solicitud de amistad o responder una invitación. No se permite invitarse a uno mismo, invitar sin amistad aceptada, enviar desde una sala ajena ni duplicar invitaciones vigentes. La aceptación bloquea la sala en una transacción, por lo que varias aceptaciones simultáneas respetan su capacidad.

Socket.IO avisa por un canal personal autenticado. Ese canal permanece activo al abrir salas y partidas; el sondeo HTTP permite recuperar notificaciones tras una desconexión. No se envían correos ni mensajes a servicios externos.

## Actualizar una instalación anterior

Con una cuenta de instalación, aplica `database/esquema.sql` y después `database/migrations/002_amigos_y_salas.sql`. En la instancia portátil preparada en esta computadora basta con:

```powershell
pnpm exec tsx scripts/migrar-local.ts
pnpm build
pnpm start
```

La migración conserva perfiles, sesiones, preferencias, canciones, partidas y puntuaciones. Elimina exclusivamente las tablas de las funciones retiradas y crea las relaciones sociales mediante el esquema actualizado.

Para jugar desde otros dispositivos, todos deben acceder a la misma instalación disponible en su red o en un servidor publicado. El arranque local por defecto escucha únicamente en esta computadora.
