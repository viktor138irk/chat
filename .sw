# Development state snapshot

Project: WSChat
Repository: https://github.com/viktor138irk/chat
Owner: viktor138irk
Default branch: main

This file is a compact project memory for continuing development in a new chat/dialog.

## Product idea

Build a self-hosted live chat system similar to Jivo, but with Telegram as the operator interface.

Website visitors use an embeddable widget. Messages go to selected Telegram operators. Operators reply in Telegram, and replies return to the website widget.

## Current production/test deployment

Current tested domains:

```text
https://widget.stackworks.ru/        -> widget works
https://widget.stackworks.ru/admin/  -> admin works after Vite base fix
https://api.stackworks.ru/health     -> backend API works
```

Current VPS paths:

```text
/opt/ws-chat/source
/opt/ws-chat/data
/opt/ws-chat/logs
/opt/ws-chat/backups
/opt/ws-chat/updates
```

Current PM2 process:

```text
wschat-backend
```

Current local backend:

```text
http://127.0.0.1:3000
```

Current backend env requirements:

```env
APP_ENV=production
APP_HOST=127.0.0.1
APP_PORT=3000
PUBLIC_API_URL=https://api.stackworks.ru
PUBLIC_WS_URL=wss://api.stackworks.ru/ws
TRUST_PROXY=true
DATABASE_PATH=/opt/ws-chat/data/chat.sqlite
ADMIN_ORIGIN=https://widget.stackworks.ru
WIDGET_ORIGIN=https://widget.stackworks.ru
ADMIN_BASE_PATH=/admin
```

Important fixes already made:

- Admin panel previously displayed `API: http://localhost:3000` and `Failed to fetch` because browser localhost points to the user's PC, not VPS.
- `admin-panel/src/main.jsx` fallback API URL was changed to `https://api.stackworks.ru` in commit `3e956e5c2ab65fe563f6c5d71bb2d032cbf8bcad`.
- Backend did not reliably load `backend/.env`, so env stayed `development` and CORS did not include `access-control-allow-origin` for `https://widget.stackworks.ru`.
- `backend/src/config.js` now loads `backend/.env` by absolute path in commit `4f6339b37c0bbdfa11c12cacb5d12265fb5dd59b`.
- Admin HTML title was changed from `Raspi Chat Admin` to `WSChat Admin` in commit `e5cac5ef34287931f7661bc26dcf739cdf9e7f90`.
- If Telegram bot token was ever pasted into chat/logs, it must be revoked/regenerated in BotFather before production use.

## Current backend persistence implementation

SQLite layer added in commit `502d214eac515863037d8f2bc6f09161dc19624e`.

New file:

```text
backend/src/db.js
```

It creates and manages:

```text
sites
operators
site_operators
visitors
conversations
messages
settings
```

SQLite database path comes from:

```env
DATABASE_PATH=/opt/ws-chat/data/chat.sqlite
```

Backend now calls `migrate()` on startup and creates default site:

```text
site id: site_default
widget_key: site_default
```

Widget message persistence added in commit `bb6dcb106948f83ec588b03777c3ce263509e80a`.

Current backend endpoints:

```text
GET  /health
GET  /api/config/public
GET  /api/admin/stats
GET  /api/admin/messages?limit=50
POST /api/widget/message
GET  /ws
```

`POST /api/widget/message` now:

- validates `siteId`, `visitorId`, `message`;
- checks active site by `widget_key`;
- creates/touches visitor;
- creates/reuses open conversation;
- saves visitor message into SQLite;
- returns `status: saved`, `conversationId`, and `messageId`.

Test commands after pulling latest code on VPS:

