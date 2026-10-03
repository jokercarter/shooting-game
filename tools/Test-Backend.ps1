$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath (Split-Path -Parent $PSScriptRoot)
$python = & (Join-Path $PSScriptRoot 'Find-Python.ps1')
& $python -B -m pytest backend/test_arena_rules.py -q
exit $LASTEXITCODE
