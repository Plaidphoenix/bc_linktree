[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
$secretDirectory = Join-Path $projectRoot "local-data\secrets"
$backupDirectory = Join-Path $projectRoot "local-data\backups"
$dockerEnvironment = Join-Path $projectRoot ".env.docker"
$dockerEnvironmentExample = Join-Path $projectRoot ".env.docker.example"

New-Item -ItemType Directory -Path $secretDirectory -Force | Out-Null
New-Item -ItemType Directory -Path $backupDirectory -Force | Out-Null

if (-not (Test-Path -LiteralPath $dockerEnvironment -PathType Leaf)) {
  Copy-Item -LiteralPath $dockerEnvironmentExample -Destination $dockerEnvironment
  Write-Host "Created .env.docker from the non-secret example."
}

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

function Initialize-Secret([string]$Name, [int]$ByteCount) {
  $path = Join-Path $secretDirectory $Name
  if (Test-Path -LiteralPath $path -PathType Leaf) {
    Write-Host "Preserved existing secret file: $Name"
    return
  }

  [System.IO.File]::WriteAllText(
    $path,
    (New-Base64UrlSecret $ByteCount),
    [System.Text.UTF8Encoding]::new($false)
  )

  $identity = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
  & icacls $path /inheritance:r /grant:r "${identity}:(R,W)" | Out-Null
  Write-Host "Created protected secret file: $Name"
}

Initialize-Secret "postgres_admin_password" 32
Initialize-Secret "postgres_app_password" 32
Initialize-Secret "sim_token_encryption_key" 32
Write-Host "Docker local state initialized without printing secret values."
