# Inicia la distribución portátil local sin instalar servicios de Windows ni tocar XAMPP.
$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path -Parent $PSScriptRoot
$taskRuntime = Join-Path $taskRoot '.runtime'
$taskMysql = Join-Path $taskRuntime 'mysql-8.4.6-winx64'
$taskData = Join-Path $taskRuntime 'mysql-data'
if (-not (Test-Path -LiteralPath (Join-Path $taskMysql 'bin/mysqld.exe'))) {
  if (-not (Test-Path -LiteralPath (Join-Path $taskRuntime 'mysql.zip'))) { throw 'Descarga mysql-8.4.6-winx64.zip de dev.mysql.com en .runtime/mysql.zip o usa Docker según README.md.' }
  Expand-Archive -LiteralPath (Join-Path $taskRuntime 'mysql.zip') -DestinationPath $taskRuntime
}
if (-not (Test-Path -LiteralPath $taskData)) {
  & (Join-Path $taskMysql 'bin/mysqld.exe') --no-defaults --initialize-insecure "--basedir=$taskMysql" "--datadir=$taskData" --console
  if ($LASTEXITCODE -ne 0) { throw 'No se pudo inicializar MySQL.' }
}
$taskArguments = @('--no-defaults', "--basedir=`"$taskMysql`"", "--datadir=`"$taskData`"", '--port=3307', '--bind-address=127.0.0.1', '--mysqlx=OFF', '--innodb-buffer-pool-size=64M', '--console')
$taskProcess = Start-Process -FilePath (Join-Path $taskMysql 'bin/mysqld.exe') -ArgumentList $taskArguments -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $taskRuntime 'mysql.stdout.log') -RedirectStandardError (Join-Path $taskRuntime 'mysql.stderr.log')
Set-Content -LiteralPath (Join-Path $taskRuntime 'mysql.pid') -Value $taskProcess.Id
Write-Output "MySQL local iniciado en 127.0.0.1:3307 (PID $($taskProcess.Id))."
