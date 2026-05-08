# Development state snapshot

Project: WSChat
Repository: https://github.com/viktor138irk/chat
Owner: viktor138irk
Default branch: main

This file is a compact project memory for continuing development in a new chat/dialog.

## Product idea

Build a self-hosted live chat system similar to Jivo, but with Telegram as the operator interface.

Website visitors use an embeddable widget. Messages go to selected Telegram operators. Operators reply in Telegram, and replies return to the website widget.

## Current architecture

The architecture is VPS-only.

```text
Website with embedded widget
  -> widget.example.ru static widget.js on VPS/FastPanel
  -> api.example.ru public HTTPS endpoint on VPS/FastPanel
  -> local reverse proxy to Node.js backend on VPS
  -> SQLite on VPS
  -> Telegram bot API / optional SOCKS5
  -> Telegram operators

Admin user
  -> admin.example.ru static admin panel on VPS/FastPanel
  -> api.example.ru backend on same VPS
```

## Architecture decision update

The architecture was changed from Raspberry Pi backend to VPS-only deployment.

Reason:

- Raspberry Pi 3B caused repeated low-level system issues.
- 32-bit OS had NodeSource `armhf` incompatibility.
- 64-bit OS with NodeSource arm64 produced `Illegal instruction` on Node.js.
- APT/DPKG then showed corrupted archives and `/var/lib/dpkg/diversions` issues.
- Continuing on Raspberry Pi would waste time and increase operational risk.

New decision:

```text
VPS with FastPanel runs everything:
- backend API
- WebSocket
- Telegram bot
- SQLite database initially
- admin panel static files
- widget static files
```

Raspberry Pi is removed from MVP architecture. It can be revisited later as an optional edge node, but not for the first production version.

## Deployment decisions

- Project name: WSChat.
- Main project directory: `/opt/ws-chat`.
- Cloudflare must not be used because of availability issues in Russia.
- Everything runs on VPS with FastPanel.
- FastPanel must manage domains, SSL, and web server configs manually.
- Project scripts must not create domains or edit global FastPanel configs.
- Backend runs locally on VPS, preferably bound to `127.0.0.1:3000`.
- `api.example.ru` is a reverse proxy to `http://127.0.0.1:3000`.
- `admin.example.ru` serves admin panel static files.
- `widget.example.ru` serves embeddable widget static files.
- SQLite database initially lives on VPS under project data directory.
- PostgreSQL can be introduced later if needed.
- WireGuard is no longer required for MVP.
- No Raspberry home networking or port forwarding is required.

## VPS/FastPanel target

VPS with FastPanel manually configured by the user.

Recommended subdomains:

```text
admin.example.ru   -> static admin panel
widget.example.ru  -> static widget
api.example.ru     -> reverse proxy to local backend on VPS
```

DNS A-records for all three point to the VPS IP.

FastPanel webroots are expected to look like:

```text
/var/www/<fastpanel-user>/data/www/admin.example.ru
/var/www/<fastpanel-user>/data/www/widget.example.ru
```

The backend source and runtime should live outside public webroots:

```text
/opt/ws-chat/source
/opt/ws-chat/data
/opt/ws-chat/logs
/opt/ws-chat/backups
/opt/ws-chat/updates
```

`api.example.ru` may have a webroot created by FastPanel, but project files must not be published there. It should proxy to:

```text
http://127.0.0.1:3000
```

## Ports

VPS public ports:

- 80/tcp for HTTP/Let's Encrypt
- 443/tcp for HTTPS admin/widget/api
- SSH port, usually 22/tcp or custom

Backend port:

- Node.js backend listens on `127.0.0.1:3000` only.
- Do not expose port 3000 publicly.

No WireGuard port is required for MVP.

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

## Frontend and backend update decision

The user wants manual-safe installation on VPS first, to avoid breaking FastPanel.

Future update mechanism:

- Assistant can prepare an update bundle file.
- User uploads it to VPS.
- Auto-updater applies changes safely.
- Updates can cover admin, widget, backend/API, docs, and config templates.

Recommended project directory on VPS:

```text
/opt/ws-chat/
  source/
  updates/
  backups/
  logs/
  build/
  data/
```

FastPanel owns public directories:

```text
/var/www/<fastpanel-user>/data/www/admin.example.ru
/var/www/<fastpanel-user>/data/www/widget.example.ru
```

Backend should be managed by PM2:

```text
pm2 process: wschat-backend
entry: /opt/ws-chat/source/backend/src/server.js
```

## FastPanel safety rules

Never from project scripts:

- edit `/etc/nginx/nginx.conf`
- overwrite FastPanel vhost configs
- run broad `systemctl restart nginx`
- install packages that replace FastPanel web stack
- run frontend/backend as root
- bind project services directly to ports 80/443
- delete parent `/var/www` directories

Static deployment should copy files only into exact domain webroots.

Use rsync carefully:

```bash
rsync -av --delete admin-panel/dist/ /var/www/siteuser/data/www/admin.example.ru/
rsync -av --delete widget/dist/ /var/www/siteuser/data/www/widget.example.ru/
```

Never run `rsync --delete` against `/var/www` or parent folders.

## Old Raspberry Pi attempt archive

Raspberry Pi was originally planned as backend host but was removed from MVP.

Issues encountered:

