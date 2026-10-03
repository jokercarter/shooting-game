$ErrorActionPreference = 'Stop'
$workspaceRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $workspaceRoot
$python = & (Join-Path $PSScriptRoot 'Find-Python.ps1')
& $python -B -m pytest backend -q
exit $LASTEXITCODE
