# Canciones oficiales durante las partidas

## Repertorio

Los tres modos usan muestras de las **grabaciones originales del catálogo de Deezer**. Se consulta el perfil exacto de cada artista y se comprueba su identificador en cada canción; no se sustituye por un artista de tributos, covers o karaoke. Se prefieren versiones de estudio.

La configuración incluye nueve categorías: Rock, Pop, Hip hop / Rap, Electrónica, Latina, Reggae, R&B / Soul, Metal y Alternativa. Son categorías del juego asignadas al repertorio de artistas, no una clasificación automática de cada canción.

Entre los artistas preparados están **Linkin Park e Imagine Dragons (Rock), Deftones (Alternativa) y Katy Perry (Pop)**, además de Radiohead, Nirvana, Coldplay, Metallica, Lady Gaga, Dua Lipa, Eminem, Daft Punk, Shakira y muchos más. El repertorio concreto depende de las muestras disponibles en la región. Blues, Jazz y Country y sus canciones están retirados del catálogo jugable y de futuras sincronizaciones. Los conteos se calculan desde MySQL.

El catálogo objetivo reúne **35 artistas por cada uno de los nueve géneros y cinco canciones por artista: 315 artistas y 1.575 canciones**. Es una selección representativa de artistas conocidos, no una clasificación universal de fama. La [lista de artistas verificada](CATALOGO-ARTISTAS.md) y el [listado completo de canciones](catalogo-oficial.csv) documentan la carga comprobada.

La búsqueda compara el nombre exacto entre hasta cien perfiles y elige el de más seguidores para evitar homónimos. Se normalizan acentos y nombres estilizados como KoЯn. Cada resultado se valida por separado para que una coincidencia inválida no descarte el perfil correcto. Consulta hasta cien pistas populares del perfil, exige muestra disponible y coincidencia del intérprete, descarta versiones en vivo y remixes, elimina títulos duplicados y selecciona cinco por `rank` descendente de Deezer. Ese indicador aproxima la popularidad actual del proveedor, no necesariamente los mayores éxitos históricos.

Si un artista no ofrece cinco muestras, utiliza un suplente reconocido del mismo género. Solo publica cuando reúne exactamente 35 artistas distintos y 175 canciones en ese género. La publicación desactiva las selecciones anteriores del género y activa las cinco elegidas por artista dentro de una única transacción; conserva el historial. Si falta disponibilidad o falla la API, mantiene el repertorio anterior de ese género. Para refrescar los metadatos sin editar canciones en el código: Para refrescar los metadatos sin editar canciones en el código:

```powershell
pnpm music:sync
```

La configuración está en `server/catalogo-musical.ts`. MySQL conserva una huella de la selección en `music_catalog_sync`; una modificación del repertorio o el paso de doce horas provoca su actualización. Las actualizaciones automáticas se comparten y ocurren en segundo plano cuando ya hay canciones, para permitir seguir jugando. La primera instalación y `pnpm music:sync` esperan a completar la carga; esta operación puede tardar varios minutos. El comando informa de los géneros que no se completaron y termina con error en esos casos. Las canciones se obtienen de la API, no se escriben manualmente.

## Cómo suena

Deezer ofrece muestras de **hasta 30 segundos**, no archivos completos de las canciones. La ronda reproduce **12 segundos de esa muestra oficial**, con el mismo corte para todos sus participantes. No se generan melodías. No hay sección Música, biblioteca, cargas ni reproductor independiente.

MySQL almacena identificadores, título, artista, alias, género y fecha del álbum. Para ediciones remasterizadas o recopilaciones, la fecha del proveedor puede ser la de esa edición.

Solo se guarda la referencia estable `https://api.deezer.com/track/ID`, nunca una URL firmada de audio como referencia permanente. Al reproducir, el servidor consulta una muestra vigente, comprueba que siga siendo reproducible y transmite el MP3 sin guardarlo en disco. Los nombres se revelan al responder, con el enlace a la canción y las condiciones del proveedor.

## Acceso y errores

`GET /api/games/:id/audio` requiere sesión, pertenencia a la partida y estado activo. Respeta Range y valida HTTPS y los dominios del CDN de Deezer en cada redirección. La muestra sigue siendo un recurso del proveedor: este mecanismo no es DRM ni una autorización para descargar o distribuir un catálogo.

Se necesita Internet. Si Deezer bloquea una muestra o deja de ofrecerla, el juego informa del error y permite pasar la ronda. No recurre al catálogo anterior ni a una melodía sintetizada. Solo se muestran géneros con al menos cinco canciones; los filtros deben reunir tantas canciones como rondas elegidas.

El acceso público a metadatos y muestras fue comprobado sin clave privada. Esto no garantiza disponibilidad permanente ni acceso a canciones completas. La integración técnica no concede derechos sobre las grabaciones. Un proyecto universitario sin ingresos debe respetar igualmente las [condiciones de Deezer](https://developers.deezer.com/termsofuse); para usos fuera de su alcance es necesaria la autorización correspondiente.

## Actualización y pruebas

La migración `005_grabaciones_oficiales.sql` habilita `deezer`, conserva el historial y desactiva todas las fuentes anteriores, incluido Audius. La migración 004 también es compatible con el nuevo origen al repetir la instalación. La migración 006 desactiva Blues, Jazz y Country; conserva las respuestas históricas y cambia a Todas las salas pendientes que tenían una de esas categorías. Las consultas excluyen esas canciones incluso si una fila antigua vuelve a estar activa. La migración 007 incorpora las versiones y conteos de publicaciones completas del catálogo.

```powershell
pnpm exec tsx scripts/migrar-local.ts
pnpm music:sync
pnpm build
pnpm start
```

**Crea una partida nueva** después de actualizar: las partidas antiguas conservan sus canciones históricas y no se sustituyen mientras alguien juega.

Las pruebas unitarias verifican perfiles exactos, exclusión de tributos y pistas bloqueadas, títulos duplicados, CDN y renovación de enlaces. La integración comprueba selección en los tres modos, filtros, permisos, Range y ausencia de biblioteca con MySQL real y una frontera HTTP simulada. La comprobación del proveedor real verifica además muestras MP3 de los cuatro artistas solicitados y la decodificación del navegador en una base aislada.
