#!/usr/bin/env bash
set -Eeuo pipefail

# Интерактивный установщик WSChat для VPS.
# Домены и сайты FastPanel создаются вручную через интерфейс FastPanel.

PROJECT_NAME="WSChat"
DEFAULT_PROJECT_ROOT="/opt/ws-chat"
DEFAULT_REPO_URL="https://github.com/viktor138irk/chat.git"
DEFAULT_NODE_MAJOR="20"
DEFAULT_BACKEND_HOST="127.0.0.1"
DEFAULT_BACKEND_PORT="3000"
DEFAULT_PM2_PROCESS="wschat-backend"

STEP=0
TOTAL_STEPS=13
LOG_FILE="/tmp/wschat-install-$(date +%Y%m%d-%H%M%S).log"

PROJECT_ROOT="${PROJECT_ROOT:-$DEFAULT_PROJECT_ROOT}"
SOURCE_PATH="${SOURCE_PATH:-$PROJECT_ROOT/source}"
DATA_PATH="${DATA_PATH:-$PROJECT_ROOT/data}"
LOGS_PATH="${LOGS_PATH:-$PROJECT_ROOT/logs}"
BACKUPS_PATH="${BACKUPS_PATH:-$PROJECT_ROOT/backups}"
UPDATES_PATH="${UPDATES_PATH:-$PROJECT_ROOT/updates}"
REPO_URL="${REPO_URL:-$DEFAULT_REPO_URL}"
NODE_MAJOR="${NODE_MAJOR:-$DEFAULT_NODE_MAJOR}"
BACKEND_HOST="${BACKEND_HOST:-$DEFAULT_BACKEND_HOST}"
BACKEND_PORT="${BACKEND_PORT:-$DEFAULT_BACKEND_PORT}"
PM2_PROCESS_NAME="${PM2_PROCESS_NAME:-$DEFAULT_PM2_PROCESS}"

ADMIN_DOMAIN="${ADMIN_DOMAIN:-admin.example.ru}"
WIDGET_DOMAIN="${WIDGET_DOMAIN:-widget.example.ru}"
API_DOMAIN="${API_DOMAIN:-api.example.ru}"
ADMIN_WEBROOT="${ADMIN_WEBROOT:-}"
WIDGET_WEBROOT="${WIDGET_WEBROOT:-}"
TELEGRAM_BOT_TOKEN="${TELEGRAM_BOT_TOKEN:-}"
JWT_SECRET="${JWT_SECRET:-}"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m'

log() {
  printf "%s\n" "$*" | tee -a "$LOG_FILE"
}

ok() {
  printf "${GREEN}%s${NC}\n" "$*" | tee -a "$LOG_FILE"
}

warn() {
  printf "${YELLOW}%s${NC}\n" "$*" | tee -a "$LOG_FILE"
}

fail() {
  printf "${RED}%s${NC}\n" "$*" | tee -a "$LOG_FILE" >&2
}

current_step() {
  STEP=$((STEP + 1))
  printf "\n${BOLD}${BLUE}[%02d/%02d] %s${NC}\n" "$STEP" "$TOTAL_STEPS" "$1" | tee -a "$LOG_FILE"
}

run() {
  log "→ $*"
  "$@" 2>&1 | tee -a "$LOG_FILE"
}

on_error() {
  local exit_code=$?
  fail ""
  fail "Установка остановлена на шаге ${STEP}/${TOTAL_STEPS}. Код ошибки: ${exit_code}"
  fail "Файл лога: ${LOG_FILE}"
  fail "Последняя выполняемая задача показана выше. Исправь ошибку и запусти установщик повторно."
  exit "$exit_code"
}
trap on_error ERR

ask() {
  local prompt="$1"
  local default_value="$2"
  local result
  read -r -p "$(printf "${BOLD}%s${NC} [%s]: " "$prompt" "$default_value")" result
  if [[ -z "$result" ]]; then
    printf "%s" "$default_value"
  else
    printf "%s" "$result"
  fi
}

