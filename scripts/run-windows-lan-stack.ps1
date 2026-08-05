[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [ValidateSet("start", "stop", "status")]
  [string]$Command
)

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
$powershell = (Get-Command powershell.exe -ErrorAction Stop).Source
$hostScript = Join-Path $PSScriptRoot "run-windows-host.ps1"
$proxyScript = Join-Path $PSScriptRoot "run-windows-nginx-proxy.ps1"

function Invoke-IsolatedScript {
  param(
    [Parameter(Mandatory = $true)][string]$Script,
    [Parameter(Mandatory = $true)][string[]]$Arguments
  )
  & $powershell -NoProfile -ExecutionPolicy Bypass -File $Script @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "Falha no comando $([System.IO.Path]::GetFileName($Script)) $($Arguments -join ' ')."
  }
}

switch ($Command) {
  "status" {
    Invoke-IsolatedScript -Script $hostScript -Arguments @("status")
    Invoke-IsolatedScript -Script $proxyScript -Arguments @("status")
    exit 0
  }
  "stop" {
    Invoke-IsolatedScript -Script $proxyScript -Arguments @("stop")
    Invoke-IsolatedScript -Script $hostScript -Arguments @("stop")
    exit 0
  }
}

$postgres = Get-NetTCPConnection -State Listen -LocalPort 5432 -ErrorAction SilentlyContinue
if (-not $postgres) {
  throw "PostgreSQL nao esta escutando em 127.0.0.1:5432. Inicie o servico antes do LinkGov."
}

Set-Location -LiteralPath $projectRoot
Invoke-IsolatedScript -Script $hostScript -Arguments @("start", "-BehindNginx", "-SkipBuild")
Invoke-IsolatedScript -Script $proxyScript -Arguments @("start")
Write-Host "LinkGov iniciado. Abra https://$((Get-NetIPConfiguration | Where-Object { $_.IPv4DefaultGateway } | Select-Object -First 1 -ExpandProperty IPv4Address | Select-Object -ExpandProperty IPAddress))"
