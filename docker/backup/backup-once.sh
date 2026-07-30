#!/bin/sh
set -eu

umask 077

case "${BACKUP_RETENTION_DAYS:-14}" in
  *[!0-9]*|"") echo "Invalid backup retention."; exit 2 ;;
esac

lock_directory="/backups/.backup-lock"
if ! mkdir "$lock_directory" 2>/dev/null; then
  if [ -s "$lock_directory/pid" ] && kill -0 "$(cat "$lock_directory/pid")" 2>/dev/null; then
    echo "A backup is already running."
    exit 3
  fi
  rm -rf "$lock_directory"
  mkdir "$lock_directory"
fi
echo "$$" > "$lock_directory/pid"

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
prefix="/backups/linkgov-${timestamp}"
dump_temporary="${prefix}.dump.tmp"
assets_temporary="${prefix}-assets.tar.gz.tmp"
manifest_temporary="${prefix}.sha256.tmp"

cleanup() {
  unset PGPASSWORD
  rm -f "$dump_temporary" "$assets_temporary" "$manifest_temporary"
  rm -rf "$lock_directory"
}
trap cleanup EXIT INT TERM

export PGPASSWORD="$(cat "${PGPASSWORD_FILE:-/run/secrets/postgres_app_password}")"

pg_dump \
  --host="${PGHOST:-db}" \
  --port="${PGPORT:-5432}" \
  --username="${PGUSER:-linkgov}" \
  --dbname="${PGDATABASE:-linkgov}" \
  --format=custom \
  --compress=6 \
  --no-owner \
  --no-privileges \
  --file="$dump_temporary"

tar -czf "$assets_temporary" -C /assets .

mv "$dump_temporary" "${prefix}.dump"
mv "$assets_temporary" "${prefix}-assets.tar.gz"
sha256sum "${prefix}.dump" "${prefix}-assets.tar.gz" > "$manifest_temporary"
mv "$manifest_temporary" "${prefix}.sha256"
date -u +%Y-%m-%dT%H:%M:%SZ > /backups/.last-success

find /backups -maxdepth 1 -type f -name 'linkgov-*.dump' \
  -mtime "+${BACKUP_RETENTION_DAYS}" -delete
find /backups -maxdepth 1 -type f -name 'linkgov-*-assets.tar.gz' \
  -mtime "+${BACKUP_RETENTION_DAYS}" -delete
find /backups -maxdepth 1 -type f -name 'linkgov-*.sha256' \
  -mtime "+${BACKUP_RETENTION_DAYS}" -delete

echo "Backup completed: linkgov-${timestamp}"
