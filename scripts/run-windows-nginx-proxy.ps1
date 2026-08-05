[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [ValidateSet("start", "stop", "status")]
  [string]$Command,
  [ValidateRange(1, 65535)]
  [int]$ListenPort = 443,
  [ValidateRange(1, 65535)]
  [int]$HttpPort = 80,
  [ValidateRange(1, 65535)]
  [int]$UpstreamPort = 9443,
  [string]$NginxHome = ""
)

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
$configTemplate = Join-Path $projectRoot "deploy\nginx\windows-lan-http.conf.template"
$runtimeDirectory = Join-Path $projectRoot "local-data\nginx"
$logDirectory = Join-Path $runtimeDirectory "logs"
$runtimeConfigFile = Join-Path $runtimeDirectory "linkgov-http.conf"
$pidFile = Join-Path $logDirectory "linkgov-proxy.pid"
$certificatePemFile = Join-Path $projectRoot "local-data\certificates\linkgov-lan.cert.pem"
$privateKeyPemFile = Join-Path $projectRoot "local-data\certificates\linkgov-lan.key.pem"
$certificateExportScript = Join-Path $PSScriptRoot "export-windows-nginx-certificate.ps1"

if ($ListenPort -ne 443 -or $HttpPort -ne 80 -or $UpstreamPort -ne 9443) {
  throw "A configuracao versionada usa HTTP 80, HTTPS 443 e upstream 9443."
}

function Find-NginxHome {
  if ($NginxHome) {
    $candidate = [System.IO.Path]::GetFullPath($NginxHome)
    if (Test-Path -LiteralPath (Join-Path $candidate "nginx.exe") -PathType Leaf) {
      return $candidate
    }
    throw "nginx.exe nao foi encontrado em NginxHome."
  }

  $documents = [Environment]::GetFolderPath("MyDocuments")
  $candidate = Get-ChildItem -LiteralPath $documents -Directory -Filter "nginx-*" -ErrorAction SilentlyContinue |
    Where-Object { Test-Path -LiteralPath (Join-Path $_.FullName "nginx.exe") -PathType Leaf } |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1
  if (-not $candidate) {
    throw "Nginx nao foi encontrado em Documentos."
  }
  return $candidate.FullName
}

function Convert-ToNginxPath {
  param([Parameter(Mandatory = $true)][string]$Path)
  return ([System.IO.Path]::GetFullPath($Path) -replace "\\", "/")
}

function Write-RuntimeConfig {
  foreach ($required in @($configTemplate, (Join-Path $projectRoot "dist\index.html"), $certificatePemFile, $privateKeyPemFile)) {
    if (-not (Test-Path -LiteralPath $required -PathType Leaf)) {
      throw "Arquivo necessario para o Nginx ausente: $required"
    }
  }

  $template = Get-Content -Raw -LiteralPath $configTemplate
  $rendered = $template.Replace("__MIME_TYPES__", (Convert-ToNginxPath -Path (Join-Path $script:resolvedNginxHome "conf\mime.types")))
  $rendered = $rendered.Replace("__DIST_ROOT__", (Convert-ToNginxPath -Path (Join-Path $projectRoot "dist")))
  $rendered = $rendered.Replace("__CERT_PEM__", (Convert-ToNginxPath -Path $certificatePemFile))
  $rendered = $rendered.Replace("__KEY_PEM__", (Convert-ToNginxPath -Path $privateKeyPemFile))
  [System.IO.File]::WriteAllText($runtimeConfigFile, $rendered, [System.Text.UTF8Encoding]::new($false))
}

function Read-ProxyPid {
  if (-not (Test-Path -LiteralPath $pidFile -PathType Leaf)) { return $null }
  $content = Get-Content -Raw -LiteralPath $pidFile
  if ([string]::IsNullOrWhiteSpace($content)) { return $null }
  $value = $content.Trim()
  if ($value -notmatch "^\d+$") { return $null }
  return [int]$value
}

function Get-VerifiedProxyProcess {
  $processId = Read-ProxyPid
  if (-not $processId) { return $null }
  $candidate = Get-CimInstance Win32_Process -Filter "ProcessId = $processId" -ErrorAction SilentlyContinue
  if (-not $candidate -or
      $candidate.Name -ne "nginx.exe" -or
      $candidate.ExecutablePath -ne $script:nginxExecutable -or
      $candidate.CommandLine -notlike "*linkgov-http.conf*") {
    return $null
  }
  return $candidate
}

function Test-HttpsFrontend {
  return Invoke-CurlCheck -Arguments @("--silent", "--fail", "--insecure", "--max-time", "3", "https://127.0.0.1/")
}

function Test-HttpsApi {
  return Invoke-CurlCheck -Arguments @("--silent", "--fail", "--insecure", "--max-time", "3", "https://127.0.0.1/api/health")
}

function Test-HttpRedirect {
  $previousPreference = $ErrorActionPreference
  try {
    $ErrorActionPreference = "Continue"
    $status = & curl.exe --silent --output NUL --write-out "%{http_code}" --max-time 3 "http://127.0.0.1/" 2>$null
    return $LASTEXITCODE -eq 0 -and $status -eq "308"
  }
  finally {
    $ErrorActionPreference = $previousPreference
  }
}

function Invoke-CurlCheck {
  param([Parameter(Mandatory = $true)][string[]]$Arguments)

  $previousPreference = $ErrorActionPreference
  try {
    $ErrorActionPreference = "Continue"
    & curl.exe @Arguments 2>$null | Out-Null
    return $LASTEXITCODE -eq 0
  }
  finally {
    $ErrorActionPreference = $previousPreference
  }
}

