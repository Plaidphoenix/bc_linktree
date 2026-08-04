[CmdletBinding()]
param(
  [ValidateRange(1024, 65535)]
  [int]$Port = 9443,
  [string]$RemoteAddress = "",
  [switch]$Apply
)

$ErrorActionPreference = "Stop"
$ruleName = "LinkGov HTTPS LAN TCP $Port"

function Get-NetworkCidr {
  param(
    [Parameter(Mandatory = $true)][string]$IpAddress,
    [Parameter(Mandatory = $true)][ValidateRange(0, 32)][int]$PrefixLength
  )

  $bytes = [System.Net.IPAddress]::Parse($IpAddress).GetAddressBytes()
  $remaining = $PrefixLength
  for ($index = 0; $index -lt 4; $index++) {
    $bits = [Math]::Min(8, [Math]::Max(0, $remaining))
    $mask = if ($bits -eq 0) { 0 } else { (256 - [Math]::Pow(2, 8 - $bits)) }
    $bytes[$index] = $bytes[$index] -band [int]$mask
    $remaining -= $bits
  }
  return "$([System.Net.IPAddress]::new([byte[]]$bytes).ToString())/$PrefixLength"
}

if (-not $RemoteAddress) {
  $configuration = Get-NetIPConfiguration |
    Where-Object { $_.IPv4DefaultGateway -and $_.IPv4Address.IPAddress -notlike "169.254.*" } |
    Select-Object -First 1
  if (-not $configuration) {
    throw "Nao foi possivel identificar a rede local."
  }
  $address = $configuration.IPv4Address.IPAddress
  $prefix = [int]$configuration.IPv4Address.PrefixLength
  $RemoteAddress = Get-NetworkCidr -IpAddress $address -PrefixLength $prefix
}

Write-Host "Regra proposta: $ruleName"
Write-Host "Porta: TCP $Port"
Write-Host "Perfis: Domain, Private"
Write-Host "Origem permitida: $RemoteAddress"
Write-Host "PostgreSQL 5432 nao sera liberado."

if (-not $Apply) {
  Write-Host "PREVIEW: nenhuma alteracao foi feita."
  Write-Host "Para aprovar, execute este script como administrador com -Apply."
  exit 0
}

$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = [Security.Principal.WindowsPrincipal]::new($identity)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  throw "Abra o PowerShell como administrador para aplicar a regra."
}

$existing = Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue
if ($existing) {
  throw "A regra ja existe. Revise-a manualmente; o script nao substitui regras existentes."
}

$firewallParameters = @{
  DisplayName = $ruleName
  Direction = "Inbound"
  Action = "Allow"
  Protocol = "TCP"
  LocalPort = $Port
  RemoteAddress = $RemoteAddress
  Profile = @("Domain", "Private")
}
New-NetFirewallRule @firewallParameters | Out-Null

Write-Host "Regra aplicada. Somente a rede $RemoteAddress pode acessar TCP $Port."
