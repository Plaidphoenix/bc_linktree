#!/bin/sh
set -eu

application_database="${LINKGOV_DATABASE:-linkgov}"
application_user="${LINKGOV_USER:-linkgov}"
password_file="${LINKGOV_PASSWORD_FILE:-/run/secrets/postgres_app_password}"

case "$application_database" in
  *[!a-z0-9_]*|"") echo "Invalid application database name."; exit 2 ;;
esac
case "$application_user" in
  *[!a-z0-9_]*|"") echo "Invalid application database user."; exit 2 ;;
esac

application_password="$(cat "$password_file")"
case "$application_password" in
  *[!A-Za-z0-9_-]*|"") echo "Invalid application database secret."; exit 2 ;;
esac

psql \
  --set ON_ERROR_STOP=1 \
  --username "$POSTGRES_USER" \
  --dbname postgres <<EOSQL
CREATE ROLE ${application_user}
  LOGIN
  PASSWORD '${application_password}'
  NOSUPERUSER
  NOCREATEDB
  NOCREATEROLE
  NOREPLICATION;
CREATE DATABASE ${application_database}
  OWNER ${application_user}
  ENCODING 'UTF8'
  TEMPLATE template0;
EOSQL

unset application_password
echo "LinkGov application database initialized."
