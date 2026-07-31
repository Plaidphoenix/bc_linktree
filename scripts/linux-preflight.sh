#!/bin/sh
set -u

environment_file="${1:-.env.docker}"
failures=0

pass() {
  printf 'PASS: %s\n' "$1"
}

warn() {
  printf 'WARN: %s\n' "$1"
}

fail() {
  printf 'FAIL: %s\n' "$1"
  failures=$((failures + 1))
}

require_command() {
  if command -v "$1" >/dev/null 2>&1; then
    pass "Comando disponivel: $1"
  else
    fail "Comando ausente: $1"
  fi
}

read_setting() {
  awk -F= -v key="$1" '$1 == key { sub(/^[^=]*=/, ""); print; exit }' "$environment_file"
}

if [ "$(uname -s 2>/dev/null || true)" = "Linux" ]; then
  pass "Sistema operacional Linux"
else
  fail "Este preflight deve ser executado no servidor Linux"
fi

if [ -r /etc/os-release ]; then
  # shellcheck disable=SC1091
  . /etc/os-release
  printf 'INFO: Distribuicao: %s\n' "${PRETTY_NAME:-desconhecida}"
else
  fail "Nao foi possivel identificar a distribuicao em /etc/os-release"
fi

require_command docker
require_command openssl
require_command awk
require_command grep
require_command stat
require_command df

if command -v docker >/dev/null 2>&1; then
  engine_name="$(docker info --format '{{.OperatingSystem}}' 2>/dev/null || true)"
  if [ -z "$engine_name" ]; then
    fail "Docker Engine nao respondeu; nenhuma instalacao foi tentada"
  elif printf '%s' "$engine_name" | grep -qi 'Docker Desktop'; then
    fail "Docker Desktop nao e o runtime aprovado para o servidor municipal"
  else
    pass "Docker Engine respondeu: $engine_name"
  fi

  if docker compose version >/dev/null 2>&1; then
    pass "Plugin Docker Compose disponivel"
  else
    fail "Plugin Docker Compose ausente"
  fi
fi

if [ -f "$environment_file" ]; then
  pass "Arquivo de ambiente encontrado: $environment_file"
else
  fail "Arquivo de ambiente ausente: $environment_file"
fi

if [ -f "$environment_file" ]; then
  if [ "$(read_setting LINKGOV_ENVIRONMENT)" = "production" ]; then
    pass "Ambiente configurado como production"
  else
    fail "LINKGOV_ENVIRONMENT deve ser production"
  fi

  for key in LINKGOV_APP_BASE_URL LINKGOV_ADMIN_BASE_URL LINKGOV_ASSET_BASE_URL; do
    value="$(read_setting "$key")"
    case "$value" in
      https://*) pass "$key usa HTTPS" ;;
      *) fail "$key deve usar a URL HTTPS municipal aprovada" ;;
    esac
  done

  if [ "$(read_setting LINKGOV_API_BIND)" = "127.0.0.1" ]; then
    pass "API publicada apenas no loopback do servidor"
  else
    fail "LINKGOV_API_BIND deve permanecer 127.0.0.1 atras do proxy HTTPS"
  fi

  backup_path="$(read_setting LINKGOV_BACKUP_PATH)"
  case "$backup_path" in
    /*) pass "Diretorio de backup usa caminho absoluto" ;;
    *) fail "LINKGOV_BACKUP_PATH deve ser um caminho absoluto fora do repositorio" ;;
  esac

  for setting in \
    LINKGOV_POSTGRES_ADMIN_PASSWORD_FILE \
    LINKGOV_POSTGRES_APP_PASSWORD_FILE \
    LINKGOV_SIM_ENCRYPTION_KEY_FILE; do
    secret_path="$(read_setting "$setting")"
    if [ -f "$secret_path" ]; then
      mode="$(stat -c '%a' "$secret_path" 2>/dev/null || printf '999')"
      group_digit=$((mode / 10 % 10))
      other_digit=$((mode % 10))
      if [ "$group_digit" -eq 0 ] && [ "$other_digit" -eq 0 ]; then
        pass "$setting existe sem permissao para grupo/outros"
      else
        fail "$setting deve usar chmod 600 ou mais restritivo"
      fi
    else
      fail "$setting aponta para um arquivo inexistente"
    fi
  done

  if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
    if docker compose --env-file "$environment_file" config --quiet; then
      pass "Docker Compose resolveu a configuracao de producao"
    else
      fail "Docker Compose rejeitou a configuracao de producao"
    fi
  fi
fi

available_kb="$(df -Pk . 2>/dev/null | awk 'NR == 2 { print $4 }')"
if [ -n "$available_kb" ] && [ "$available_kb" -ge 10485760 ]; then
  pass "Ha pelo menos 10 GiB livres no filesystem atual"
else
  warn "Recomenda-se pelo menos 10 GiB livres antes do build e dos backups"
fi

if [ "$failures" -gt 0 ]; then
  printf 'RESULTADO: BLOQUEADO (%s falha(s)). Nenhuma alteracao foi realizada.\n' "$failures"
  exit 1
fi

printf 'RESULTADO: APROVADO. Nenhuma alteracao foi realizada.\n'
