$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath (Split-Path -Parent $PSScriptRoot)
$python = & (Join-Path $PSScriptRoot 'Find-Python.ps1')
& $python -B -m pytest backend -q
exit $LASTEXITCODE
