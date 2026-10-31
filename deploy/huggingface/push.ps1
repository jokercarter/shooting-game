param(
  [Parameter(Mandatory = $true)][string]$Space,   # e.g. jokercarter/morrow-fields
  [string]$Token = $env:HF_TOKEN,
  [int]$Port = 8080
)

# Publishes Morrow Fields to a Hugging Face Space (Docker SDK).
# Create the Space first at https://huggingface.co/new-space with SDK = Docker,
# then run:  $env:HF_TOKEN = "hf_..." ; .\deploy\huggingface\push.ps1 -Space you/morrow-fields

$ErrorActionPreference = 'Stop'
$root = Resolve-Path (Join-Path $PSScriptRoot '..\..')
Set-Location $root

if (-not $Token) {
  throw 'Missing token. Create a WRITE token at https://huggingface.co/settings/tokens and set $env:HF_TOKEN.'
}
$tokenEnv = $env:HF_TOKEN
try {
  $env:HF_TOKEN = $Token
  $cloneUrl = "https://user:$Token@huggingface.co/spaces/$Space"
  $work = Join-Path $root '.hf-space'

  if (Test-Path $work) { Remove-Item -LiteralPath $work -Recurse -Force }
  git clone $cloneUrl $work
  if ($LASTEXITCODE) { throw 'git clone failed - check the Space name and token scope.' }

  Get-ChildItem -LiteralPath $work -Force | Where-Object { $_.Name -ne '.git' } |
    ForEach-Object { Remove-Item -LiteralPath $_.FullName -Recurse -Force }

  Copy-Item 'deploy\huggingface\README.md' (Join-Path $work 'README.md')
  Copy-Item 'deploy\huggingface\Dockerfile' (Join-Path $work 'Dockerfile')
  Copy-Item 'requirements.txt' (Join-Path $work 'requirements.txt')
  Copy-Item 'backend' (Join-Path $work 'backend') -Recurse
  New-Item -ItemType Directory -Force -Path (Join-Path $work 'public') | Out-Null
  Copy-Item 'public\arena' (Join-Path $work 'public\arena') -Recurse
  Get-ChildItem -Path $work -Recurse -Force -Include '__pycache__' |
    ForEach-Object { Remove-Item -LiteralPath $_.FullName -Recurse -Force }

  Set-Content -LiteralPath (Join-Path $work '.gitignore') -Encoding utf8 -Value @(
    '__pycache__/', '*.pyc', '*.sqlite3', 'data/'
  )

  if ($Port -ne 8080) {
    $readme = Join-Path $work 'README.md'
    (Get-Content -LiteralPath $readme -Raw) -replace 'app_port: \d+', "app_port: $Port" |
      Set-Content -LiteralPath $readme -Encoding utf8 -NoNewline
    $docker = Join-Path $work 'Dockerfile'
    (Get-Content -LiteralPath $docker -Raw) -replace '"8080"', "`"$Port`"" |
      Set-Content -LiteralPath $docker -Encoding utf8 -NoNewline
  }

  Set-Location $work
  git add -A
  git -c user.name='Morrow Fields' -c user.email='deploy@local' commit -m 'Deploy Morrow Fields arena' | Out-Null
  git push origin HEAD
  if ($LASTEXITCODE) { throw 'git push failed.' }

  $owner, $name = $Space.Split('/')
  $slug = ($owner + '-' + $name).ToLower() -replace '[^a-z0-9-]', '-'
  Write-Host ''
  Write-Host "Space:  https://huggingface.co/spaces/$Space"
  Write-Host "App:    https://$slug.hf.space"
  Write-Host 'First build takes 2-4 minutes; watch the Logs tab in the Space.'
}
finally {
  Set-Location $root
  $env:HF_TOKEN = $tokenEnv
}
