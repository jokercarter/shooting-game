$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$statePath = Join-Path $PSScriptRoot 'output\arena-validation\local-runtime.json'
if (!(Test-Path -LiteralPath $statePath)) {
  Write-Host 'No recorded local Morrow Fields runtime.'
  exit 0
}
$state = Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json
$process = Get-CimInstance Win32_Process -Filter "ProcessId=$([int]$state.server_pid)" -ErrorAction SilentlyContinue
if (!$process) {
  Write-Host "PID $($state.server_pid) is already stopped."
} elseif ($process.CommandLine -notmatch 'uvicorn backend.arena_public:app') {
  throw "PID $($state.server_pid) does not match the recorded local arena command. Refusing to stop it."
} else {
  Stop-Process -Id ([int]$state.server_pid) -Force
  Write-Host "Stopped PID $($state.server_pid)."
}
$state | Add-Member -NotePropertyName stopped_at -NotePropertyValue ((Get-Date).ToUniversalTime().ToString('o')) -Force
$state | ConvertTo-Json | Set-Content -LiteralPath $statePath -Encoding UTF8
