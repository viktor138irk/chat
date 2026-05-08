# Development state snapshot

Project: Raspi Telegram Live Chat
Repository: https://github.com/viktor138irk/chat
Owner: viktor138irk
Default branch: main

This file is a compact project memory for continuing development in a new chat/dialog.

## Product idea

Build a self-hosted live chat system similar to Jivo, but with Telegram as the operator interface.

Website visitors use an embeddable widget. Messages go to selected Telegram operators. Operators reply in Telegram, and replies return to the website widget.

## Main architecture

```text
Website with embedded widget
  -> widget.example.ru static widget.js from VPS/FastPanel
  -> api.example.ru public HTTPS endpoint on VPS/FastPanel
  -> VPS reverse proxy
  -> WireGuard tunnel
  -> Raspberry Pi 3B backend at home
  -> SQLite + Telegram bot
```

## Deployment decisions

- Cloudflare must not be used because of availability issues in Russia.
- Frontend is hosted on VPS with FastPanel.
- FastPanel must manage domains, SSL, and web server configs manually.
- Project scripts must not create domains or edit global FastPanel configs.
- Raspberry Pi stays at home and should not expose public ports.
- VPS is the only public entry point.
- VPS connects to Raspberry Pi through WireGuard.
- api.example.ru is only a reverse proxy, not a static site.
- admin.example.ru serves the admin panel static files.
- widget.example.ru serves the embeddable widget static files.

## Raspberry Pi target

Recommended device:

- Raspberry Pi 3 Model B
- Raspberry Pi OS Lite 32-bit
- Node.js backend
- SQLite
- PM2
- WireGuard client

Do not expose Raspberry Pi directly to the internet.

Backend should listen on port 3000 and be reachable only through WireGuard from VPS.

### Raspberry Node.js issue discovered

On Raspberry Pi OS 32-bit, architecture is `armhf`. NodeSource setup failed with:

```text
Unsupported architecture: armhf. Only amd64, arm64 are supported.
```

After attempted install, `node -v` and `npm -v` returned:

```text
Segmentation fault
```

Action taken:

- Updated `deploy/raspberry/bootstrap.sh` in commit `fbe84c8b16a51cdd4931ecf0b1e0fa8654edec6a`.
- Script now detects `dpkg --print-architecture`.
- For `armhf`, it installs `nodejs npm` from Raspberry Pi/Debian apt repo instead of NodeSource.
- For `arm64` and `amd64`, it can still use NodeSource.

Next troubleshooting command sequence for this issue:

```bash
sudo rm -f /etc/apt/sources.list.d/nodesource.list
sudo rm -f /etc/apt/keyrings/nodesource.gpg
sudo apt update
sudo apt purge -y nodejs npm libnode* node-* || true
sudo apt autoremove -y
sudo apt clean
sudo apt update
sudo apt install -y nodejs npm
node -v
npm -v
```

If `node -v` still segfaults after clean apt install, strongly consider switching Raspberry Pi to Raspberry Pi OS Lite 64-bit or using backend runtime alternatives.

## VPS/FastPanel target

VPS with FastPanel manually configured by the user.

Recommended subdomains:

```text
admin.example.ru   -> static admin panel
widget.example.ru  -> static widget
api.example.ru     -> reverse proxy to Raspberry Pi backend
```

DNS A-records for all three point to the VPS IP.

FastPanel webroots are expected to look like:

```text
/var/www/<fastpanel-user>/data/www/admin.example.ru
/var/www/<fastpanel-user>/data/www/widget.example.ru
```

api.example.ru may have a webroot created by FastPanel, but project files must not be published there. It should proxy to:

```text
http://10.8.0.2:3000
```

## Ports

Home router / Raspberry Pi:

- No port forwarding required.
- Backend port 3000 should be available only inside WireGuard.
- SSH may be available only in local LAN if needed.

VPS:

- 80/tcp for HTTP/Let's Encrypt
- 443/tcp for HTTPS admin/widget/api
- 51820/udp for WireGuard
- SSH port, usually 22/tcp or custom

## SOCKS5 requirement

Telegram settings must support optional SOCKS5 proxy:

```env
TELEGRAM_PROXY_ENABLED=false
TELEGRAM_PROXY_TYPE=socks5
TELEGRAM_PROXY_HOST=127.0.0.1
TELEGRAM_PROXY_PORT=9050
TELEGRAM_PROXY_USERNAME=
TELEGRAM_PROXY_PASSWORD=
```

Admin panel should eventually expose:

- enable/disable SOCKS5
- host
- port
- username
- password
- test connection button

## Frontend update decision

The user wants manual-safe frontend installation on VPS first, to avoid breaking FastPanel.

Future update mechanism:

- Assistant can prepare an update bundle file.
- User uploads it to VPS.
- Auto-updater applies changes safely.
- Updates can cover admin, widget, and backend/API instructions.

Recommended project directory on VPS:

```text
/opt/raspi-chat/
  source/
  updates/
  backups/
  logs/
  build/
```

FastPanel owns public directories:

```text
/var/www/<fastpanel-user>/data/www/admin.example.ru
/var/www/<fastpanel-user>/data/www/widget.example.ru
```

## FastPanel safety rules

Never from project scripts:

- edit `/etc/nginx/nginx.conf`
- overwrite FastPanel vhost configs
- run broad `systemctl restart nginx`
- install packages that replace FastPanel web stack
- run frontend as root
- bind frontend services to ports 80/443
- delete parent `/var/www` directories

