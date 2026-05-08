# Installation guide

This guide describes the MVP deployment model:

```text
VPS with FastPanel
  - admin panel static files
  - widget static files
  - public api.example.ru reverse proxy
  - WireGuard server

Raspberry Pi 3B at home
  - backend API
  - WebSocket
  - Telegram bot
  - SQLite database
  - WireGuard client
```

Cloudflare is not required.

## 1. Required domains

Create DNS A-records pointing to the VPS IP:

```text
admin.example.ru  -> VPS_IP
widget.example.ru -> VPS_IP
api.example.ru    -> VPS_IP
```

## 2. FastPanel setup on VPS

Create three sites in FastPanel:

```text
admin.example.ru
widget.example.ru
api.example.ru
```

Enable HTTPS for all three domains using FastPanel/Let's Encrypt.

Expected static webroots:

```text
/var/www/<fastpanel-user>/data/www/admin.example.ru
/var/www/<fastpanel-user>/data/www/widget.example.ru
```

Do not manually overwrite FastPanel generated configs.

## 3. VPS base packages

```bash
sudo apt update
sudo apt upgrade -y
sudo apt install -y git curl rsync wireguard
```

Install Node.js 20 LTS on VPS.

Example using NodeSource:

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node -v
npm -v
```

## 4. Clone project on VPS

```bash
sudo mkdir -p /opt/raspi-chat
sudo chown -R $USER:$USER /opt/raspi-chat
cd /opt/raspi-chat
git clone https://github.com/viktor138irk/chat.git source
cd source
npm install
```

## 5. Configure frontend deploy agent

```bash
cp deploy/deploy-agent/.env.example deploy/deploy-agent/.env
nano deploy/deploy-agent/.env
```

Example:

```env
FRONTEND_DEPLOY_BRANCH=main
FRONTEND_DEPLOY_SOURCE_PATH=/opt/raspi-chat/source
FRONTEND_DEPLOY_ADMIN_WEBROOT=/var/www/example_user/data/www/admin.example.ru
FRONTEND_DEPLOY_WIDGET_WEBROOT=/var/www/example_user/data/www/widget.example.ru
FASTPANEL_SAFE_MODE=true
```

Run first frontend deploy:

```bash
npm run deploy:frontend
```

This builds and publishes:

```text
admin-panel -> admin.example.ru
widget      -> widget.example.ru
```

## 6. Raspberry Pi OS

Recommended for Raspberry Pi 3B:

```text
Raspberry Pi OS Lite 32-bit
```

Install base packages:

```bash
sudo apt update
sudo apt upgrade -y
sudo apt install -y git curl sqlite3 ufw fail2ban wireguard rsync
```

Install Node.js 20 LTS if available. If memory is tight, Node.js 18 LTS is acceptable for MVP.

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node -v
npm -v
```

## 7. Clone project on Raspberry Pi

```bash
mkdir -p ~/apps
cd ~/apps
git clone https://github.com/viktor138irk/chat.git
cd chat
npm install
```

## 8. Configure backend on Raspberry Pi

```bash
cp backend/.env.example backend/.env
nano backend/.env
```

Example:

```env
APP_ENV=production
APP_HOST=0.0.0.0
APP_PORT=3000
PUBLIC_API_URL=https://api.example.ru
PUBLIC_WS_URL=wss://api.example.ru/ws
TRUST_PROXY=true

DATABASE_PATH=./data/chat.sqlite

ADMIN_ORIGIN=https://admin.example.ru
WIDGET_ORIGIN=https://widget.example.ru

TELEGRAM_BOT_TOKEN=YOUR_TELEGRAM_BOT_TOKEN
TELEGRAM_PROXY_ENABLED=false
TELEGRAM_PROXY_TYPE=socks5
TELEGRAM_PROXY_HOST=127.0.0.1
TELEGRAM_PROXY_PORT=9050
TELEGRAM_PROXY_USERNAME=
TELEGRAM_PROXY_PASSWORD=

JWT_SECRET=change-me-to-long-random-string
```

Create data directory:

```bash
mkdir -p backend/data
```

## 9. Run backend manually

```bash
npm run dev:backend
```

Health check from Raspberry Pi:

```bash
curl http://127.0.0.1:3000/health
```

Expected response:

```json
{"ok":true,"service":"raspi-chat-backend","env":"production"}
```

## 10. Run backend with PM2

```bash
sudo npm install -g pm2
pm2 start backend/src/server.js --name raspi-chat-backend
pm2 save
pm2 startup
```

Follow the command printed by `pm2 startup`.

Useful commands:

```bash
pm2 status
pm2 logs raspi-chat-backend
pm2 restart raspi-chat-backend
```

## 11. WireGuard network

Recommended VPN network:

```text
VPS:          10.8.0.1
Raspberry Pi: 10.8.0.2
```

After WireGuard is configured, VPS should reach backend:

```bash
curl http://10.8.0.2:3000/health
```

## 12. FastPanel API reverse proxy

For `api.example.ru`, configure reverse proxy to Raspberry Pi through WireGuard:

```text
http://10.8.0.2:3000
```

Required paths:

```text
/api/* -> http://10.8.0.2:3000/api/*
/health -> http://10.8.0.2:3000/health
/ws -> http://10.8.0.2:3000/ws with WebSocket upgrade
```

Use FastPanel UI/custom Nginx directives if available. Do not overwrite FastPanel generated configs manually.

Typical Nginx location for WebSocket:

```nginx
location /ws {
    proxy_pass http://10.8.0.2:3000/ws;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

Typical Nginx location for API:

```nginx
location / {
    proxy_pass http://10.8.0.2:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

Before reload:

```bash
sudo nginx -t
```

Reload only if needed:

```bash
sudo systemctl reload nginx
```

## 13. Test public API

From your computer:

```bash
curl https://api.example.ru/health
```

Expected:

```json
{"ok":true,"service":"raspi-chat-backend","env":"production"}
```

## 14. Widget embed code

Use this on any website:

```html
<script
  src="https://widget.example.ru/src/widget.js"
  data-site-id="site_xxxxx"
  data-api-url="https://api.example.ru">
</script>
```

Later the production build will expose a stable widget file path, for example:

```html
<script
  src="https://widget.example.ru/widget.js"
  data-site-id="site_xxxxx"
  data-api-url="https://api.example.ru">
</script>
```

## 15. Current MVP status

Implemented:

- backend health endpoint
- widget message endpoint
- WebSocket endpoint
- React admin shell
- embeddable widget shell
- FastPanel-safe deploy agent

Next implementation step:

- SQLite schema
- message persistence
- Telegram forwarding
- reply mapping from Telegram back to website
