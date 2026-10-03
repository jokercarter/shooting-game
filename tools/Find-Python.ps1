$ErrorActionPreference = 'Stop'
$workspaceRoot = Split-Path -Parent $PSScriptRoot
$externalPython = Join-Path $env:USERPROFILE '.codex\workspace-deps\SWE-AI\venv\Scripts\python.exe'
$localPython = Join-Path $workspaceRoot '.venv\Scripts\python.exe'
if (Test-Path -LiteralPath $externalPython) {
  Write-Output $externalPython
} elseif (Test-Path -LiteralPath $localPython) {
  Write-Output $localPython
} else {
  throw 'Project Python runtime is missing. Run .\start.ps1 -Install to create it outside the workspace.'
}
