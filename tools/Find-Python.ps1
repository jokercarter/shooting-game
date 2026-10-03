$ErrorActionPreference = 'Stop'
$workspaceRoot = Split-Path -Parent $PSScriptRoot
$localPython = Join-Path $workspaceRoot '.venv\Scripts\python.exe'
if (Test-Path -LiteralPath $localPython) {
  Write-Output $localPython
  exit 0
}
$python = Get-Command python -ErrorAction SilentlyContinue
if ($python) {
  Write-Output $python.Source
  exit 0
}
throw 'Python 3.13+ was not found. Install Python or create .venv in the project directory.'
