param(
  [int]$Port = 8082,
  [switch]$Build
)

$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
if ($Build) {
  npm run build
  if ($LASTEXITCODE) { throw 'Build failed.' }
}
if (!(Test-Path -LiteralPath 'dist/arena/index.html')) {
  throw 'dist/arena/index.html is missing. Run .\start-arena-local.ps1 -Build once first.'
}

$existing = Get-NetTCPConnection -State Listen -LocalAddress '127.0.0.1' -LocalPort $Port -ErrorAction SilentlyContinue
if ($existing) {
  throw "Local port $Port is already in use by PID $($existing.OwningProcess). Open http://127.0.0.1:$Port/arena/ or choose another port."
}

$python = & (Join-Path $PSScriptRoot 'tools\Find-Python.ps1')
$runtime = Join-Path $PSScriptRoot 'output\arena-validation'
New-Item -ItemType Directory -Force -Path $runtime | Out-Null
$runtimeRoot = Join-Path $env:TEMP 'morrow-fields-arena-runtime'
New-Item -ItemType Directory -Force -Path $runtimeRoot | Out-Null
$out = Join-Path $runtimeRoot ("local-runtime-server-$Port.out.log")
$err = Join-Path $runtimeRoot ("local-runtime-server-$Port.err.log")
$process = Start-Process -FilePath $python -ArgumentList @(
  '-B', '-m', 'uvicorn', 'backend.arena_public:app', '--host', '127.0.0.1', '--port', [string]$Port
) -WorkingDirectory $PSScriptRoot -WindowStyle Hidden -RedirectStandardOutput $out -RedirectStandardError $err -PassThru

Start-Sleep -Milliseconds 700
$health = Invoke-WebRequest -Uri "http://127.0.0.1:$Port/health" -TimeoutSec 10
$state = [ordered]@{
  started_at = (Get-Date).ToUniversalTime().ToString('o')
  local_url = "http://127.0.0.1:$Port/arena/"
  health_status = $health.StatusCode
  server_pid = $process.Id
  server_log = $out
}
$state | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $runtime 'local-runtime.json') -Encoding UTF8
Write-Host "Morrow Fields local URL: $($state.local_url)"
Write-Host "Runtime record: $(Join-Path $runtime 'local-runtime.json')"