```bash
cd /opt/ws-chat/source
git pull --ff-only origin main
npm install
pm2 restart wschat-backend --update-env

curl http://127.0.0.1:3000/health

curl -s https://api.stackworks.ru/api/admin/stats | jq

curl -s -X POST https://api.stackworks.ru/api/widget/message \
  -H 'Content-Type: application/json' \
  -H 'Origin: https://widget.stackworks.ru' \
  -d '{"siteId":"site_default","visitorId":"test_visitor_1","message":"Тестовое сообщение WSChat"}' | jq

curl -s https://api.stackworks.ru/api/admin/messages | jq
```

Expected POST result:

```json
{
  "ok": true,
  "status": "saved",
  "conversationId": "conv_...",
  "messageId": "msg_..."
}
```

## Current architecture

The architecture is VPS-only.

```text
Website with embedded widget
  -> widget.stackworks.ru static widget and admin panel on VPS/FastPanel
  -> api.stackworks.ru public HTTPS endpoint on VPS/FastPanel
  -> local reverse proxy to Node.js backend on VPS
  -> SQLite on VPS
  -> Telegram bot API / optional SOCKS5
  -> Telegram operators

Admin user
  -> widget.stackworks.ru/admin/ static admin panel on VPS/FastPanel
  -> api.stackworks.ru backend on same VPS
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
- widget static files
- admin panel static files under /admin/
```

Raspberry Pi is removed from MVP architecture. It can be revisited later as an optional edge node, but not for the first production version.

## Deployment decisions

- Project name: WSChat.
- Main project directory: `/opt/ws-chat`.
- Cloudflare must not be used because of availability issues in Russia.
- Everything runs on VPS with FastPanel.
- FastPanel must manage domains, SSL, and web server configs manually.
- Project scripts must not create domains or edit global FastPanel configs.
- Backend runs locally on VPS, bound to `127.0.0.1:3000`.
- `api.stackworks.ru` is a reverse proxy to `http://127.0.0.1:3000`.
- `widget.stackworks.ru` serves embeddable widget static files.
- Admin panel is served from the same webroot under `https://widget.stackworks.ru/admin/`.
- SQLite database initially lives on VPS under project data directory.
- PostgreSQL can be introduced later if needed.
- WireGuard is no longer required for MVP.
- No Raspberry home networking or port forwarding is required.

## VPS/FastPanel target

VPS with FastPanel manually configured by the user.

Required FastPanel sites:

```text
widget.stackworks.ru -> static widget + /admin/ admin panel
api.stackworks.ru    -> reverse proxy to local backend on VPS
```

FastPanel webroot for widget/admin is expected to look like:

```text
/var/www/<fastpanel-user>/data/www/widget.stackworks.ru
```

In the current install, the correct widget webroot should be:

```text
/var/www/widget_stack_usr/data/www/widget.stackworks.ru
```

Do not publish widget/admin files into the `api.stackworks.ru` webroot.

The backend source and runtime should live outside public webroots:

```text
/opt/ws-chat/source
/opt/ws-chat/data
/opt/ws-chat/logs
/opt/ws-chat/backups
/opt/ws-chat/updates
```

`api.stackworks.ru` may have a webroot created by FastPanel, but project files must not be published there. It should proxy to:

```text
http://127.0.0.1:3000
```

## Ports

VPS public ports:

- 80/tcp for HTTP/Let's Encrypt
- 443/tcp for HTTPS widget/admin/API
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

FastPanel owns public directory:

```text
/var/www/<fastpanel-user>/data/www/widget.stackworks.ru
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
- run frontend/backend as root beyond the current root-based MVP install model
- bind project services directly to ports 80/443
- delete parent `/var/www` directories

Static deployment should copy files only into exact domain webroot directories.

Use rsync carefully:

```bash
rsync -av --delete widget/dist/ /var/www/widget_stack_usr/data/www/widget.stackworks.ru/
rsync -av --delete admin-panel/dist/ /var/www/widget_stack_usr/data/www/widget.stackworks.ru/admin/
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
│       ├── db.js
│       └── server.js
├── admin-panel/
│   ├── index.html
│   ├── package.json
│   ├── vite.config.js
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
│       ├── bootstrap.sh
│       └── install.sh
└── docs/
    ├── FASTPANEL.md
    ├── FASTPANEL_MANUAL_FRONTEND.md
    ├── INSTALL.md
    ├── RASPBERRY_PI.md
    ├── UPDATE_BUNDLE.md
    └── VPS_ONLY_INSTALL.md
