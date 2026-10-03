param(
  [int]$Port = 8082,
  [string]$BindAddress = '127.0.0.1',
  [switch]$Build
)

$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot

if ($Build) {
  npm run build
  if ($LASTEXITCODE) { throw 'Build failed.' }
}
if (!(Test-Path -LiteralPath 'dist/arena/index.html')) {
  throw 'dist/arena/index.html is missing. Run .\start-arena-public.ps1 -Build once first.'
}

$python = & (Join-Path $PSScriptRoot 'tools\Find-Python.ps1')
$runtime = Join-Path $PSScriptRoot 'output\arena-validation'
New-Item -ItemType Directory -Force -Path $runtime | Out-Null
$serverOut = Join-Path $runtime 'public-runtime-server.out.log'
$serverErr = Join-Path $runtime 'public-runtime-server.err.log'
$tunnelOut = Join-Path $runtime 'public-runtime-tunnel.out.log'
$tunnelErr = Join-Path $runtime 'public-runtime-tunnel.err.log'
$statePath = Join-Path $runtime 'public-runtime.json'

$cloudflared = Get-Command cloudflared -ErrorAction SilentlyContinue
if ($cloudflared) {
  $cloudflaredPath = $cloudflared.Source
} else {
  $candidate = Get-ChildItem "$env:USERPROFILE\.cache\codex-tunnels" -Filter 'cloudflared*.exe' -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending | Select-Object -First 1
  if (!$candidate) { throw 'cloudflared was not found.' }
  $cloudflaredPath = $candidate.FullName
}

$server = Start-Process -FilePath $python -ArgumentList @(
  '-m', 'uvicorn', 'backend.arena_public:app', '--host', $BindAddress, '--port', [string]$Port
) -WorkingDirectory $PSScriptRoot -WindowStyle Hidden -RedirectStandardOutput $serverOut -RedirectStandardError $serverErr -PassThru

$tunnel = Start-Process -FilePath $cloudflaredPath -ArgumentList @(
  'tunnel', '--no-autoupdate', '--url', "http://${BindAddress}:$Port"
) -WorkingDirectory $PSScriptRoot -WindowStyle Hidden -RedirectStandardOutput $tunnelOut -RedirectStandardError $tunnelErr -PassThru

for ($attempt = 0; $attempt -lt 15; $attempt++) {
  Start-Sleep -Seconds 1
  $tunnelText = ((Get-Content -LiteralPath $tunnelOut -Raw -ErrorAction SilentlyContinue) + "`n" +
    (Get-Content -LiteralPath $tunnelErr -Raw -ErrorAction SilentlyContinue))
  $publicUrl = [regex]::Match($tunnelText, 'https://[a-z0-9-]+\.trycloudflare\.com').Value
  if ($publicUrl) { break }
}
if (!$publicUrl) {
  Stop-Process -Id $tunnel.Id, $server.Id -Force -ErrorAction SilentlyContinue
  throw "Quick Tunnel URL was not found. See $tunnelOut and $tunnelErr."
}

$health = $null
for ($attempt = 0; $attempt -lt 15; $attempt++) {
  try {
    $health = Invoke-WebRequest -Uri "$publicUrl/health" -TimeoutSec 15
    if ($health.StatusCode -eq 200) { break }
  } catch {
    if ($attempt -eq 14) {
      Stop-Process -Id $tunnel.Id, $server.Id -Force -ErrorAction SilentlyContinue
      throw "Quick Tunnel URL was not reachable: $publicUrl"
    }
    Start-Sleep -Seconds 1
  }
}
$state = [ordered]@{
  started_at = (Get-Date).ToUniversalTime().ToString('o')
  bind_address = $BindAddress
  port = $Port
  local_url = "http://${BindAddress}:$Port/arena/"
  public_url = "$publicUrl/arena/"
  health_status = $health.StatusCode
  server_pid = $server.Id
  tunnel_pid = $tunnel.Id
  server_log = $serverOut
  tunnel_log = $tunnelOut
}
$state | ConvertTo-Json | Set-Content -LiteralPath $statePath -Encoding UTF8
Write-Host "Morrow Fields local URL: $($state.local_url)"
Write-Host "Morrow Fields public URL: $($state.public_url)"
Write-Host "Runtime record: $statePath"
