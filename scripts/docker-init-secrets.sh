#!/bin/sh
set -eu

project_root="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
secret_directory="${project_root}/local-data/secrets"
backup_directory="${project_root}/local-data/backups"

umask 077
mkdir -p "$secret_directory" "$backup_directory"

if [ ! -f "${project_root}/.env.docker" ]; then
  cp "${project_root}/.env.docker.example" "${project_root}/.env.docker"
  echo "Created .env.docker from the non-secret example."
fi

create_secret() {
  name="$1"
  byte_count="$2"
  destination="${secret_directory}/${name}"
  if [ -f "$destination" ]; then
    echo "Preserved existing secret file: ${name}"
    return
  fi
  openssl rand -base64 "$byte_count" | tr '+/' '-_' | tr -d '=\n' > "$destination"
  chmod 600 "$destination"
  echo "Created protected secret file: ${name}"
}

create_secret postgres_admin_password 32
create_secret postgres_app_password 32
create_secret sim_token_encryption_key 32
echo "Docker local state initialized without printing secret values."
