param([switch]$Install, [int]$Port = 4173)
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$externalVenv = Join-Path $env:USERPROFILE '.codex\workspace-deps\SWE-AI\venv'
$externalPython = Join-Path $externalVenv 'Scripts\python.exe'
if ($Install -and !(Test-Path -LiteralPath $externalPython) -and !(Test-Path -LiteralPath '.venv/Scripts/python.exe')) {
    New-Item -ItemType Directory -Path (Split-Path -Parent $externalVenv) -Force | Out-Null
    python -m venv $externalVenv
    if ($LASTEXITCODE) { throw 'Python environment creation failed' }
}
$python = & (Join-Path $PSScriptRoot 'tools\Find-Python.ps1')
if ($Install) {
    & $python -m pip install --extra-index-url https://download.pytorch.org/whl/cpu -r requirements.lock.txt
    if ($LASTEXITCODE) { throw 'Python dependency installation failed' }
    npm run install:dependencies
    if ($LASTEXITCODE) { throw 'Node dependency installation failed' }
}
npm run build
if ($LASTEXITCODE) { throw 'Build failed' }
& $python -m alembic upgrade head
if ($LASTEXITCODE) { throw 'Migration failed' }
New-Item -ItemType Directory -Path '.workbench' -Force | Out-Null
$listener = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
if ($listener) { throw "Port $Port is already in use. Stop its known owner or choose -Port." }
$workbenchProcess = Start-Process -FilePath $python -ArgumentList @('-m','uvicorn','backend.run:app','--host','127.0.0.1','--port',"$Port") -WorkingDirectory $PSScriptRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput "$PSScriptRoot/.workbench/server.log" -RedirectStandardError "$PSScriptRoot/.workbench/server-error.log"
$workbenchProcess.Id | Set-Content '.workbench/server.pid'
for ($attempt=0; $attempt -lt 30; $attempt++) {
    Start-Sleep -Milliseconds 500
    try { $health=Invoke-RestMethod "http://127.0.0.1:$Port/api/health"; if ($health.status -eq 'ok') { Write-Host "Workbench ready: http://127.0.0.1:$Port/app/"; exit 0 } } catch {}
}
throw 'Server did not become ready. Check .workbench/server-error.log.'
