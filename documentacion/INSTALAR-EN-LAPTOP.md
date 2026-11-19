# Instalar Guess The Beat en otra laptop Windows

La entrega contiene el código actualizado, las imágenes utilizadas, las migraciones de MySQL y las pruebas. Incluye el nombre de sala vacío y las invitaciones entre amigos sin códigos visibles.

No incluye las cuentas, partidas, contraseñas, ejecutables, dependencias ni la base de datos de la computadora original. La laptop tendrá sus propios usuarios. El catálogo y las muestras oficiales se obtienen desde Deezer; se necesita Internet y su disponibilidad depende del proveedor.

## 1. Instalar los requisitos

- [Node.js LTS](https://nodejs.org/en/download), de versión 22.12 o superior, incluyendo npm y la opción de añadirlo al PATH. Consulta las [instrucciones de npm para Windows](https://docs.npmjs.com/downloading-and-installing-node-js-and-npm/).
- **MySQL Community Server 8.4**, configurado como servicio de Windows en el puerto `3306`. Conserva la contraseña de `root`. Sigue la [guía oficial para Windows](https://dev.mysql.com/doc/refman/8.4/en/windows-installation.html). Si ya tienes MySQL, adapta el puerto y las credenciales.
- Visual Studio Code es opcional para ejecutar el juego; sirve para editarlo.

Cierra y vuelve a abrir Visual Studio Code después de instalar Node. En una terminal nueva comprueba:

```powershell
node --version
npm.cmd --version
```

Los comandos `npm.cmd` y `pnpm.cmd` funcionan en PowerShell sin modificar su política de ejecución de scripts.

## 2. Extraer e instalar las dependencias

Extrae todo el ZIP, por ejemplo en `C:\Proyectos\GuessTheBeat`. Abre esa carpeta en Visual Studio Code y una terminal dentro de ella. No ejecutes el proyecto dentro del ZIP.

```powershell
npm.cmd install --global pnpm@11.25.0
pnpm.cmd install --frozen-lockfile
Copy-Item .env.example .env
```

`pnpm-lock.yaml` fija las versiones utilizadas para verificar esta entrega. El último comando es para una instalación nueva: conserva tu `.env` si ya habías configurado el proyecto.

## 3. Preparar MySQL por primera vez

Con el servicio MySQL iniciado, configura temporalmente el administrador en `.env` para crear las tablas:

```dotenv
PORT=3001
HOST=127.0.0.1
APP_ORIGIN=http://localhost:5173
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=root
DB_PASSWORD="TU_CONTRASENA_DE_ROOT"
DB_NAME=guess_the_beat
NODE_ENV=development
```

Reemplaza la contraseña por la que elegiste al instalar MySQL. Ajusta `DB_PORT` si usaste otro puerto. Después ejecuta:

```powershell
npm.cmd run bd:preparar
```

El comando prepara el esquema y obtiene las referencias del catálogo oficial. La primera sincronización puede tardar varios minutos. Espera a que termine; si falla Deezer, revisa Internet y vuelve a ejecutarlo. No hace falta descargar archivos de canciones.

Antes de jugar, crea una cuenta limitada. Abre el cliente MySQL como `root`; esta es la ruta habitual, que debes adaptar si elegiste otra carpeta:

```powershell
& "C:\Program Files\MySQL\MySQL Server 8.4\bin\mysql.exe" -u root -p
```

Dentro del cliente, ejecuta este SQL sustituyendo la contraseña por una propia:

```sql
CREATE USER 'guess_app'@'127.0.0.1' IDENTIFIED BY 'TU_CLAVE_DE_APLICACION';
GRANT SELECT, INSERT, UPDATE, DELETE ON guess_the_beat.* TO 'guess_app'@'127.0.0.1';
```

Sal del cliente con `exit`. Cambia **solo estas dos variables** de `.env` y guarda:

```dotenv
DB_USER=guess_app
DB_PASSWORD="TU_CLAVE_DE_APLICACION"
```

Conserva la cuenta administrativa para futuras migraciones. La cuenta limitada no puede crear tablas. Los scripts de MySQL portátil y las credenciales `.runtime` de la computadora original no son necesarios para esta instalación con MySQL como servicio.

## 4. Abrir el juego

Con MySQL iniciado, haz doble clic en `iniciar-juego.cmd` o ejecútalo en la terminal:

```powershell
.\iniciar-juego.cmd
```

El lanzador comprueba TypeScript, compila la interfaz e inicia el servidor. Mantén la ventana abierta y entra en [http://127.0.0.1:3001](http://127.0.0.1:3001). Registra una cuenta nueva para esta instalación. Para detenerlo, pulsa `Ctrl + C` y confirma si Windows lo solicita.

También puedes usar los comandos separados:

```powershell
npm.cmd run build
npm.cmd start
```

Para editar y ver cambios automáticamente, detén el servidor anterior y ejecuta `npm.cmd run dev`; abre [http://127.0.0.1:5173](http://127.0.0.1:5173).

## 5. Comprobar la instalación

Abre [http://127.0.0.1:3001/api/estado](http://127.0.0.1:3001/api/estado): debe mostrar `estado: "ok"` y `baseDatos: "mysql"`. Después comprueba el registro, la creación de salas y el audio en una partida.

```powershell
npm.cmd run check
npm.cmd test
npm.cmd run format:check
```

Las pruebas de integración requieren una base separada terminada en `_test` y una cuenta preparada para ella. Consulta `scripts/probar-integracion.ts`; la preparación automática con `.runtime/mysql-admin.env` está reservada a la instancia portátil original.

## Problemas habituales

- **No reconoce node o npm:** instala Node con npm y PATH, y vuelve a abrir la terminal. Usa `npm.cmd` en PowerShell.
- **ECONNREFUSED o salud 503:** inicia MySQL y revisa el host y el puerto en `.env`.
- **Access denied:** comprueba la contraseña y el usuario MySQL para `127.0.0.1`.
- **No existe la base o una tabla:** prepara el esquema con el administrador como se indica arriba.
- **EADDRINUSE en 3001:** ya hay otro servidor en ese puerto; detén el anterior antes de iniciar otro.
- **No aparecen canciones:** revisa Internet y los mensajes de Deezer. Para forzar la sincronización usa `npm.cmd run musica:sincronizar` con la cuenta de aplicación.

## Jugar entre dispositivos

Todos deben entrar a la **misma instalación** y registrarse en ella para agregarse e invitarse desde Amigos. Dos instalaciones independientes tienen bases y salas distintas. Compartir un enlace público es una configuración posterior; Cloudflare y el túnel temporal original no se incluyen ni se activan automáticamente en la laptop.
