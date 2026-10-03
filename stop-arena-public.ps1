$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$statePath = Join-Path $PSScriptRoot 'output\arena-validation\public-runtime.json'
if (!(Test-Path -LiteralPath $statePath)) {
  Write-Host 'No recorded Morrow Fields public runtime.'
  exit 0
}

$state = Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json
$targets = @(
  @{ Id = [int]$state.server_pid; Pattern = 'uvicorn backend.arena_public:app' },
  @{ Id = [int]$state.tunnel_pid; Pattern = 'cloudflared.*tunnel.*trycloudflare|cloudflared.*tunnel.*--url' }
)
foreach ($target in $targets) {
  $process = Get-CimInstance Win32_Process -Filter "ProcessId=$($target.Id)" -ErrorAction SilentlyContinue
  if (!$process) {
    Write-Host "PID $($target.Id) is already stopped."
    continue
  }
  if ($process.CommandLine -notmatch $target.Pattern) {
    throw "PID $($target.Id) does not match the recorded Morrow Fields command. Refusing to stop it."
  }
  Stop-Process -Id $target.Id -Force
  Write-Host "Stopped PID $($target.Id)."
}

$state | Add-Member -NotePropertyName stopped_at -NotePropertyValue ((Get-Date).ToUniversalTime().ToString('o')) -Force
$state | ConvertTo-Json | Set-Content -LiteralPath $statePath -Encoding UTF8