function Get-ActiveIpv4 {
  $address = Get-NetIPConfiguration |
    Where-Object { $_.IPv4DefaultGateway -and $_.IPv4Address.IPAddress -notlike "169.254.*" } |
    Select-Object -First 1 -ExpandProperty IPv4Address |
    Select-Object -ExpandProperty IPAddress
  if (-not $address) { throw "Nenhum IPv4 com gateway padrao foi encontrado." }
  return $address
}

function Invoke-NginxControl {
  param(
    [Parameter(Mandatory = $true)][string[]]$Arguments,
    [Parameter(Mandatory = $true)][string]$Label
  )
  $stdout = Join-Path $logDirectory "$Label.out.log"
  $stderr = Join-Path $logDirectory "$Label.err.log"
  $process = Start-Process -FilePath $script:nginxExecutable `
    -ArgumentList $Arguments `
    -WorkingDirectory $script:resolvedNginxHome `
    -WindowStyle Hidden `
    -Wait `
    -PassThru `
    -RedirectStandardOutput $stdout `
    -RedirectStandardError $stderr
  if ($process.ExitCode -ne 0) {
    Get-Content -LiteralPath $stderr -Tail 30 -ErrorAction SilentlyContinue
    throw "Nginx falhou durante $Label."
  }
}

function Show-ProxyStatus {
  $process = Get-VerifiedProxyProcess
  if (-not $process) {
    Write-Host "Proxy Nginx do LinkGov nao esta ativo."
    return
  }
  $frontendHealthy = Test-HttpsFrontend
  $apiHealthy = Test-HttpsApi
  $redirectHealthy = Test-HttpRedirect
  $activeAddress = Get-ActiveIpv4
  Write-Host "Frontend: $(if ($frontendHealthy) { 'saudavel' } else { 'indisponivel' })"
  Write-Host "API: $(if ($apiHealthy) { 'saudavel' } else { 'temporariamente indisponivel' })"
  Write-Host "Redirecionamento HTTP: $(if ($redirectHealthy) { 'saudavel' } else { 'indisponivel' })"
  Write-Host "URL LAN: https://$activeAddress"
  Write-Host "PID: $($process.ProcessId)"
}

$resolvedNginxHome = Find-NginxHome
$nginxExecutable = Join-Path $resolvedNginxHome "nginx.exe"
$prefixArgument = "$(Convert-ToNginxPath -Path $runtimeDirectory)/"
$configArgument = Convert-ToNginxPath -Path $runtimeConfigFile

switch ($Command) {
  "status" {
    Show-ProxyStatus
    exit 0
  }
  "stop" {
    $process = Get-VerifiedProxyProcess
    if (-not $process) {
      Write-Host "Proxy Nginx do LinkGov ja estava parado."
      exit 0
    }
    Invoke-NginxControl -Label "stop" -Arguments @(
      "-p", "`"$prefixArgument`"",
      "-c", "`"$configArgument`"",
      "-s", "quit"
    )
    for ($attempt = 1; $attempt -le 20; $attempt++) {
      if (-not (Get-Process -Id $process.ProcessId -ErrorAction SilentlyContinue)) {
        Write-Host "Proxy Nginx do LinkGov parado."
        exit 0
      }
      Start-Sleep -Milliseconds 250
    }
    throw "Nginx nao encerrou no prazo esperado."
  }
}

if (-not (Test-Path -LiteralPath $configTemplate -PathType Leaf)) {
  throw "Template do Nginx nao foi encontrado."
}

$existing = Get-VerifiedProxyProcess
if ($existing) {
  Write-Host "Proxy Nginx do LinkGov ja esta ativo."
  Show-ProxyStatus
  exit 0
}

foreach ($port in @($HttpPort, $ListenPort)) {
  $occupied = Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue
  if ($occupied) { throw "A porta $port ja esta ocupada pelo PID $($occupied[0].OwningProcess)." }
}

$temporaryDirectories = @(
  $logDirectory,
  (Join-Path $runtimeDirectory "temp\client_body_temp"),
  (Join-Path $runtimeDirectory "temp\proxy_temp")
)
New-Item -ItemType Directory -Force -Path $temporaryDirectories | Out-Null
& $certificateExportScript
if ($LASTEXITCODE -ne 0) { throw "A preparacao do certificado do Nginx falhou." }
Write-RuntimeConfig

Invoke-NginxControl -Label "config-test" -Arguments @(
  "-t",
  "-p", "`"$prefixArgument`"",
  "-c", "`"$configArgument`""
)

$startArguments = @(
  "-p", "`"$prefixArgument`"",
  "-c", "`"$configArgument`""
)
Start-Process -FilePath $nginxExecutable `
  -ArgumentList $startArguments `
  -WorkingDirectory $resolvedNginxHome `
  -WindowStyle Hidden | Out-Null

for ($attempt = 1; $attempt -le 20; $attempt++) {
  Start-Sleep -Milliseconds 500
  if ((Get-VerifiedProxyProcess) -and (Test-HttpsFrontend) -and (Test-HttpRedirect)) {
    Write-Host "Proxy Nginx do LinkGov iniciado."
    Show-ProxyStatus
    exit 0
  }
}

Get-Content -LiteralPath (Join-Path $logDirectory "linkgov-proxy-error.log") -Tail 30 -ErrorAction SilentlyContinue
throw "O proxy Nginx nao ficou saudavel."
