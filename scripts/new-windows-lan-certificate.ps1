[CmdletBinding()]
param(
  [string]$DnsName = "",
  [string]$IpAddress = "",
  [ValidateRange(1, 90)]
  [int]$ValidDays = 30,
  [switch]$Force
)

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
$certificateDirectory = Join-Path $projectRoot "local-data\certificates"
$pfxFile = Join-Path $certificateDirectory "linkgov-lan.pfx"
$passwordFile = Join-Path $certificateDirectory "linkgov-lan.password"
$publicCertificateFile = Join-Path $certificateDirectory "linkgov-lan.cer"
$metadataFile = Join-Path $certificateDirectory "linkgov-lan.json"

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

if (-not $DnsName) {
  $DnsName = [System.Net.Dns]::GetHostEntry($env:COMPUTERNAME).HostName
}
if (-not $IpAddress) {
  $IpAddress = Get-NetIPConfiguration |
    Where-Object { $_.IPv4DefaultGateway -and $_.IPv4Address.IPAddress -notlike "169.254.*" } |
    Select-Object -First 1 -ExpandProperty IPv4Address |
    Select-Object -ExpandProperty IPAddress
}

$parsedAddress = $null
if (-not [System.Net.IPAddress]::TryParse($IpAddress, [ref]$parsedAddress)) {
  throw "Nao foi possivel identificar um IPv4 valido para o certificado."
}
if (-not $DnsName -or $DnsName -notmatch "^[A-Za-z0-9.-]+$") {
  throw "O nome DNS informado e invalido."
}

$existingFiles = @($pfxFile, $passwordFile, $publicCertificateFile, $metadataFile) |
  Where-Object { Test-Path -LiteralPath $_ -PathType Leaf }
if ($existingFiles.Count -gt 0 -and -not $Force) {
  if ($existingFiles.Count -ne 4) {
    throw "A configuracao de certificado esta incompleta. Revise local-data/certificates ou use -Force."
  }
  Write-Host "Certificado existente preservado. Use -Force somente para substitui-lo conscientemente."
  Get-Content -Raw -LiteralPath $metadataFile
  exit 0
}

New-Item -ItemType Directory -Force -Path $certificateDirectory | Out-Null

$rsa = [System.Security.Cryptography.RSA]::Create(3072)
$certificate = $null
try {
  $request = [System.Security.Cryptography.X509Certificates.CertificateRequest]::new(
    "CN=$DnsName",
    $rsa,
    [System.Security.Cryptography.HashAlgorithmName]::SHA256,
    [System.Security.Cryptography.RSASignaturePadding]::Pkcs1
  )
  $request.CertificateExtensions.Add(
    [System.Security.Cryptography.X509Certificates.X509BasicConstraintsExtension]::new($false, $false, 0, $true)
  )
  $request.CertificateExtensions.Add(
    [System.Security.Cryptography.X509Certificates.X509KeyUsageExtension]::new(
      [System.Security.Cryptography.X509Certificates.X509KeyUsageFlags]::DigitalSignature,
      $true
    )
  )
  $serverAuthentication = [System.Security.Cryptography.OidCollection]::new()
  [void]$serverAuthentication.Add([System.Security.Cryptography.Oid]::new("1.3.6.1.5.5.7.3.1"))
  $request.CertificateExtensions.Add(
    [System.Security.Cryptography.X509Certificates.X509EnhancedKeyUsageExtension]::new(
      $serverAuthentication,
      $true
    )
  )
  $subjectAlternativeNames = [System.Security.Cryptography.X509Certificates.SubjectAlternativeNameBuilder]::new()
  $subjectAlternativeNames.AddDnsName($DnsName)
  $subjectAlternativeNames.AddDnsName($env:COMPUTERNAME)
  $subjectAlternativeNames.AddIpAddress($parsedAddress)
  $request.CertificateExtensions.Add($subjectAlternativeNames.Build())

  $certificate = $request.CreateSelfSigned(
    [DateTimeOffset]::UtcNow.AddMinutes(-5),
    [DateTimeOffset]::UtcNow.AddDays($ValidDays)
  )

  $passwordBytes = New-Object byte[] 32
  $random = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  try {
    $random.GetBytes($passwordBytes)
  }
  finally {
    $random.Dispose()
  }
  $password = [Convert]::ToBase64String($passwordBytes).TrimEnd("=").Replace("+", "-").Replace("/", "_")
  $utf8WithoutBom = [System.Text.UTF8Encoding]::new($false)

  [System.IO.File]::WriteAllBytes(
    $pfxFile,
    $certificate.Export(
      [System.Security.Cryptography.X509Certificates.X509ContentType]::Pfx,
      $password
    )
  )
  [System.IO.File]::WriteAllText($passwordFile, $password, $utf8WithoutBom)
  [System.IO.File]::WriteAllBytes(
    $publicCertificateFile,
    $certificate.Export([System.Security.Cryptography.X509Certificates.X509ContentType]::Cert)
  )

  Protect-PrivateFile -Path $pfxFile
  Protect-PrivateFile -Path $passwordFile

  $sha256 = [System.Security.Cryptography.SHA256]::Create()
  try {
    $fingerprint = ($sha256.ComputeHash($certificate.RawData) | ForEach-Object { $_.ToString("X2") }) -join ":"
  }
  finally {
    $sha256.Dispose()
  }

  $metadata = [ordered]@{
    dnsName = $DnsName
    ipAddress = $IpAddress
    notBefore = $certificate.NotBefore.ToUniversalTime().ToString("o")
    notAfter = $certificate.NotAfter.ToUniversalTime().ToString("o")
    sha256Fingerprint = $fingerprint
    publicCertificate = $publicCertificateFile
  }
  [System.IO.File]::WriteAllText(
    $metadataFile,
    ($metadata | ConvertTo-Json),
    $utf8WithoutBom
  )

  Write-Host "Certificado HTTPS de homologacao criado sem instalar confianca no Windows."
  Write-Host "DNS: $DnsName"
  Write-Host "IPv4: $IpAddress"
  Write-Host "Valido ate: $($certificate.NotAfter.ToString('u'))"
  Write-Host "SHA-256: $fingerprint"
  Write-Host "Certificado publico: $publicCertificateFile"
}
finally {
  if ($certificate) {
    $certificate.Dispose()
  }
  $rsa.Dispose()
}
