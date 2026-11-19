# Genera una entrega limpia y verifica su contenido sin incluir datos privados.
param([string]$NombreArchivo = 'Guess_The_Beat_Codigo_Fuente_Limpio.zip')
$ErrorActionPreference = 'Stop'
$sourceRoot = Split-Path -Parent $PSScriptRoot
if ([System.IO.Path]::GetFileName($NombreArchivo) -ne $NombreArchivo -or $NombreArchivo -notmatch '\.zip$' -or $NombreArchivo.IndexOfAny([System.IO.Path]::GetInvalidFileNameChars()) -ge 0) { throw 'Indica solo un nombre de archivo ZIP, sin directorios.' }
$archivePath = Join-Path $sourceRoot $NombreArchivo
if (Test-Path -LiteralPath $archivePath) { throw 'El archivo de entrega ya existe; no se sobrescribe.' }
$rootFiles = @('.env.example', '.gitignore', '.prettierignore', '.prettierrc.json', 'README.md', 'iniciar-juego.cmd', 'compose.yaml', 'index.html', 'package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', 'tsconfig.json', 'vite.config.ts')
$sourceDirectories = @('database', 'docs', 'public', 'scripts', 'server', 'shared', 'src', 'tests')
$files = @($rootFiles | ForEach-Object { Get-Item -LiteralPath (Join-Path $sourceRoot $_) })
foreach ($directory in $sourceDirectories) { $files += @(Get-ChildItem -LiteralPath (Join-Path $sourceRoot $directory) -File -Recurse) }
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = [System.IO.Compression.ZipFile]::Open($archivePath, [System.IO.Compression.ZipArchiveMode]::Create)
try {
  foreach ($file in $files) {
    $relativePath = $file.FullName.Substring($sourceRoot.TrimEnd('\').Length + 1).Replace('\', '/')
    [void][System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, $file.FullName, $relativePath, [System.IO.Compression.CompressionLevel]::Optimal)
  }
} finally { $archive.Dispose() }
# Compara cada entrada con su archivo fuente y verifica que no se incluyan secretos ni dependencias.
$archive = [System.IO.Compression.ZipFile]::OpenRead($archivePath)
try {
  foreach ($entry in $archive.Entries) {
    if ($entry.FullName -match '(^|/)(\.env|\.runtime|node_modules|dist|test-results|\.git)(/|$)') { throw "Entrada no permitida: $($entry.FullName)" }
    $stream = $entry.Open()
    $hasher = [System.Security.Cryptography.SHA256]::Create()
    try { $archiveHash = [BitConverter]::ToString($hasher.ComputeHash($stream)).Replace('-', '') }
    finally { $hasher.Dispose(); $stream.Dispose() }
    $sourceHash = (Get-FileHash -LiteralPath (Join-Path $sourceRoot $entry.FullName) -Algorithm SHA256).Hash
    if ($archiveHash -ne $sourceHash) { throw "Contenido diferente: $($entry.FullName)" }
  }
  foreach ($required in @('server/musica.ts','shared/musica.ts','src/musica.ts','tests/integration/musica.test.ts','docs/INTEGRACION-MUSICAL.md','database/migrations/004_grabaciones_reales.sql','database/migrations/005_grabaciones_oficiales.sql','scripts/sincronizar-musica.ts','database/migrations/006_retirar_generos.sql','shared/reloj-partida.ts','tests/reloj-partida.test.ts','database/migrations/007_sincronizacion_catalogo.sql','server/catalogo-musical.ts','docs/CATALOGO-ARTISTAS.md','docs/catalogo-oficial.csv','docs/GUIA-ARCHIVOS.md','server/validacion.ts','server/servidor.ts','src/Aplicacion.tsx','src/principal.tsx')) {
    if (-not $archive.GetEntry($required)) { throw "Falta $required" }
  }
  foreach ($retired in @('server/matchmaking.ts','src/pages/Duel.tsx','src/pages/Music.tsx','src/music.css','server/catalog.ts','public/plantilla-musica.csv','scripts/music-admin.ts')) {
    if ($archive.GetEntry($retired)) { throw "Archivo retirado presente: $retired" }
  }
  foreach ($required in @('iniciar-juego.cmd','docs/INSTALAR-EN-LAPTOP.md')) {
    if (-not $archive.GetEntry($required)) { throw "Falta $required" }
  }
  [PSCustomObject]@{ Archivo=$archivePath; Archivos=$archive.Entries.Count; Bytes=(Get-Item -LiteralPath $archivePath).Length; Validacion='Todas las entradas coinciden con el codigo fuente por SHA-256' } | ConvertTo-Json
} finally { $archive.Dispose() }





