#!/bin/sh
set -u

case "${BACKUP_INTERVAL_SECONDS:-86400}" in
  *[!0-9]*|"") echo "Invalid backup interval."; exit 2 ;;
esac

while true; do
  if ! /bin/sh /opt/linkgov/backup-once.sh; then
    echo "Backup attempt failed; retrying after the configured interval."
  fi
  sleep "${BACKUP_INTERVAL_SECONDS:-86400}"
done
