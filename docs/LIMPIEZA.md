# Limpieza del proyecto

Se revisaron los 45 archivos TypeScript de la aplicación y sus herramientas, los recursos gráficos, la documentación, las entregas anteriores y los archivos de trabajo.

## Retirado

- 39 SVG sin referencias, incluidos tres iconos que ya no se solicitaban. Se comprobaron también los nombres dinámicos de iconos activos, los fondos y el favicon.
- La función sin llamadas `closeDatabase`, su importación sobrante y cinco exportaciones que solo se utilizan dentro de sus propios módulos.
- El campo interno de archivo de audio local que no utiliza la transmisión desde Deezer.
- Dos manifiestos temporales de Figma.
- La copia extraída de la versión antigua del proyecto, con sus melodías sintetizadas.
- 8 entregas ZIP anteriores, reemplazadas por una única entrega actual.
- Las capturas y los scripts temporales de verificaciones anteriores, sus datos desechables y el instalador ZIP de MySQL ya extraído.

La lista de eliminación reúne 283 archivos y aproximadamente 283.3 MiB. El tamaño excluye los archivos compilados antiguos que Vite vuelve a generar y la nueva entrega.

## Conservado por uso

- Todos los módulos activos de la aplicación. La comprobación de TypeScript no encontró parámetros ni importaciones sin utilizar.
- Todas las dependencias declaradas: están utilizadas por la aplicación, las pruebas o las herramientas de construcción. No se modifican los archivos internos de `node_modules`.
- Las pruebas y utilidades de instalación, migración, recuperación de cuentas y sincronización musical. Que una utilidad se ejecute desde consola no la convierte en código huérfano.
- Las migraciones y los campos de MySQL necesarios para conservar y actualizar instalaciones anteriores.
- La base MySQL, sus binarios, la configuración y los archivos que utiliza la instancia local en ejecución.
- La documentación del código y el repertorio oficial de 315 artistas y 1.575 canciones.
- `dist/`, que se vuelve a generar y es necesario para que el servidor muestre la aplicación compilada.

## Entrega

En la revisión del 21 de octubre de 2026 se retiraron además la copia temporal de pruebas para laptop (5.541 archivos, unos 102 MB), sus dos registros y el ZIP anterior sustituido. Los 46 archivos TypeScript actuales siguen conectados a la aplicación, las herramientas o las pruebas; los 56 SVG conservados tienen referencias. No se eliminaron dependencias ni herramientas vigentes por el hecho de no formar parte de una pantalla.

`scripts/empaquetar-codigo.ps1` genera y verifica la entrega limpia desde la raíz del proyecto. No incluye credenciales, datos de MySQL, dependencias, capturas ni archivos temporales.