```

## Implemented so far

### VPS interactive installer

Added `deploy/vps/install.sh`.

It is an interactive root installer with progress and error logging.

Features:

- shows current step `[01/13]` style;
- writes log file to `/tmp/wschat-install-YYYYMMDD-HHMMSS.log`;
- saves primary settings to `/opt/ws-chat/install-state.env`;
- on repeated runs, can reuse saved settings;
- supports `--yes` to use saved settings without questions;
- supports `--reset` to ask settings again;
- asks for project path, widget/admin domain, API domain, FastPanel widget webroot, Telegram token, JWT secret;
- validates FastPanel webroot path shape;
- installs base packages;
- installs Node.js 20 via NodeSource;
- installs PM2;
- creates `/opt/ws-chat` directories;
- clones/updates repo;
- installs npm dependencies;
- writes `backend/.env`;
- writes `/opt/ws-chat/install-state.env`;
- starts/restarts PM2 process `wschat-backend`;
- checks backend health at `http://127.0.0.1:3000/health`;
- builds admin and widget;
- publishes widget files into widget webroot and admin files into `/admin/`;
- prints FastPanel reverse proxy instructions for `api.stackworks.ru`.

Installer does not create domains or edit FastPanel configs.

Run on VPS as root:

```bash
cd /opt/ws-chat/source
bash deploy/vps/install.sh
```

Use saved settings without questions:

```bash
cd /opt/ws-chat/source
bash deploy/vps/install.sh --yes
```

Reset settings:

```bash
cd /opt/ws-chat/source
bash deploy/vps/install.sh --reset
```

### Root workspace

- npm workspaces configured.
- Root package renamed from `raspi-telegram-live-chat` to `wschat`.
- Workspace package names renamed to `@wschat/*`.
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
- better-sqlite3
- SQLite
- nanoid
- telegraf dependency already added but Telegram bridge not implemented yet

Current endpoints:

```text
GET  /health
GET  /api/config/public
GET  /api/admin/stats
GET  /api/admin/messages?limit=50
POST /api/widget/message
GET  /ws
```

For VPS-only architecture, backend env should use:

```env
APP_ENV=production
APP_HOST=127.0.0.1
APP_PORT=3000
PUBLIC_API_URL=https://api.stackworks.ru
PUBLIC_WS_URL=wss://api.stackworks.ru/ws
DATABASE_PATH=/opt/ws-chat/data/chat.sqlite
ADMIN_ORIGIN=https://widget.stackworks.ru
WIDGET_ORIGIN=https://widget.stackworks.ru
ADMIN_BASE_PATH=/admin
```

Backend health service name was renamed from `raspi-chat-backend` to `wschat-backend` in commit `ac14400b2eec875231f6300b7a48e8940cf73996`.

### Admin panel

React/Vite shell exists.

It shows:

- project dashboard;
- API health check;
- FastPanel-safe deployment note;
- SOCKS5 note.

Admin panel is served under:

```text
https://widget.stackworks.ru/admin/
```

Added `admin-panel/vite.config.js` with:

```js
base: '/admin/'
```

This fixed the white page caused by assets loading from `/assets/...` instead of `/admin/assets/...`.

Admin API fallback was fixed from `http://localhost:3000` to `https://api.stackworks.ru` in commit `3e956e5c2ab65fe563f6c5d71bb2d032cbf8bcad`.

Admin HTML title was changed from `Raspi Chat Admin` to `WSChat Admin` in commit `e5cac5ef34287931f7661bc26dcf739cdf9e7f90`.

### Widget

