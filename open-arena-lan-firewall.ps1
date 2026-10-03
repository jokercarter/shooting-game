param(
  [int]$Port = 8080,
  [string]$BindAddress
)
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot

$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = [Security.Principal.WindowsPrincipal]::new($identity)
if (!$principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  throw 'Run this script from an elevated PowerShell window.'
}

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
}
if (!$BindAddress -or !(Get-NetIPAddress -IPAddress $BindAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue)) {
  throw 'BindAddress must be a private IPv4 address assigned to this computer.'
}

$ruleName = 'Morrow Fields LAN Arena'
$python = & (Join-Path $PSScriptRoot 'tools\Find-Python.ps1')
$rule = Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue | Select-Object -First 1
if ($rule) {
  $addresses = Get-NetFirewallAddressFilter -AssociatedNetFirewallRule $rule
  $ports = Get-NetFirewallPortFilter -AssociatedNetFirewallRule $rule
  $applications = Get-NetFirewallApplicationFilter -AssociatedNetFirewallRule $rule
  $localAddresses = @($addresses.LocalAddress | ForEach-Object { [string]$_ })
  $remoteAddresses = @($addresses.RemoteAddress | ForEach-Object { [string]$_ })
  $localPorts = @($ports.LocalPort | ForEach-Object { [string]$_ })
  $programs = @($applications.Program | ForEach-Object { [string]$_ })
  if ($localAddresses -notcontains $BindAddress -or
      $remoteAddresses -notcontains 'LocalSubnet' -or
      $localPorts -notcontains [string]$Port -or
      [string]$ports.Protocol -notin @('TCP', '6') -or
      $programs -notcontains $python) {
    Remove-NetFirewallRule -InputObject $rule
    $rule = $null
  }
}
if (!$rule) {
  New-NetFirewallRule -DisplayName $ruleName -Direction Inbound -Action Allow -Protocol TCP -LocalPort $Port -LocalAddress $BindAddress -RemoteAddress LocalSubnet -Profile Domain,Private,Public -Program $python | Out-Null
  Write-Host "Added a TCP $Port firewall rule limited to $BindAddress and the local subnet."
} else {
  Write-Host "The LAN firewall rule '$ruleName' already exists."
}
