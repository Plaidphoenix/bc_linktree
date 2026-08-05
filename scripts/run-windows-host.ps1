[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [ValidateSet("start", "stop", "status")]
  [string]$Command,
  [ValidateRange(1024, 65535)]
  [int]$Port = 9443,
  [string]$PublicBaseUrl = "",
  [string]$PfxFile = "",
  [string]$PfxPassphraseFile = "",
  [switch]$BehindNginx,
  [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
$environmentFile = Join-Path $projectRoot ".env.municipal"
$entry = Join-Path $projectRoot "dist-server\index.mjs"
$runtimeDirectory = Join-Path $projectRoot "local-data\runtime"
$stateFile = Join-Path $runtimeDirectory "windows-host.json"
$standardLog = Join-Path $runtimeDirectory "windows-host.out.log"
$errorLog = Join-Path $runtimeDirectory "windows-host.err.log"

if (-not $PfxFile) {
  $PfxFile = Join-Path $projectRoot "local-data\certificates\linkgov-lan.pfx"
}
if (-not $PfxPassphraseFile) {
  $PfxPassphraseFile = Join-Path $projectRoot "local-data\certificates\linkgov-lan.password"
}

function Invoke-Main {
switch ($Command) {
  "status" {
    Show-Status
    exit 0
  }
  "stop" {
    Stop-HostProcess
    exit 0
  }
}

if (-not (Test-Path -LiteralPath $environmentFile -PathType Leaf)) {
  throw ".env.municipal esta ausente. Provisione primeiro o PostgreSQL de homologacao."
}
if (-not (Test-Path -LiteralPath $PfxFile -PathType Leaf) -or
    -not (Test-Path -LiteralPath $PfxPassphraseFile -PathType Leaf)) {
  throw "Certificado PFX ausente. Execute npm run windows-host:certificate primeiro."
}

$existing = Get-VerifiedHostProcess
if ($existing) {
  Write-Host "LinkGov ja esta ativo no PID $($existing.ProcessId)."
  Show-Status
  exit 0
}

$occupied = Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue
if ($occupied) {
  throw "A porta $Port ja esta ocupada pelo PID $($occupied[0].OwningProcess)."
}

$node = Find-Node22
if (-not $SkipBuild) {
  $npm = Get-Command npm.cmd -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source
  if (-not $npm) {
    throw "npm.cmd nao foi encontrado."
  }
  & $npm run build:selfhosted
  if ($LASTEXITCODE -ne 0) {
    throw "O build falhou; o host nao foi iniciado."
  }
}
if (-not (Test-Path -LiteralPath $entry -PathType Leaf)) {
  throw "Build municipal ausente. Execute npm run build:selfhosted."
}

$activeAddress = Get-ActiveIpv4
if ($BehindNginx -and $PublicBaseUrl) {
  throw "Use BehindNginx ou PublicBaseUrl, nunca os dois juntos."
}
if ($BehindNginx) {
  $PublicBaseUrl = "https://${activeAddress}"
}
elseif (-not $PublicBaseUrl) {
  $PublicBaseUrl = "https://${activeAddress}:$Port"
}
$publicUri = $null
if (-not [Uri]::TryCreate($PublicBaseUrl, [UriKind]::Absolute, [ref]$publicUri) -or
    $publicUri.Scheme -ne "https") {
  throw "PublicBaseUrl deve ser uma URL HTTPS absoluta."
}
if ($publicUri.AbsolutePath -ne "/" -or $publicUri.Query -or $publicUri.Fragment) {
  throw "PublicBaseUrl nao deve conter caminho, query ou fragmento."
}

New-Item -ItemType Directory -Force -Path $runtimeDirectory | Out-Null
$overrides = [ordered]@{
  ENVIRONMENT = "production"
  HOST = $(if ($BehindNginx) { "127.0.0.1" } else { "0.0.0.0" })
  PORT = "$Port"
  APP_BASE_URL = $PublicBaseUrl.TrimEnd("/")
  ADMIN_BASE_URL = $PublicBaseUrl.TrimEnd("/")
  ASSET_BASE_URL = "$($PublicBaseUrl.TrimEnd('/'))/api/assets"
  TLS_PFX_FILE = (Resolve-Path -LiteralPath $PfxFile).Path
  TLS_PFX_PASSPHRASE_FILE = (Resolve-Path -LiteralPath $PfxPassphraseFile).Path
  TLS_CERT_FILE = $null
  TLS_KEY_FILE = $null
  HTTPS_TERMINATED_UPSTREAM = "false"
}

$previous = @{}
foreach ($item in $overrides.GetEnumerator()) {
  $previous[$item.Key] = [Environment]::GetEnvironmentVariable($item.Key, "Process")
  [Environment]::SetEnvironmentVariable($item.Key, $item.Value, "Process")
}

try {
  $arguments = @(
    "--env-file=`"$environmentFile`"",
    "`"$entry`""
  )
  $startParameters = @{
    FilePath = $node
    ArgumentList = $arguments
    WorkingDirectory = $projectRoot
    RedirectStandardOutput = $standardLog
    RedirectStandardError = $errorLog
    WindowStyle = "Hidden"
    PassThru = $true
  }
  $process = Start-Process @startParameters
}
finally {
  foreach ($item in $previous.GetEnumerator()) {
    [Environment]::SetEnvironmentVariable($item.Key, $item.Value, "Process")
  }
}

$state = [ordered]@{
  processId = $process.Id
  url = $PublicBaseUrl.TrimEnd("/")
  localHealthUrl = "https://127.0.0.1:$Port"
  port = $Port
  startedAt = [DateTime]::UtcNow.ToString("o")
  entry = $entry
  certificate = $PfxFile
}
$state | ConvertTo-Json | Set-Content -LiteralPath $stateFile -Encoding UTF8

$healthy = $false
for ($attempt = 1; $attempt -le 20; $attempt++) {
  Start-Sleep -Seconds 1
  if ($process.HasExited) {
    break
  }
  if (Test-Health -BaseUrl "https://127.0.0.1:$Port") {
    $healthy = $true
    break
  }
}

if (-not $healthy) {
  if (-not $process.HasExited) {
    Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
  }
  Remove-Item -LiteralPath $stateFile -Force -ErrorAction SilentlyContinue
  Write-Host "Falha ao iniciar. Ultimas mensagens do processo:"
  Get-Content -LiteralPath $errorLog -Tail 20 -ErrorAction SilentlyContinue
  throw "O health check HTTPS nao respondeu."
}

Write-Host "LinkGov HTTPS iniciado com sucesso."
Write-Host "URL LAN: $($PublicBaseUrl.TrimEnd('/'))"
Write-Host "PID: $($process.Id)"
Write-Host "O certificado ainda precisa ser confiado nos dispositivos antes de usar login real."
}

function Find-Node22 {
  $candidates = @(
    (Join-Path $projectRoot "tmp\node22\node_modules\node\bin\node.exe"),
    (Get-Command node -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source -ErrorAction SilentlyContinue)
  ) | Where-Object { $_ -and (Test-Path -LiteralPath $_ -PathType Leaf) }

  $selected = $candidates | Where-Object {
    $version = & $_ --version
    [int](($version -replace "^v", "").Split(".")[0]) -ge 22
  } | Select-Object -First 1
  if (-not $selected) {
    throw "Node.js 22 ou superior nao foi encontrado."
  }
  return $selected
}

function Get-ActiveIpv4 {
  $address = Get-NetIPConfiguration |
    Where-Object { $_.IPv4DefaultGateway -and $_.IPv4Address.IPAddress -notlike "169.254.*" } |
    Select-Object -First 1 -ExpandProperty IPv4Address |
    Select-Object -ExpandProperty IPAddress
  if (-not $address) {
    throw "Nenhum IPv4 com gateway padrao foi encontrado."
  }
  return $address
}

function Read-State {
  if (-not (Test-Path -LiteralPath $stateFile -PathType Leaf)) {
    return $null
  }
  try {
    return Get-Content -Raw -LiteralPath $stateFile | ConvertFrom-Json
  }
  catch {
    return $null
  }
}

function Get-VerifiedHostProcess {
  $state = Read-State
  if (-not $state -or -not $state.processId) {
    return $null
  }
  $candidate = Get-CimInstance Win32_Process -Filter "ProcessId = $($state.processId)" -ErrorAction SilentlyContinue
  if (-not $candidate -or
      $candidate.Name -ne "node.exe" -or
      $candidate.CommandLine -notlike "*dist-server*index.mjs*" -or
      $candidate.CommandLine -notlike "*$projectRoot*") {
    return $null
  }
  return $candidate
}

function Test-Health {
  param([Parameter(Mandatory = $true)][string]$BaseUrl)

  try {
    $curl = Get-Command curl.exe -ErrorAction Stop | Select-Object -ExpandProperty Source
    $curlArguments = @(
      "--silent",
      "--show-error",
      "--fail",
      "--insecure",
      "--max-time",
      "3",
      "$($BaseUrl.TrimEnd('/'))/api/health"
    )
    $body = & $curl @curlArguments 2>$null
    if ($LASTEXITCODE -ne 0) {
      return $false
    }
    $health = $body | ConvertFrom-Json
    return $health.ok -eq $true
  }
  catch {
    return $false
  }
}

function Show-Status {
  $state = Read-State
  $process = Get-VerifiedHostProcess
  if (-not $state -or -not $process) {
    Write-Host "LinkGov HTTPS nao esta ativo."
    return
  }
  $healthBaseUrl = if ($state.localHealthUrl) { $state.localHealthUrl } else { "https://127.0.0.1:$($state.port)" }
  $healthy = Test-Health -BaseUrl $healthBaseUrl
  Write-Host "Status: $(if ($healthy) { 'saudavel' } else { 'processo ativo, health indisponivel' })"
  Write-Host "URL: $($state.url)"
  Write-Host "PID: $($process.ProcessId)"
  Write-Host "Inicio UTC: $($state.startedAt)"
}

function Stop-HostProcess {
  $process = Get-VerifiedHostProcess
  if (-not $process) {
    Remove-Item -LiteralPath $stateFile -Force -ErrorAction SilentlyContinue
    Write-Host "LinkGov HTTPS ja estava parado."
    return
  }
  Stop-Process -Id $process.ProcessId -Force
  for ($attempt = 1; $attempt -le 20; $attempt++) {
    if (-not (Get-Process -Id $process.ProcessId -ErrorAction SilentlyContinue)) {
      break
    }
    Start-Sleep -Milliseconds 500
  }
  Remove-Item -LiteralPath $stateFile -Force -ErrorAction SilentlyContinue
  Write-Host "LinkGov HTTPS parado."
}

Invoke-Main
