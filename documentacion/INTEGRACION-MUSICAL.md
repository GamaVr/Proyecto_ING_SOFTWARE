# Canciones del juego

## De dónde salen las canciones

El catálogo se arma con **listas de canciones** guardadas en `base-datos/listas/`, un archivo JSON por lista. Cada lista dice qué canciones quieres (título y artista) y en qué géneros se pueden repartir. La lista actual, `rock-metal.json`, viene de una lista pública de Spotify.

El audio no sale de Spotify sino de **Deezer**: para cada canción se busca la grabación original en Deezer y se guarda su referencia. Spotify solo se usa para saber qué canciones elegir.

Formato de una lista:

```json
{
  "nombre": "Rock/Metal",
  "fuente": "https://open.spotify.com/playlist/...",
  "generoPredeterminado": "Rock, Metal y Alternativa",
  "generosPermitidos": ["Rock, Metal y Alternativa"],
  "pistas": [{ "titulo": "Monster", "artista": "Skillet", "spotify": "2UREu1Y8CO4jXkbvqAtP7g" }]
}
```

Los géneros válidos están en `compartido/musica.ts` y son generales, para que ninguno quede casi vacío: Rock, Metal y Alternativa; Pop y Rap; Electrónica y Dubstep; Latina y Reggae; y Música mexicana. Blues, Jazz y Country están retirados. Un género aparece en el juego cuando tiene al menos cinco canciones.

## Importar o actualizar las listas

```powershell
pnpm musica:importar
```

`scripts/importar-listas.ts` lee todas las listas y, por cada canción (`servidor/servicios/musica/listas.ts` y `deezer.ts`):

1. Busca en Deezer el mismo artista principal y el mismo título. El título se compara sin sufijos de edición (" - Remastered 2023", " - From ... Soundtrack"), sin paréntesis, signos ni tildes.
2. Descarta versiones en vivo, remixes, acústicas, extendidas, instrumentales, karaoke, tributos y pistas sin muestra, salvo que el título de la lista pida esa versión; entre las coincidencias elige la más popular.
3. Consulta el álbum para obtener el año y su género en Deezer, y asigna el primer género del álbum que la lista permita (por ejemplo, Rock, Metal y Alternativo de Deezer van a "Rock, Metal y Alternativa", Pop, R&B y Rap a "Pop y Rap", y Electro y Dance a "Electrónica y Dubstep"). Si el álbum es una banda sonora o recopilación sin género útil, usa el género más frecuente entre los álbumes del artista; si tampoco hay, `generoPredeterminado`.
4. Guarda una sola vez las canciones repetidas y muestra al final las que no tienen equivalente en Deezer.

La importación **reemplaza el catálogo**: deja activas solo las canciones de las listas actuales y desactiva las demás sin borrar el historial de partidas. Para quitar canciones, bórralas de la lista y vuelve a importar. El servidor ya no descarga canciones por su cuenta.

Para agregar una lista pública de Spotify:

```powershell
pnpm musica:leer-spotify <enlace de la lista> <nombre-archivo>
pnpm musica:importar
```

El primer comando crea `base-datos/listas/<nombre-archivo>.json`. Spotify solo entrega las primeras 100 canciones de cada lista sin iniciar sesión; si la lista tiene más, las demás no se incluyen. También puedes escribir el archivo a mano con el mismo formato.

## Cómo suena

Deezer ofrece muestras de **hasta 30 segundos**, no las canciones completas. Cada ronda reproduce **12 segundos de esa muestra**, con el mismo corte para todos los participantes.

MySQL guarda identificadores, título, artista, alias, género y año del álbum. Solo se guarda la referencia estable `https://api.deezer.com/track/ID`, nunca una URL firmada de audio. Al reproducir, el servidor pide una muestra vigente, comprueba que siga disponible y transmite el MP3 sin guardarlo en disco. Título y artista se revelan al responder.

## Acceso y errores

`GET /api/partidas/:id/audio` requiere sesión, participar en la partida y que esté en curso. Respeta `Range` y valida HTTPS y los dominios del CDN de Deezer en cada redirección. No es un sistema DRM ni una autorización para descargar o distribuir canciones.

Se necesita Internet. Si Deezer deja de ofrecer una muestra, el juego avisa y permite pasar la ronda. El uso de Deezer debe respetar sus [condiciones](https://developers.deezer.com/termsofuse); un proyecto universitario sin ingresos no queda exento.

## Pruebas

Las pruebas unitarias comprueban la comparación de títulos, la búsqueda (mismo artista y título, sin versiones en vivo ni tributos), el reparto por género, las repetidas y las canciones no encontradas, además de la seguridad del audio. La integración importa una lista de prueba contra MySQL real con un Deezer simulado y verifica el catálogo en los tres modos.
