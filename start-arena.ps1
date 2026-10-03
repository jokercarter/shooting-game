param(
  [int]$Port = 8080,
  [string]$BindAddress,
  [switch]$Build
)
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
if ($Build) { npm run build; if ($LASTEXITCODE) { throw 'Build failed' } }
if (!(Test-Path 'dist/arena/index.html')) { throw 'Run .\start-arena.ps1 -Build once first.' }

if (!$BindAddress) {
  $route = Get-NetRoute -DestinationPrefix '0.0.0.0/0' -ErrorAction SilentlyContinue |
    Sort-Object RouteMetric, InterfaceMetric | Select-Object -First 1
  if ($route) {
    $address = Get-NetIPAddress -InterfaceIndex $route.InterfaceIndex -AddressFamily IPv4 -AddressState Preferred -ErrorAction SilentlyContinue |
      Where-Object {
        $octets = $_.IPAddress.Split('.')
        $octets.Count -eq 4 -and (
          $octets[0] -eq '10' -or
          ($octets[0] -eq '192' -and $octets[1] -eq '168') -or
          ($octets[0] -eq '172' -and [int]$octets[1] -ge 16 -and [int]$octets[1] -le 31)
        )
      } | Select-Object -First 1
    if ($address) { $BindAddress = $address.IPAddress }
  }
  if (!$BindAddress) { throw 'No active private LAN IPv4 address was found. Pass -BindAddress explicitly.' }
}

$parsedAddress = $null
if (![System.Net.IPAddress]::TryParse($BindAddress, [ref]$parsedAddress) -or
    $parsedAddress.AddressFamily -ne [System.Net.Sockets.AddressFamily]::InterNetwork) {
  throw 'BindAddress must be a local IPv4 address.'
}
if (!(Get-NetIPAddress -IPAddress $BindAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue)) {
  throw "The address $BindAddress is not assigned to this computer."
}

Write-Host "Morrow Fields is listening at http://$($BindAddress):$Port/arena/"
$python = & (Join-Path $PSScriptRoot 'tools\Find-Python.ps1')
& $python -B -m uvicorn backend.arena_public:app --host $BindAddress --port $Port