- Raspberry Pi 3B with 32-bit OS: NodeSource does not support `armhf`.
- Raspberry Pi 3B with 32-bit OS: `node -v` and `npm -v` returned `Segmentation fault` after attempted setup.
- 32-bit install also showed dpkg metadata corruption.
- Raspberry Pi 3B with 64-bit OS: NodeSource arm64 installed but `node -v` and `npm -v` returned `Illegal instruction`.
- Later apt/dpkg showed corrupted `.deb` archives and corrupted `/var/lib/dpkg/diversions`.

Conclusion:

```text
Do not use Raspberry Pi 3B for MVP backend.
Use VPS-only deployment.
```

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
│   ├── deploy-agent/
│   └── vps/
│       ├── .env.example
│       └── bootstrap.sh
└── docs/
    ├── FASTPANEL.md
    ├── FASTPANEL_MANUAL_FRONTEND.md
    ├── INSTALL.md
    ├── RASPBERRY_PI.md
    ├── UPDATE_BUNDLE.md
    └── VPS_ONLY_INSTALL.md
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

For VPS-only architecture, backend env should use:

```env
APP_HOST=127.0.0.1
APP_PORT=3000
PUBLIC_API_URL=https://api.example.ru
PUBLIC_WS_URL=wss://api.example.ru/ws
DATABASE_PATH=/opt/ws-chat/data/chat.sqlite
```

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

It currently focuses on frontend publishing:

- git fetch/pull
- npm ci
- builds admin-panel
- builds widget
- validates FastPanel webroot paths
- rsyncs dist files into admin/widget webroots
- does not touch FastPanel configs

Need to extend deployment process for VPS-only backend:

- install backend deps
- keep `/opt/ws-chat/data` persistent
- restart PM2 process `wschat-backend`
- never expose backend on public port

Important env variable:

```env
FASTPANEL_SAFE_MODE=true
```

## Existing docs

- `docs/VPS_ONLY_INSTALL.md`: current VPS-only install guide.
- `docs/INSTALL.md`: old full install guide for VPS + Raspberry Pi; deprecated.
- `docs/FASTPANEL.md`: FastPanel-safe deployment guide; needs update for backend on same VPS.
- `docs/FASTPANEL_MANUAL_FRONTEND.md`: manual frontend installation through FastPanel.
- `docs/RASPBERRY_PI.md`: now historical/optional, not MVP.
- `docs/UPDATE_BUNDLE.md`: future update bundle workflow; needs update for backend on VPS and `/opt/ws-chat`.

## Important previous commits

- Initial project spec: `aea8a9f49089ffd6b5a8ace365fc4eaa8c4ea154`
- Frontend deployment requirement: `1a914b9e546f6a0d9b60be6f8cf80858b1d25a75`
- FastPanel-safe requirement: `80f0e77e76f6a0b79e875fed5baf2243fbe0a11e`
- Initial project skeleton: multiple commits after that
- Install guide: `4f86690a0118f69243ce4da9b515aaace5b20017`
- Manual FastPanel frontend guide: `ba08112dc628fd276a2f8eade63145b32aa42c95`
- Update bundle workflow: `b1fa5ead43f33e80c7208b98bcea6e0fa68d5682`
- Raspberry armhf bootstrap fix: `fbe84c8b16a51cdd4931ecf0b1e0fa8654edec6a`
- Architecture switched to VPS-only after Raspberry issues: `28b0ca37c4032633811cce4dc096d1c714c5d5a2`
- Project path renamed to `/opt/ws-chat` and PM2 process to `wschat-backend`: current updates

## Next development steps

1. Finish updating docs to WSChat/VPS-only architecture.
2. Update package names/descriptions from raspi-chat to wschat where useful.
3. Add VPS backend deploy/update script:
   - install backend deps
   - create `/opt/ws-chat/data`
   - prepare backend env
   - build admin/widget
   - publish static files safely
   - start/restart backend with PM2 `wschat-backend`
4. Fix widget production build so it outputs stable `widget.js`.
5. Add SQLite database layer:
   - sites
   - operators
   - site_operators
   - visitors
   - conversations
   - messages
   - settings
6. Persist widget messages.
7. Implement Telegram bot bridge:
   - send website messages to allowed operators
   - map Telegram replies to conversations
   - send replies back to widget via WebSocket
8. Add admin auth.
9. Add admin CRUD:
   - sites
   - operators
   - operator-site permissions
   - Telegram settings
   - SOCKS5 settings
10. Add origin/domain validation:
   - `site_id + Origin` must match configured site.
11. Add manual update section in admin panel.
12. Add update bundle generator and apply script.
13. Prepare Android-ready API later.

## User preferences and constraints

- User wants practical development, not only planning.
- User wants all work in GitHub repository `viktor138irk/chat`.
- User wants to be able to resume development in a new dialog using this `.sw` file.
- User prefers not to risk breaking FastPanel.
- User wants manual control over domains in FastPanel.
- User wants future auto-update file/bundle workflow.
- User changed architecture to VPS-only after Raspberry issues.
- User named the system WSChat and chose `/opt/ws-chat` as the project path.

## How to continue in a new chat

Open this file first. Then continue from "Next development steps".

Recommended next task:

```text
Finish WSChat/VPS-only cleanup, then implement SQLite schema and message persistence.
```
