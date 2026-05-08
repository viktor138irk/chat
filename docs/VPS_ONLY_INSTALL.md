# WSChat VPS-only installation with FastPanel

This is the current MVP architecture.

Raspberry Pi is not used for the MVP backend. Everything runs on the VPS where FastPanel is already installed.

## Architecture

```text
VPS with FastPanel
  ├── admin.example.ru   -> static admin panel
  ├── widget.example.ru  -> static embeddable widget
  ├── api.example.ru     -> reverse proxy to local backend
  ├── Node.js backend    -> 127.0.0.1:3000
  ├── SQLite database    -> /opt/ws-chat/data/chat.sqlite
  └── Telegram bot       -> backend process
```

## FastPanel rule

Create domains/sites manually in FastPanel. The project must not create sites, overwrite FastPanel configs, or restart the whole web stack.

Create manually:

```text
admin.example.ru
widget.example.ru
api.example.ru
```

Enable SSL manually in FastPanel for all three domains.

## DNS

All records point to the VPS IP:

```text
admin.example.ru   A  VPS_IP
widget.example.ru  A  VPS_IP
api.example.ru     A  VPS_IP
```

## Project directories

```text
/opt/ws-chat/
  source/     # git clone
  data/       # SQLite database
  logs/       # logs
  backups/    # backups before updates
  updates/    # future update bundles
```

FastPanel webroots remain separate:

```text
/var/www/<fastpanel-user>/data/www/admin.example.ru
/var/www/<fastpanel-user>/data/www/widget.example.ru
```

Do not publish files into `api.example.ru`. It is proxy-only.

## Install packages on VPS

```bash
sudo apt update
sudo apt upgrade -y
sudo apt install -y git curl rsync sqlite3 ca-certificates gnupg build-essential python3 make g++
```

## Install Node.js

Recommended for Ubuntu 24.04 VPS:

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node -v
npm -v
```

## Install PM2

```bash
sudo npm install -g pm2
pm2 -v
```

## Clone project

```bash
sudo mkdir -p /opt/ws-chat
sudo chown -R $USER:$USER /opt/ws-chat
cd /opt/ws-chat
git clone https://github.com/viktor138irk/chat.git source
cd source
npm install
```

## Configure backend

```bash
cp backend/.env.example backend/.env
nano backend/.env
```

Minimum VPS-only values:

```env
APP_ENV=production
APP_HOST=127.0.0.1
APP_PORT=3000
PUBLIC_API_URL=https://api.example.ru
PUBLIC_WS_URL=wss://api.example.ru/ws
TRUST_PROXY=true
DATABASE_PATH=/opt/ws-chat/data/chat.sqlite
ADMIN_ORIGIN=https://admin.example.ru
WIDGET_ORIGIN=https://widget.example.ru
TELEGRAM_BOT_TOKEN=
JWT_SECRET=change-me-to-long-random-string
```

Create data directory:

```bash
mkdir -p /opt/ws-chat/data /opt/ws-chat/logs /opt/ws-chat/backups /opt/ws-chat/updates
```

## Start backend

Manual test:

```bash
npm run dev:backend
```

Health check:

```bash
curl http://127.0.0.1:3000/health
```

Expected:

```json
{"ok":true,"service":"raspi-chat-backend","env":"production"}
```

Production with PM2:

```bash
pm2 start backend/src/server.js --name wschat-backend
pm2 save
pm2 startup
```

Run the command printed by `pm2 startup`.

## Configure api.example.ru proxy in FastPanel

Use FastPanel custom Nginx directives if available.

Target:

```text
http://127.0.0.1:3000
```

Typical config:

```nginx
location /ws {
    proxy_pass http://127.0.0.1:3000/ws;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}

location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

If editing any Nginx config manually, always run:

```bash
sudo nginx -t
```

Reload only if needed:

```bash
sudo systemctl reload nginx
```

## Build admin and widget

```bash
cd /opt/ws-chat/source
npm run build:admin
npm run build:widget
```

## Publish admin and widget manually

Replace `siteuser` with the real FastPanel user.

```bash
rsync -av --delete admin-panel/dist/ /var/www/siteuser/data/www/admin.example.ru/
rsync -av --delete widget/dist/ /var/www/siteuser/data/www/widget.example.ru/
```

Safety rule:

```text
Use --delete only inside exact domain webroot directories.
Never use rsync --delete against /var/www or parent folders.
```

## Public checks

```bash
curl https://api.example.ru/health
```

Open in browser:

```text
https://admin.example.ru
https://widget.example.ru
```

## Future updater in admin panel

The admin panel will include an updater section, but sites/domains are still managed manually in FastPanel.

Updater should support:

```text
- check current version
- upload/apply update bundle
- update backend source
- build admin/widget
- publish static files to configured webroots
- restart PM2 backend
- show logs
- rollback static files/backend source later
```

MVP starts with manual mode:

```env
FRONTEND_DEPLOY_ENABLED=false
FRONTEND_DEPLOY_MODE=manual-fastpanel
```
