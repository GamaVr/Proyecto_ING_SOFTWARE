@echo off
rem Arranca el juego desde su carpeta, incluso al abrirlo haciendo doble clic.
setlocal
cd /d "%~dp0"
where node.exe >nul 2>nul
if errorlevel 1 (
  echo Instala Node.js LTS de 22.12 o superior y vuelve a abrir la terminal.
  goto :error
)
if not exist ".env" (
  echo Falta configurar .env. Sigue docs\INSTALAR-EN-LAPTOP.md.
  goto :error
)
if not exist "node_modules\tsx\dist\loader.mjs" (
  echo Faltan las dependencias. Sigue docs\INSTALAR-EN-LAPTOP.md.
  goto :error
)
rem Comprueba los tipos y genera los archivos actuales de la interfaz.
node node_modules\typescript\bin\tsc --noEmit
if errorlevel 1 goto :error
node node_modules\vite\bin\vite.js build
if errorlevel 1 goto :error
echo.
echo Abre http://127.0.0.1:3001 en el navegador. Manten esta ventana abierta.
echo MySQL debe estar iniciado y configurado en .env.
node --import tsx servidor/principal.ts
if errorlevel 1 goto :error
exit /b 0

:error
echo.
echo No se pudo iniciar el juego. Revisa el mensaje anterior y la guia de instalacion.
pause
exit /b 1
