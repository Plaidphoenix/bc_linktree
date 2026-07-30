[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [ValidateSet("start", "migrate", "bootstrap-admin")]
  [string]$Command
)

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
$environmentFile = Join-Path $projectRoot ".env.municipal"
$entries = @{
  "start" = "index.mjs"
  "migrate" = "migrate.mjs"
  "bootstrap-admin" = "bootstrap-admin.mjs"
}
$entry = Join-Path $projectRoot "dist-server\$($entries[$Command])"

if (-not (Test-Path -LiteralPath $environmentFile -PathType Leaf)) {
  throw ".env.municipal is missing. Provision the local database first."
}
if (-not (Test-Path -LiteralPath $entry -PathType Leaf)) {
  throw "Municipal build is missing. Run npm run build:selfhosted first."
}

$nodeCandidates = @(
  (Join-Path $projectRoot "tmp\node22\node_modules\node\bin\node.exe"),
  (Get-Command node -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source -ErrorAction SilentlyContinue)
) | Where-Object { $_ -and (Test-Path -LiteralPath $_ -PathType Leaf) }

$node = $nodeCandidates | Where-Object {
  $version = & $_ --version
  [int](($version -replace "^v", "").Split(".")[0]) -ge 22
} | Select-Object -First 1

if (-not $node) {
  throw "Node.js 22 or newer is required."
}

& $node --env-file=$environmentFile $entry
exit $LASTEXITCODE