Static deployment should copy files only into exact domain webroots.

Use rsync carefully:

```bash
rsync -av --delete admin-panel/dist/ /var/www/siteuser/data/www/admin.example.ru/
rsync -av --delete widget/dist/ /var/www/siteuser/data/www/widget.example.ru/
```

Never run `rsync --delete` against `/var/www` or parent folders.

## Current repository structure

```text
.
├── .gitignore
├── .sw
├── README.md
├── package.json
├── backend/
│   ├── .env.example
│   ├── package.json
│   └── src/
│       ├── config.js
│       └── server.js
├── admin-panel/
│   ├── index.html
│   ├── package.json
│   └── src/
│       ├── main.jsx
│       └── styles.css
├── widget/
│   ├── index.html
│   ├── package.json
│   └── src/
│       └── widget.js
├── deploy/
│   └── deploy-agent/
│       ├── .env.example
│       ├── package.json
│       └── src/
│           └── deploy-frontend.js
└── docs/
    ├── FASTPANEL.md
    ├── FASTPANEL_MANUAL_FRONTEND.md
    ├── INSTALL.md
    ├── RASPBERRY_PI.md
    └── UPDATE_BUNDLE.md
```

## Implemented so far

### Root workspace

- npm workspaces configured.
- Root scripts:
  - `dev:backend`
  - `dev:admin`
  - `build:admin`
  - `build:widget`
  - `build`
  - `deploy:frontend`

### Backend

Stack:

- Node.js
- Fastify
- @fastify/cors
- @fastify/rate-limit
- @fastify/websocket
- better-sqlite3 dependency already added but schema not implemented yet
- telegraf dependency already added but Telegram bridge not implemented yet

Current endpoints:

```text
GET  /health
GET  /api/config/public
POST /api/widget/message
GET  /ws
```

`/api/widget/message` currently validates basic fields and returns accepted. Persistence and Telegram forwarding are not implemented yet.

### Admin panel

React/Vite shell exists.

It shows:

- project dashboard
- API health check
- FastPanel-safe deployment note
- SOCKS5 note

### Widget

Vanilla JS widget shell exists.

It:

- creates chat button
- opens chat panel
- creates visitorId in localStorage
- sends messages to backend endpoint

Current embed example:

```html
<script
  src="https://widget.example.ru/widget.js"
  data-site-id="site_xxxxx"
  data-api-url="https://api.example.ru">
</script>
```

Need to ensure production Vite build emits stable `widget.js` file.

### Deploy agent

FastPanel-safe deploy script exists:

```text
deploy/deploy-agent/src/deploy-frontend.js
```

It:

- git fetch/pull
- npm ci
- builds admin-panel
- builds widget
- validates FastPanel webroot paths
- rsyncs dist files into admin/widget webroots
- does not touch FastPanel configs

Important env variable name fixed:

```env
FASTPANEL_SAFE_MODE=true
```

## Existing docs

- `docs/INSTALL.md`: full install guide for VPS + Raspberry Pi.
- `docs/FASTPANEL.md`: FastPanel-safe deployment guide.
- `docs/FASTPANEL_MANUAL_FRONTEND.md`: manual frontend installation through FastPanel.
- `docs/RASPBERRY_PI.md`: Raspberry Pi setup.
- `docs/UPDATE_BUNDLE.md`: future update bundle workflow.

## Important previous commits

- Initial project spec: `aea8a9f49089ffd6b5a8ace365fc4eaa8c4ea154`
- Frontend deployment requirement: `1a914b9e546f6a0d9b60be6f8cf80858b1d25a75`
- FastPanel-safe requirement: `80f0e77e76f6a0b79e875fed5baf2243fbe0a11e`
- Initial project skeleton: multiple commits after that
- Install guide: `4f86690a0118f69243ce4da9b515aaace5b20017`
- Manual FastPanel frontend guide: `ba08112dc628fd276a2f8eade63145b32aa42c95`
- Update bundle workflow: `b1fa5ead43f33e80c7208b98bcea6e0fa68d5682`
- Raspberry armhf bootstrap fix: `fbe84c8b16a51cdd4931ecf0b1e0fa8654edec6a`

## Next development steps

1. Fix widget production build so it outputs stable `widget.js`.
2. Add SQLite database layer:
   - sites
   - operators
   - site_operators
   - visitors
   - conversations
   - messages
   - settings
3. Persist widget messages.
4. Implement Telegram bot bridge:
   - send website messages to allowed operators
   - map Telegram replies to conversations
   - send replies back to widget via WebSocket
5. Add admin auth.
6. Add admin CRUD:
   - sites
   - operators
   - operator-site permissions
   - Telegram settings
   - SOCKS5 settings
7. Add origin/domain validation:
   - `site_id + Origin` must match configured site.
8. Add manual update section in admin panel.
9. Add update bundle generator and apply script.
10. Prepare Android-ready API later.

## User preferences and constraints

- User wants practical development, not only planning.
- User wants all work in GitHub repository `viktor138irk/chat`.
- User wants to be able to resume development in a new dialog using this `.sw` file.
- User prefers not to risk breaking FastPanel.
- User wants manual control over domains in FastPanel.
- User wants future auto-update file/bundle workflow.
- User confirmed: `api.example.ru` or `pi.example.ru` is just proxied.

## How to continue in a new chat

Open this file first. Then continue from "Next development steps".

Recommended next task:

```text
Implement SQLite schema and message persistence in backend.
```
