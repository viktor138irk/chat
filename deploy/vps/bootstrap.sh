#!/usr/bin/env bash
set -euo pipefail

NODE_MAJOR="${NODE_MAJOR:-20}"
PROJECT_ROOT="${PROJECT_ROOT:-/opt/ws-chat}"
SOURCE_PATH="${SOURCE_PATH:-/opt/ws-chat/source}"
DATA_PATH="${DATA_PATH:-/opt/ws-chat/data}"
LOGS_PATH="${LOGS_PATH:-/opt/ws-chat/logs}"
BACKUPS_PATH="${BACKUPS_PATH:-/opt/ws-chat/backups}"
UPDATES_PATH="${UPDATES_PATH:-/opt/ws-chat/updates}"
PM2_PROCESS_NAME="${PM2_PROCESS_NAME:-wschat-backend}"

log() {
  printf '\n[wschat-bootstrap] %s\n' "$1"
}

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run this script as root: sudo bash deploy/vps/bootstrap.sh"
  exit 1
fi

log "Installing base packages"
apt update
apt upgrade -y
apt install -y git curl rsync sqlite3 ca-certificates gnupg build-essential python3 make g++

if ! command -v node >/dev/null 2>&1 || ! node -v | grep -q "^v${NODE_MAJOR}\."; then
  log "Installing Node.js ${NODE_MAJOR}.x from NodeSource"
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
  apt install -y nodejs
else
  log "Node.js already installed: $(node -v)"
fi

log "Node version: $(node -v)"
log "NPM version: $(npm -v)"

if ! command -v pm2 >/dev/null 2>&1; then
  log "Installing PM2"
  npm install -g pm2
else
  log "PM2 already installed: $(pm2 -v)"
fi

log "Creating project directories"
mkdir -p "$PROJECT_ROOT" "$DATA_PATH" "$LOGS_PATH" "$BACKUPS_PATH" "$UPDATES_PATH"

if [[ ! -d "$SOURCE_PATH/.git" ]]; then
  log "Source path is not initialized: $SOURCE_PATH"
  echo "Clone repository manually:"
  echo "  mkdir -p $PROJECT_ROOT"
  echo "  git clone https://github.com/viktor138irk/chat.git $SOURCE_PATH"
else
  log "Source found: $SOURCE_PATH"
  cd "$SOURCE_PATH"
  npm install

  if [[ ! -f backend/.env ]]; then
    log "Creating backend/.env from example"
    cp backend/.env.example backend/.env
  fi

  log "Starting/restarting backend with PM2"
  if pm2 describe "$PM2_PROCESS_NAME" >/dev/null 2>&1; then
    pm2 restart "$PM2_PROCESS_NAME" --update-env
  else
    pm2 start backend/src/server.js --name "$PM2_PROCESS_NAME"
  fi
  pm2 save
fi

log "Bootstrap finished"
echo "Next steps:"
echo "1. Create admin/widget/api sites manually in FastPanel"
echo "2. Configure backend/.env"
echo "3. Configure api.example.ru proxy to http://127.0.0.1:3000"
echo "4. Build and publish admin/widget static files"
