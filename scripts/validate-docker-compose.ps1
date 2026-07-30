[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
$environmentFile = Join-Path $projectRoot ".env.docker.example"

$json = & docker compose --file (Join-Path $projectRoot "compose.yaml") --env-file $environmentFile config --format json
if ($LASTEXITCODE -ne 0) {
  throw "Docker Compose configuration could not be resolved."
}
$config = $json | ConvertFrom-Json
$database = $config.services.db
$api = $config.services.api
$backup = $config.services.backup
$apiPort = @($api.ports) | Select-Object -First 1

$checks = [ordered]@{
  DatabaseHasNoPublishedPorts = ($null -eq $database.ports -or @($database.ports).Count -eq 0)
  DatabaseUsesPostgres18VolumePath = [bool](
    @($database.volumes) | Where-Object { $_.target -eq "/var/lib/postgresql" }
  )
  ApiBindsLoopbackByDefault = ($apiPort.host_ip -eq "127.0.0.1")
  ApiWaitsForMigration = (
    $api.depends_on.migrate.condition -eq "service_completed_successfully"
  )
  BackupIncludesAssets = [bool](
    @($backup.volumes) | Where-Object { $_.target -eq "/assets" -and $_.read_only }
  )
  DatabasePasswordUsesSecretFile = (
    $database.environment.POSTGRES_PASSWORD_FILE -eq "/run/secrets/postgres_admin_password"
  )
  ApplicationIsNotDatabaseSuperuser = (
    $database.environment.POSTGRES_USER -ne $api.environment.PGUSER
  )
  ApplicationPasswordUsesSeparateSecret = (
    $api.environment.PGPASSWORD_FILE -eq "/run/secrets/postgres_app_password" -and
    @($api.secrets).source -contains "postgres_app_password"
  )
}

$failed = @($checks.GetEnumerator() | Where-Object { -not $_.Value })
if ($failed.Count -gt 0) {
  $names = ($failed | ForEach-Object Key) -join ", "
  throw "Docker Compose security validation failed: $names"
}

Write-Host "Docker Compose security validation passed ($($checks.Count) checks)."
