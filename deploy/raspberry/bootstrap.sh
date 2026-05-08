#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="${PROJECT_DIR:-$HOME/apps/chat}"
NODE_MAJOR="${NODE_MAJOR:-20}"

log() {
  printf '\n[raspi-chat] %s\n' "$1"
}

if [[ "${EUID}" -eq 0 ]]; then
  echo "Do not run this script as root. Run as the normal Raspberry Pi user."
  exit 1
fi

ARCH="$(dpkg --print-architecture)"

log "Detected architecture: ${ARCH}"
log "Updating system packages"
sudo apt update
sudo apt upgrade -y

log "Installing base packages"
sudo apt install -y git curl sqlite3 ufw fail2ban wireguard rsync ca-certificates gnupg build-essential python3 make g++

install_node_from_debian_repo() {
  log "Installing Node.js from Raspberry Pi/Debian repository for ${ARCH}"
  sudo apt install -y nodejs npm
}

install_node_from_nodesource() {
  log "Installing Node.js ${NODE_MAJOR}.x from NodeSource for ${ARCH}"
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | sudo -E bash -
  sudo apt install -y nodejs
}

if ! command -v node >/dev/null 2>&1; then
  if [[ "${ARCH}" == "armhf" ]]; then
    install_node_from_debian_repo
  else
    install_node_from_nodesource
  fi
else
  log "Node.js already installed: $(node -v)"
fi

log "Node version: $(node -v)"
log "NPM version: $(npm -v)"

if ! command -v pm2 >/dev/null 2>&1; then
  log "Installing PM2"
  sudo npm install -g pm2
else
  log "PM2 already installed"
fi

mkdir -p "$HOME/apps"

if [[ ! -d "$PROJECT_DIR/.git" ]]; then
  log "Project directory not found at $PROJECT_DIR"
  echo "Clone the repository manually:"
  echo "  mkdir -p $HOME/apps"
  echo "  cd $HOME/apps"
  echo "  git clone https://github.com/viktor138irk/chat.git"
else
  log "Project found at $PROJECT_DIR"
  cd "$PROJECT_DIR"
  log "Installing npm dependencies"
  npm install

  if [[ ! -f backend/.env ]]; then
    log "Creating backend/.env from example"
    cp backend/.env.example backend/.env
    echo "Edit backend/.env before production run."
  fi

  mkdir -p backend/data
fi

log "Configuring UFW firewall"
sudo ufw default deny incoming
sudo ufw default allow outgoing

# Allow SSH from common private LAN ranges. Adjust later if needed.
sudo ufw allow from 192.168.0.0/16 to any port 22 proto tcp
sudo ufw allow from 10.0.0.0/8 to any port 22 proto tcp
sudo ufw allow from 172.16.0.0/12 to any port 22 proto tcp

# Backend should be reachable only from VPS over WireGuard.
# Default VPS WireGuard IP is expected to be 10.8.0.1.
sudo ufw allow from 10.8.0.1 to any port 3000 proto tcp

sudo ufw --force enable
sudo ufw status verbose

log "Bootstrap finished"
echo "Next steps:"
echo "1. Edit backend/.env"
echo "2. Configure WireGuard"
echo "3. Start backend with PM2: pm2 start backend/src/server.js --name raspi-chat-backend"
echo "4. Run: pm2 save && pm2 startup"