ask_secret() {
  local prompt="$1"
  local result
  read -r -s -p "$(printf "${BOLD}%s${NC}: " "$prompt")" result
  printf "\n" >&2
  printf "%s" "$result"
}

generate_secret() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex 32
  else
    date +%s%N | sha256sum | awk '{print $1}'
  fi
}

require_root() {
  if [[ "${EUID}" -ne 0 ]]; then
    fail "Запусти установщик от root: bash deploy/vps/install.sh"
    exit 1
  fi
}

validate_fastpanel_path() {
  local label="$1"
  local path="$2"
  if [[ -z "$path" ]]; then
    warn "$label webroot не указан. Публикация статики будет пропущена."
    return 0
  fi
  if [[ "$path" != /var/www/*/data/www/* ]]; then
    fail "$label webroot должен выглядеть так: /var/www/<fastpanel-user>/data/www/<domain>"
    fail "Получено: $path"
    return 1
  fi
}

write_backend_env() {
  local env_file="$SOURCE_PATH/backend/.env"
  cat > "$env_file" <<EOF
APP_ENV=production
APP_HOST=${BACKEND_HOST}
APP_PORT=${BACKEND_PORT}
PUBLIC_API_URL=https://${API_DOMAIN}
PUBLIC_WS_URL=wss://${API_DOMAIN}/ws
TRUST_PROXY=true

DATABASE_PATH=${DATA_PATH}/chat.sqlite

ADMIN_ORIGIN=https://${ADMIN_DOMAIN}
WIDGET_ORIGIN=https://${WIDGET_DOMAIN}

TELEGRAM_BOT_TOKEN=${TELEGRAM_BOT_TOKEN}
TELEGRAM_PROXY_ENABLED=false
TELEGRAM_PROXY_TYPE=socks5
TELEGRAM_PROXY_HOST=127.0.0.1
TELEGRAM_PROXY_PORT=9050
TELEGRAM_PROXY_USERNAME=
TELEGRAM_PROXY_PASSWORD=

JWT_SECRET=${JWT_SECRET}

FRONTEND_DEPLOY_ENABLED=false
FRONTEND_DEPLOY_MODE=manual-fastpanel
FASTPANEL_SAFE_MODE=true
EOF
  chmod 600 "$env_file"
}

write_install_state() {
  cat > "$PROJECT_ROOT/install-state.env" <<EOF
PROJECT_NAME=${PROJECT_NAME}
PROJECT_ROOT=${PROJECT_ROOT}
SOURCE_PATH=${SOURCE_PATH}
DATA_PATH=${DATA_PATH}
LOGS_PATH=${LOGS_PATH}
BACKUPS_PATH=${BACKUPS_PATH}
UPDATES_PATH=${UPDATES_PATH}
ADMIN_DOMAIN=${ADMIN_DOMAIN}
WIDGET_DOMAIN=${WIDGET_DOMAIN}
API_DOMAIN=${API_DOMAIN}
ADMIN_WEBROOT=${ADMIN_WEBROOT}
WIDGET_WEBROOT=${WIDGET_WEBROOT}
BACKEND_HOST=${BACKEND_HOST}
BACKEND_PORT=${BACKEND_PORT}
PM2_PROCESS_NAME=${PM2_PROCESS_NAME}
FASTPANEL_SAFE_MODE=true
EOF
  chmod 600 "$PROJECT_ROOT/install-state.env"
}

print_header() {
  clear || true
  printf "${BOLD}${BLUE}Интерактивный установщик WSChat для VPS${NC}\n"
  printf "Сайты и домены FastPanel создаются вручную. Установщик не меняет конфиги FastPanel.\n"
  printf "Файл лога: %s\n\n" "$LOG_FILE"
}

print_summary() {
  cat <<EOF

${BOLD}Сводка настроек${NC}
Каталог проекта:       ${PROJECT_ROOT}
Каталог исходников:    ${SOURCE_PATH}
Каталог данных:        ${DATA_PATH}
Домен админки:         ${ADMIN_DOMAIN}
Домен виджета:         ${WIDGET_DOMAIN}
Домен API:             ${API_DOMAIN}
Backend:               http://${BACKEND_HOST}:${BACKEND_PORT}
PM2-процесс:           ${PM2_PROCESS_NAME}
Webroot админки:       ${ADMIN_WEBROOT:-не указан}
Webroot виджета:       ${WIDGET_WEBROOT:-не указан}
Telegram token:        $(if [[ -n "$TELEGRAM_BOT_TOKEN" ]]; then echo "указан"; else echo "пусто"; fi)

EOF
}

install_packages() {
  run apt update
  run apt install -y git curl rsync sqlite3 ca-certificates gnupg build-essential python3 make g++ openssl
}

install_node() {
  if command -v node >/dev/null 2>&1 && node -v | grep -q "^v${NODE_MAJOR}\."; then
    ok "Node.js уже установлен: $(node -v)"
    return 0
  fi
  run bash -c "curl -fsSL https://deb.nodesource.com/setup_${NODE_MAJOR}.x | bash -"
  run apt install -y nodejs
  ok "Node.js: $(node -v)"
  ok "npm: $(npm -v)"
}

install_pm2() {
  if command -v pm2 >/dev/null 2>&1; then
    ok "PM2 уже установлен: $(pm2 -v)"
  else
    run npm install -g pm2
    ok "PM2 установлен: $(pm2 -v)"
  fi
}

clone_or_update_repo() {
  mkdir -p "$PROJECT_ROOT"
  if [[ -d "$SOURCE_PATH/.git" ]]; then
    cd "$SOURCE_PATH"
    run git fetch origin main
    run git pull --ff-only origin main
  else
    mkdir -p "$(dirname "$SOURCE_PATH")"
    run git clone "$REPO_URL" "$SOURCE_PATH"
  fi
}

install_dependencies() {
  cd "$SOURCE_PATH"
  run npm install
}

start_backend_pm2() {
  cd "$SOURCE_PATH"
  if pm2 describe "$PM2_PROCESS_NAME" >/dev/null 2>&1; then
    run pm2 restart "$PM2_PROCESS_NAME" --update-env
  else
    run pm2 start backend/src/server.js --name "$PM2_PROCESS_NAME"
  fi
  run pm2 save
  pm2 startup systemd -u root --hp /root 2>&1 | tee -a "$LOG_FILE" || true
}

check_backend() {
  sleep 2
  run curl -fsS "http://${BACKEND_HOST}:${BACKEND_PORT}/health"
}

build_frontend() {
  cd "$SOURCE_PATH"
  run npm run build:admin
  run npm run build:widget
}

publish_static_if_configured() {
  cd "$SOURCE_PATH"
  if [[ -n "$ADMIN_WEBROOT" ]]; then
    if [[ ! -d "$ADMIN_WEBROOT" ]]; then
      warn "Webroot админки не найден: $ADMIN_WEBROOT"
      warn "Публикация админки пропущена. Сначала создай сайт в FastPanel вручную."
    else
      run rsync -av --delete admin-panel/dist/ "$ADMIN_WEBROOT/"
    fi
  fi

  if [[ -n "$WIDGET_WEBROOT" ]]; then
    if [[ ! -d "$WIDGET_WEBROOT" ]]; then
      warn "Webroot виджета не найден: $WIDGET_WEBROOT"
      warn "Публикация виджета пропущена. Сначала создай сайт в FastPanel вручную."
    else
      run rsync -av --delete widget/dist/ "$WIDGET_WEBROOT/"
    fi
  fi
}

main() {
  print_header
  require_root

  current_step "Сбор настроек установки"
  PROJECT_ROOT="$(ask "Каталог проекта" "$PROJECT_ROOT")"
  SOURCE_PATH="${PROJECT_ROOT}/source"
  DATA_PATH="${PROJECT_ROOT}/data"
  LOGS_PATH="${PROJECT_ROOT}/logs"
  BACKUPS_PATH="${PROJECT_ROOT}/backups"
  UPDATES_PATH="${PROJECT_ROOT}/updates"

  ADMIN_DOMAIN="$(ask "Домен админки" "$ADMIN_DOMAIN")"
  WIDGET_DOMAIN="$(ask "Домен виджета" "$WIDGET_DOMAIN")"
  API_DOMAIN="$(ask "Домен API" "$API_DOMAIN")"
  ADMIN_WEBROOT="$(ask "Webroot админки в FastPanel, оставь пустым чтобы пропустить публикацию" "$ADMIN_WEBROOT")"
  WIDGET_WEBROOT="$(ask "Webroot виджета в FastPanel, оставь пустым чтобы пропустить публикацию" "$WIDGET_WEBROOT")"
  TELEGRAM_BOT_TOKEN="$(ask_secret "Telegram bot token, можно оставить пустым")"
  JWT_SECRET="$(ask "JWT secret" "$(generate_secret)")"

  validate_fastpanel_path "Admin" "$ADMIN_WEBROOT"
  validate_fastpanel_path "Widget" "$WIDGET_WEBROOT"
  print_summary
  read -r -p "Продолжить установку? [Y/n]: " confirm
  if [[ "$confirm" =~ ^[Nn]$ ]]; then
    warn "Установка отменена."
    exit 0
  fi

  current_step "Установка базовых пакетов"
  install_packages

  current_step "Установка Node.js"
  install_node

  current_step "Установка PM2"
  install_pm2

  current_step "Создание каталогов WSChat"
  mkdir -p "$PROJECT_ROOT" "$DATA_PATH" "$LOGS_PATH" "$BACKUPS_PATH" "$UPDATES_PATH"
  ok "Каталоги созданы в $PROJECT_ROOT"

  current_step "Клонирование или обновление репозитория"
  clone_or_update_repo

  current_step "Установка зависимостей проекта"
  install_dependencies

  current_step "Запись backend .env"
  write_backend_env
  write_install_state
  ok "Backend .env записан: $SOURCE_PATH/backend/.env"
  ok "Состояние установки записано: $PROJECT_ROOT/install-state.env"

  current_step "Запуск backend через PM2"
  start_backend_pm2

  current_step "Проверка backend health"
  check_backend

  current_step "Сборка админки и виджета"
  build_frontend

  current_step "Публикация статики, если webroot указан"
  publish_static_if_configured

  current_step "Инструкция для proxy в FastPanel"
  cat <<EOF | tee -a "$LOG_FILE"

Создай и настрой сайты вручную в FastPanel:
- https://${ADMIN_DOMAIN}
- https://${WIDGET_DOMAIN}
- https://${API_DOMAIN}

Настрой ${API_DOMAIN} как reverse proxy на:
  http://${BACKEND_HOST}:${BACKEND_PORT}

Путь WebSocket /ws должен поддерживать Upgrade headers.

Типовые Nginx location-блоки:

location /ws {
    proxy_pass http://${BACKEND_HOST}:${BACKEND_PORT}/ws;
    proxy_http_version 1.1;
    proxy_set_header Upgrade \$http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
}

location / {
    proxy_pass http://${BACKEND_HOST}:${BACKEND_PORT};
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
}

EOF

  current_step "Завершение"
  ok "Установка backend WSChat завершена."
  ok "Локальная проверка backend: http://${BACKEND_HOST}:${BACKEND_PORT}/health"
  ok "PM2-процесс: ${PM2_PROCESS_NAME}"
  ok "Файл лога: ${LOG_FILE}"
  warn "Следующий шаг: настрой proxy API-домена в FastPanel и проверь https://${API_DOMAIN}/health"
}

main "$@"
