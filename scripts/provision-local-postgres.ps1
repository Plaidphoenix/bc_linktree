[CmdletBinding()]
param(
  [string]$AdminUser = "postgres",
  [string]$DatabaseName = "linkgov_homolog",
  [string]$ApplicationUser = "linkgov_homolog"
)

$ErrorActionPreference = "Stop"
trap {
  Write-Host "Provisionamento nao concluido. Verifique a senha administrativa e tente novamente." -ForegroundColor Red
  exit 1
}

$projectRoot = Split-Path -Parent $PSScriptRoot
$postgresBin = "C:\Program Files\PostgreSQL\18\bin"
$psql = Join-Path $postgresBin "psql.exe"
$secretDirectory = Join-Path $projectRoot "local-data\secrets"
$assetDirectory = Join-Path $projectRoot "local-data\municipal-assets"
$applicationPasswordFile = Join-Path $secretDirectory "local_postgres_password"
$simEncryptionKeyFile = Join-Path $secretDirectory "local_sim_token_encryption_key"
$environmentFile = Join-Path $projectRoot ".env.municipal"

foreach ($identifier in @($AdminUser, $DatabaseName, $ApplicationUser)) {
  if ($identifier -notmatch "^[a-z][a-z0-9_]{0,62}$") {
    throw "PostgreSQL identifiers must use lowercase letters, digits and underscores."
  }
}
if (-not (Test-Path -LiteralPath $psql -PathType Leaf)) {
  throw "PostgreSQL 18 client was not found in the expected installation path."
}

New-Item -ItemType Directory -Path $secretDirectory -Force | Out-Null
New-Item -ItemType Directory -Path $assetDirectory -Force | Out-Null

function New-Base64UrlSecret([int]$ByteCount) {
  $bytes = New-Object byte[] $ByteCount
  $generator = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  try {
    $generator.GetBytes($bytes)
  } finally {
    $generator.Dispose()
  }
  return [Convert]::ToBase64String($bytes).TrimEnd("=").Replace("+", "-").Replace("/", "_")
}

function Initialize-Secret([string]$Path, [int]$ByteCount) {
  if (Test-Path -LiteralPath $Path -PathType Leaf) {
    return
  }
  [System.IO.File]::WriteAllText(
    $Path,
    (New-Base64UrlSecret $ByteCount),
    [System.Text.UTF8Encoding]::new($false)
  )
  $identity = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
  & icacls $Path /inheritance:r /grant:r "${identity}:(R,W)" | Out-Null
}

function Invoke-Psql(
  [string]$Database,
  [string]$Command,
  [switch]$Capture,
  [switch]$FromStandardInput
) {
  $arguments = @(
    "--host=127.0.0.1",
    "--port=5432",
    "--username=$AdminUser",
    "--dbname=$Database",
    "--no-psqlrc",
    "--set=ON_ERROR_STOP=1"
  )

  $previousErrorPreference = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  try {
    if ($FromStandardInput) {
      $output = $Command | & $psql @arguments --file=- 2>&1
    } else {
      $output = & $psql @arguments --tuples-only --no-align --command=$Command 2>&1
    }
    $exitCode = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $previousErrorPreference
  }
  if ($exitCode -ne 0) {
    throw "PostgreSQL rejected the requested administrative operation."
  }
  if ($Capture) {
    return ($output | Out-String).Trim()
  }
}

Initialize-Secret $applicationPasswordFile 32
Initialize-Secret $simEncryptionKeyFile 32

$securePassword = Read-Host "Senha administrativa do PostgreSQL (nao sera exibida)" -AsSecureString
$passwordPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
$roleCreated = $false

