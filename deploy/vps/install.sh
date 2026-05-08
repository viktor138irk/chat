#!/usr/bin/env bash
set -Eeuo pipefail

# WSChat interactive VPS installer.
# FastPanel domains/sites must be created manually in FastPanel UI.

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

info() {
  printf "${BLUE}%s${NC}\n" "$*" | tee -a "$LOG_FILE"
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
  fail "Installation failed on step ${STEP}/${TOTAL_STEPS}. Exit code: ${exit_code}"
  fail "Log file: ${LOG_FILE}"
  fail "Last task should be visible above. Fix the error and rerun installer."
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
    fail "Run as root: bash deploy/vps/install.sh"
    exit 1
  fi
}

validate_fastpanel_path() {
  local label="$1"
  local path="$2"
  if [[ -z "$path" ]]; then
    warn "$label webroot is empty. Static publishing will be skipped."
    return 0
  fi
  if [[ "$path" != /var/www/*/data/www/* ]]; then
    fail "$label webroot must look like /var/www/<fastpanel-user>/data/www/<domain>"
    fail "Got: $path"
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
  printf "${BOLD}${BLUE}WSChat interactive VPS installer${NC}\n"
  printf "FastPanel sites/domains are created manually. This installer will not edit FastPanel configs.\n"
  printf "Log file: %s\n\n" "$LOG_FILE"
}

print_summary() {
  cat <<EOF

${BOLD}Configuration summary${NC}
Project root:      ${PROJECT_ROOT}
Source path:       ${SOURCE_PATH}
Data path:         ${DATA_PATH}
Admin domain:      ${ADMIN_DOMAIN}
Widget domain:     ${WIDGET_DOMAIN}
API domain:        ${API_DOMAIN}
Backend:           http://${BACKEND_HOST}:${BACKEND_PORT}
PM2 process:       ${PM2_PROCESS_NAME}
Admin webroot:     ${ADMIN_WEBROOT:-not set}
Widget webroot:    ${WIDGET_WEBROOT:-not set}
Telegram token:    $(if [[ -n "$TELEGRAM_BOT_TOKEN" ]]; then echo "set"; else echo "empty"; fi)

EOF
}

install_packages() {
  run apt update
  run apt install -y git curl rsync sqlite3 ca-certificates gnupg build-essential python3 make g++ openssl
}

install_node() {
  if command -v node >/dev/null 2>&1 && node -v | grep -q "^v${NODE_MAJOR}\."; then
    ok "Node.js already installed: $(node -v)"
    return 0
  fi
  run bash -c "curl -fsSL https://deb.nodesource.com/setup_${NODE_MAJOR}.x | bash -"
  run apt install -y nodejs
  ok "Node.js: $(node -v)"
  ok "npm: $(npm -v)"
}

install_pm2() {
  if command -v pm2 >/dev/null 2>&1; then
    ok "PM2 already installed: $(pm2 -v)"
  else
    run npm install -g pm2
    ok "PM2 installed: $(pm2 -v)"
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
      warn "Admin webroot does not exist: $ADMIN_WEBROOT"
      warn "Skipping admin publish. Create the site manually in FastPanel first."
    else
      run rsync -av --delete admin-panel/dist/ "$ADMIN_WEBROOT/"
    fi
  fi

  if [[ -n "$WIDGET_WEBROOT" ]]; then
    if [[ ! -d "$WIDGET_WEBROOT" ]]; then
      warn "Widget webroot does not exist: $WIDGET_WEBROOT"
      warn "Skipping widget publish. Create the site manually in FastPanel first."
    else
      run rsync -av --delete widget/dist/ "$WIDGET_WEBROOT/"
    fi
  fi
}

main() {
  print_header
  require_root

  current_step "Collect configuration"
  PROJECT_ROOT="$(ask "Project directory" "$PROJECT_ROOT")"
  SOURCE_PATH="${PROJECT_ROOT}/source"
  DATA_PATH="${PROJECT_ROOT}/data"
  LOGS_PATH="${PROJECT_ROOT}/logs"
  BACKUPS_PATH="${PROJECT_ROOT}/backups"
  UPDATES_PATH="${PROJECT_ROOT}/updates"

  ADMIN_DOMAIN="$(ask "Admin domain" "$ADMIN_DOMAIN")"
  WIDGET_DOMAIN="$(ask "Widget domain" "$WIDGET_DOMAIN")"
  API_DOMAIN="$(ask "API domain" "$API_DOMAIN")"
  ADMIN_WEBROOT="$(ask "Admin FastPanel webroot, leave empty to skip publishing" "$ADMIN_WEBROOT")"
  WIDGET_WEBROOT="$(ask "Widget FastPanel webroot, leave empty to skip publishing" "$WIDGET_WEBROOT")"
  TELEGRAM_BOT_TOKEN="$(ask_secret "Telegram bot token, leave empty for now")"
  JWT_SECRET="$(ask "JWT secret" "$(generate_secret)")"

  validate_fastpanel_path "Admin" "$ADMIN_WEBROOT"
  validate_fastpanel_path "Widget" "$WIDGET_WEBROOT"
  print_summary
  read -r -p "Continue installation? [Y/n]: " confirm
  if [[ "$confirm" =~ ^[Nn]$ ]]; then
    warn "Installation cancelled."
    exit 0
  fi

  current_step "Install base packages"
  install_packages

  current_step "Install Node.js"
  install_node

  current_step "Install PM2"
  install_pm2

  current_step "Create WSChat directories"
  mkdir -p "$PROJECT_ROOT" "$DATA_PATH" "$LOGS_PATH" "$BACKUPS_PATH" "$UPDATES_PATH"
  ok "Directories created under $PROJECT_ROOT"

  current_step "Clone or update repository"
  clone_or_update_repo

  current_step "Install project dependencies"
  install_dependencies

  current_step "Write backend .env"
  write_backend_env
  write_install_state
  ok "Backend env written to $SOURCE_PATH/backend/.env"
  ok "Install state written to $PROJECT_ROOT/install-state.env"

  current_step "Start backend with PM2"
  start_backend_pm2

  current_step "Check backend health"
  check_backend

  current_step "Build admin and widget"
  build_frontend

  current_step "Publish static files if webroots are configured"
  publish_static_if_configured

  current_step "Print FastPanel proxy instructions"
  cat <<EOF | tee -a "$LOG_FILE"

Create/configure sites manually in FastPanel:
- https://${ADMIN_DOMAIN}
- https://${WIDGET_DOMAIN}
- https://${API_DOMAIN}

Configure ${API_DOMAIN} as reverse proxy to:
  http://${BACKEND_HOST}:${BACKEND_PORT}

WebSocket path /ws must support Upgrade headers.

Typical Nginx locations:

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

  current_step "Finish"
  ok "WSChat backend installation finished."
  ok "Backend local health: http://${BACKEND_HOST}:${BACKEND_PORT}/health"
  ok "PM2 process: ${PM2_PROCESS_NAME}"
  ok "Log file: ${LOG_FILE}"
  warn "Next: configure api domain proxy in FastPanel, then check https://${API_DOMAIN}/health"
}

main "$@"
