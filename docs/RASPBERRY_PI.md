# Raspberry Pi 3B setup

Recommended OS:

```text
Raspberry Pi OS Lite 32-bit
```

## Base packages

```bash
sudo apt update
sudo apt upgrade -y
sudo apt install -y git curl sqlite3 ufw fail2ban rsync
```

## Node.js

Use Node.js 20 LTS where possible. If the Pi 3B feels too tight on RAM, Node.js 18 LTS can be used for MVP.

## Clone project

```bash
git clone https://github.com/viktor138irk/chat.git
cd chat
npm install
```

## Backend config

```bash
cp backend/.env.example backend/.env
nano backend/.env
```

Important values:

```env
APP_HOST=0.0.0.0
APP_PORT=3000
DATABASE_PATH=./data/chat.sqlite
PUBLIC_API_URL=https://api.example.ru
PUBLIC_WS_URL=wss://api.example.ru/ws
```

## Run backend

Development:

```bash
npm run dev:backend
```

Production with PM2:

```bash
sudo npm install -g pm2
pm2 start backend/src/server.js --name raspi-chat-backend
pm2 save
pm2 startup
```

## Network model

Preferred production model:

```text
VPS public internet
  -> WireGuard
  -> Raspberry Pi backend on 10.8.0.2:3000
```

Do not expose Node.js port 3000 directly to the public internet.