try {
  $env:PGPASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($passwordPointer)
  $roleExists = Invoke-Psql "postgres" "SELECT 1 FROM pg_roles WHERE rolname = '$ApplicationUser';" -Capture
  $databaseExists = Invoke-Psql "postgres" "SELECT 1 FROM pg_database WHERE datname = '$DatabaseName';" -Capture

  if ([bool]$roleExists -xor [bool]$databaseExists) {
    throw "Only one homologation resource exists. Ask the DBA to inspect it before continuing."
  }

  if (-not $roleExists) {
    $applicationPassword = [System.IO.File]::ReadAllText($applicationPasswordFile).Trim()
    $escapedPassword = $applicationPassword.Replace("'", "''")
    $createRole = @"
CREATE ROLE $ApplicationUser
  LOGIN
  PASSWORD '$escapedPassword'
  NOSUPERUSER
  NOCREATEDB
  NOCREATEROLE
  NOREPLICATION;
"@
    Invoke-Psql "postgres" $createRole -FromStandardInput
    $roleCreated = $true
    Invoke-Psql "postgres" "CREATE DATABASE $DatabaseName OWNER $ApplicationUser ENCODING 'UTF8' TEMPLATE template0;"
    Write-Host "Created isolated PostgreSQL role and database for LinkGov homologation."
  } else {
    $owner = Invoke-Psql "postgres" "SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname = '$DatabaseName';" -Capture
    if ($owner -ne $ApplicationUser) {
      throw "The existing homologation database has an unexpected owner."
    }
    Write-Host "Preserved the existing isolated PostgreSQL homologation database."
  }
} catch {
  if ($roleCreated) {
    try {
      Invoke-Psql "postgres" "DROP ROLE IF EXISTS $ApplicationUser;"
    } catch {
      Write-Warning "The partially created role requires DBA review."
    }
  }
  throw
} finally {
  Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordPointer)
}

$normalizePath = {
  param([string]$Path)
  return ([System.IO.Path]::GetFullPath($Path) -replace "\\", "/")
}

$environmentLines = @(
  "ENVIRONMENT=development",
  "AUTH_PROVIDER=sim",
  "HOST=127.0.0.1",
  "PORT=8787",
  "APP_BASE_URL=http://localhost:5173",
  "ADMIN_BASE_URL=http://localhost:5173",
  "ASSET_BASE_URL=http://localhost:8787/api/assets",
  "ASSET_STORAGE_PATH=$(& $normalizePath $assetDirectory)",
  "PGHOST=127.0.0.1",
  "PGPORT=5432",
  "PGDATABASE=$DatabaseName",
  "PGUSER=$ApplicationUser",
  "PGPASSWORD_FILE=$(& $normalizePath $applicationPasswordFile)",
  "DATABASE_POOL_SIZE=10",
  "SESSION_COOKIE_NAME=linkgov_session",
  "SIM_API_BASE_URL=https://sim.bc.sc.gov.br/default",
  "SIM_LOGIN_PATH=api/login",
  "SIM_VALIDATE_PATH=api/validar-acesso",
  "SIM_LOGOUT_PATH=api/logout",
  "SIM_LOGIN_CONTENT_TYPE=json",
  "SIM_CLIENT_TYPE=mobile",
  "SIM_SUBJECT_CLAIM=ref_cod_usuario",
  "SIM_REQUEST_TIMEOUT_MS=8000",
  "SIM_SESSION_TTL_SECONDS=3600",
  "SIM_TOKEN_ENCRYPTION_KEY_FILE=$(& $normalizePath $simEncryptionKeyFile)"
)
[System.IO.File]::WriteAllLines(
  $environmentFile,
  $environmentLines,
  [System.Text.UTF8Encoding]::new($false)
)

$nodeCandidates = @(
  (Join-Path $projectRoot "tmp\node22\node_modules\node\bin\node.exe"),
  (Get-Command node -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source -ErrorAction SilentlyContinue)
) | Where-Object { $_ -and (Test-Path -LiteralPath $_ -PathType Leaf) }

$node = $nodeCandidates | Where-Object {
  $version = & $_ --version
  [int](($version -replace "^v", "").Split(".")[0]) -ge 22
} | Select-Object -First 1

if (-not $node) {
  throw "Node.js 22 or newer is required to apply the LinkGov migrations."
}
if (-not (Test-Path -LiteralPath (Join-Path $projectRoot "dist-server\migrate.mjs") -PathType Leaf)) {
  throw "Build municipal missing. Run npm run build:selfhosted before provisioning."
}

& $node --env-file=$environmentFile (Join-Path $projectRoot "dist-server\migrate.mjs")
if ($LASTEXITCODE -ne 0) {
  throw "The database was created, but LinkGov migrations did not complete."
}

Write-Host "PostgreSQL homologation is ready. No password was printed or committed."