Vanilla JS widget shell exists.

It:

- creates chat button;
- opens chat panel;
- creates visitorId in localStorage;
- sends messages to backend endpoint.

Current embed example:

```html
<script
  src="https://widget.stackworks.ru/widget.js"
  data-site-id="site_default"
  data-api-url="https://api.stackworks.ru">
</script>
```

Need to ensure production Vite build emits stable `widget.js` file.

### Deploy agent

FastPanel-safe deploy script exists:

```text
deploy/deploy-agent/src/deploy-frontend.js
```

It currently focuses on frontend publishing and needs to be updated for current single-webroot widget/admin deployment:

- git fetch/pull;
- npm ci/install;
- builds admin-panel;
- builds widget;
- validates FastPanel webroot path;
- rsyncs widget dist to widget webroot;
- rsyncs admin dist to widget webroot `/admin/`;
- does not touch FastPanel configs.

Need to extend deployment process for VPS-only backend:

- install backend deps;
- keep `/opt/ws-chat/data` persistent;
- restart PM2 process `wschat-backend`;
- never expose backend on public port.

Important env variable:

```env
FASTPANEL_SAFE_MODE=true
```

## Existing docs

- `docs/VPS_ONLY_INSTALL.md`: current VPS-only install guide, needs final cleanup for widget/admin same-domain scheme.
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
- Backend health renamed to WSChat: `ac14400b2eec875231f6300b7a48e8940cf73996`
- Backend .env absolute loading fix: `4f6339b37c0bbdfa11c12cacb5d12265fb5dd59b`
- Admin Vite base `/admin/` added: `9943376645882eeb3cdc372b5292c72519e005b2`
- Admin API fallback fixed: `3e956e5c2ab65fe563f6c5d71bb2d032cbf8bcad`
- Admin HTML title renamed to WSChat: `e5cac5ef34287931f7661bc26dcf739cdf9e7f90`
- SQLite DB layer added: `502d214eac515863037d8f2bc6f09161dc19624e`
- Widget message persistence added: `bb6dcb106948f83ec588b03777c3ce263509e80a`

## Next development steps

1. Pull latest backend persistence changes on VPS.
2. Restart PM2 and verify SQLite DB creation at `/opt/ws-chat/data/chat.sqlite`.
3. Test POST `/api/widget/message` with `siteId: site_default`.
4. Test GET `/api/admin/messages` and `/api/admin/stats`.
5. Update admin UI to show message/stats cards.
6. Update deploy-agent for widget/admin same webroot and backend restart.
7. Fix widget production build so it outputs stable `widget.js`.
8. Implement Telegram bot bridge:
   - send website messages to allowed operators
   - map Telegram replies to conversations
   - send replies back to widget via WebSocket
9. Add admin auth.
10. Add admin CRUD:
   - sites
   - operators
   - operator-site permissions
   - Telegram settings
   - SOCKS5 settings
11. Add origin/domain validation:
   - `site_id + Origin` must match configured site.
12. Add manual update section in admin panel.
13. Add update bundle generator and apply script.
14. Prepare Android-ready API later.

## User preferences and constraints

- User wants practical development, not only planning.
- User wants all work in GitHub repository `viktor138irk/chat`.
- User wants to be able to resume development in a new dialog using this `.sw` file.
- User prefers not to risk breaking FastPanel.
- User wants manual control over domains in FastPanel.
- User wants future auto-update file/bundle workflow.
- User changed architecture to VPS-only after Raspberry issues.
- User named the system WSChat and chose `/opt/ws-chat` as the project path.
- VPS currently uses root user by default, so MVP installation can run as root.
- Widget and admin must live in one FastPanel site: widget at `/`, admin at `/admin/`.

## How to continue in a new chat

Open this file first. Then continue from "Next development steps".

Recommended next task:

```text
Pull latest changes on VPS, test SQLite message persistence, then show messages/stats in admin UI.
```
