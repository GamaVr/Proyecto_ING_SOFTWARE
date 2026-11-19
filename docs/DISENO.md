# Implementación del diseño

Referencia: archivo Figma `c4bZAKu5L1sIpvnPZWrCNm`, página `0:1`, Guess The Beat.

Se recuperó el contexto detallado de diez pantallas: inicio de sesión, menú principal, configuración individual, partida individual, opciones, búsqueda de duelo, duelo en directo, victoria, lobby y equipo campeón. El plan de Figma alcanzó su límite al pedir las otras cuatro vistas. Registro, configuración de equipos y las variantes de resultado se compusieron con los componentes, estilos y jerarquías ya recuperados del mismo archivo; esas cuatro vistas no se verificaron con contexto detallado independiente.

Los SVG originales utilizados están en `public/assets/figma/`. Sus referencias se encuentran en `src/componentes.tsx` y en el icono de `index.html`. Los recursos sin uso y los manifiestos temporales de descarga se retiraron durante la limpieza. El código no usa capturas de pantalla como interfaz ni URLs temporales de Figma para renderizar recursos. Las fuentes Inter y Space Grotesk se empaquetan localmente mediante Fontsource.

## Adaptaciones funcionales

- Los nombres, resultados, mensajes y puntuaciones provienen de usuarios y partidas reales.
- Se eliminaron los marcadores ficticios de ejemplo; una cuenta nueva empieza con cero partidas y estadísticas personales vacías.
- Las partidas utilizan grabaciones oficiales de Deezer. No hay biblioteca ni reproductor externo a las partidas; los géneros reales aparecen al configurar sesiones y salas.
- Duelo y equipos comparten un flujo de salas privadas con confirmación y comienzo del anfitrión.
- Amigos permite buscar usuarios, confirmar solicitudes y recibir invitaciones a ambos modos.
- El estado de disponibilidad de una sala depende de la confirmación del jugador, no de actividad simulada.
- Los controles utilizan botones, etiquetas, formularios, progreso ARIA y estados de error, carga y vacío.
- Las retículas se adaptan a 1.250, 1.000, 760 y 480 píxeles. En móvil se reorganizan las tarjetas y la navegación.

Se revisaron visualmente en el navegador el acceso, registro, menú, partida, resultados y duelo. También se verificó el menú a 390 píxeles de ancho y el guardado de opciones desde esa vista móvil. La reproducción real se comprobó mediante el avance de audio y la evaluación de respuestas. La comprobación de tipos y las pruebas de dominio/API complementan esa revisión; no sustituyen una auditoría de accesibilidad o una certificación de seguridad.
