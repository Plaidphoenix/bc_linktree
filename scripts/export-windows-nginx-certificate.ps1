[CmdletBinding()]
param(
  [string]$PfxFile = "",
  [string]$PfxPassphraseFile = "",
  [string]$CertificatePemFile = "",
  [string]$PrivateKeyPemFile = "",
  [switch]$Force
)

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
$certificateDirectory = Join-Path $projectRoot "local-data\certificates"

if (-not $PfxFile) { $PfxFile = Join-Path $certificateDirectory "linkgov-lan.pfx" }
if (-not $PfxPassphraseFile) { $PfxPassphraseFile = Join-Path $certificateDirectory "linkgov-lan.password" }
if (-not $CertificatePemFile) { $CertificatePemFile = Join-Path $certificateDirectory "linkgov-lan.cert.pem" }
if (-not $PrivateKeyPemFile) { $PrivateKeyPemFile = Join-Path $certificateDirectory "linkgov-lan.key.pem" }

function Find-OpenSsl {
  $candidates = @(
    (Get-Command openssl.exe -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source -ErrorAction SilentlyContinue),
    "C:\Program Files\Git\usr\bin\openssl.exe",
    "C:\Program Files\Git\mingw64\bin\openssl.exe",
    "C:\xampp\apache\bin\openssl.exe"
  ) | Where-Object { $_ -and (Test-Path -LiteralPath $_ -PathType Leaf) }

  $selected = $candidates | Select-Object -First 1
  if (-not $selected) {
    throw "OpenSSL nao foi encontrado. Instale-o pela equipe de infraestrutura ou use o certificado no servidor Linux."
  }
  return $selected
}

function Protect-PrivateFile {
  param([Parameter(Mandatory = $true)][string]$Path)

  $currentUser = [System.Security.Principal.WindowsIdentity]::GetCurrent().User
  $system = [System.Security.Principal.SecurityIdentifier]::new("S-1-5-18")
  $acl = [System.Security.AccessControl.FileSecurity]::new()
  $acl.SetAccessRuleProtection($true, $false)
  $acl.AddAccessRule(
    [System.Security.AccessControl.FileSystemAccessRule]::new(
      $currentUser,
      [System.Security.AccessControl.FileSystemRights]::FullControl,
      [System.Security.AccessControl.AccessControlType]::Allow
    )
  )
  $acl.AddAccessRule(
    [System.Security.AccessControl.FileSystemAccessRule]::new(
      $system,
      [System.Security.AccessControl.FileSystemRights]::FullControl,
      [System.Security.AccessControl.AccessControlType]::Allow
    )
  )
  Set-Acl -LiteralPath $Path -AclObject $acl
}

foreach ($required in @($PfxFile, $PfxPassphraseFile)) {
  if (-not (Test-Path -LiteralPath $required -PathType Leaf)) {
    throw "Arquivo de certificado ausente: $required"
  }
}

$pemFilesExist = (Test-Path -LiteralPath $CertificatePemFile -PathType Leaf) -and
  (Test-Path -LiteralPath $PrivateKeyPemFile -PathType Leaf)
$pfxUpdatedAt = (Get-Item -LiteralPath $PfxFile).LastWriteTimeUtc
$pemIsCurrent = $pemFilesExist -and
  (Get-Item -LiteralPath $CertificatePemFile).LastWriteTimeUtc -ge $pfxUpdatedAt -and
  (Get-Item -LiteralPath $PrivateKeyPemFile).LastWriteTimeUtc -ge $pfxUpdatedAt

if ($pemIsCurrent -and -not $Force) {
  Write-Host "Certificado PEM do Nginx ja esta preparado."
  exit 0
}

$openssl = Find-OpenSsl
$suffix = [Guid]::NewGuid().ToString("N")
$temporaryCertificate = Join-Path $certificateDirectory "linkgov-cert-$suffix.tmp"
$temporaryPrivateKey = Join-Path $certificateDirectory "linkgov-key-$suffix.tmp"
$passphrasePath = ([System.IO.Path]::GetFullPath($PfxPassphraseFile) -replace "\\", "/")
$passphraseArgument = "file:$passphrasePath"

try {
  $certificateOutput = & $openssl pkcs12 -in $PfxFile -clcerts -nokeys -out $temporaryCertificate -passin $passphraseArgument 2>&1
  if ($LASTEXITCODE -ne 0) {
    throw "Nao foi possivel extrair o certificado publico do PFX."
  }

  $keyOutput = & $openssl pkcs12 -in $PfxFile -nocerts -nodes -out $temporaryPrivateKey -passin $passphraseArgument 2>&1
  if ($LASTEXITCODE -ne 0) {
    throw "Nao foi possivel extrair a chave privada do PFX."
  }
  Protect-PrivateFile -Path $temporaryPrivateKey

  $certificateCleanup = & $openssl x509 -in $temporaryCertificate -out $CertificatePemFile 2>&1
  if ($LASTEXITCODE -ne 0) {
    throw "Nao foi possivel normalizar o certificado PEM."
  }

  $keyCleanup = & $openssl pkey -in $temporaryPrivateKey -out $PrivateKeyPemFile 2>&1
  if ($LASTEXITCODE -ne 0) {
    throw "Nao foi possivel normalizar a chave privada PEM."
  }
  Protect-PrivateFile -Path $PrivateKeyPemFile

  & $openssl x509 -in $CertificatePemFile -noout 2>$null
  if ($LASTEXITCODE -ne 0) { throw "O certificado PEM gerado e invalido." }
  & $openssl pkey -in $PrivateKeyPemFile -noout 2>$null
  if ($LASTEXITCODE -ne 0) { throw "A chave privada PEM gerada e invalida." }

  Write-Host "Certificado do Nginx preparado sem exibir senha ou chave privada."
}
finally {
  Remove-Item -LiteralPath $temporaryCertificate -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $temporaryPrivateKey -Force -ErrorAction SilentlyContinue
  $certificateOutput = $null
  $keyOutput = $null
  $certificateCleanup = $null
  $keyCleanup = $null
}
