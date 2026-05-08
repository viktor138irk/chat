# WSChat development state snapshot

Project: WSChat
Repository: https://github.com/viktor138irk/chat
Owner: viktor138irk
Default branch: main

This file is the main project memory for continuing development in a new chat/dialog. Always open this file first before continuing work.

## Mandatory working rule

After every meaningful code, deployment, architecture, or debugging change, update this `.sw` file in the repository.

The user explicitly requested: keep writing/updating `.sw` constantly during further development.

Do not rely on chat history only. `.sw` must remain the source of truth for project state, current bugs, fixes, deployment commands, and next steps.

## Product idea

Build a self-hosted live chat system similar to Jivo, but with Telegram as the operator interface.

Website visitors use an embeddable widget. Messages go to selected Telegram operators. Operators reply in Telegram, and replies return to the website widget.

Future direction: Android app support should be planned in the API, but MVP is VPS + website widget + Telegram operators.

## Current production/test deployment

Current tested domains:

```text
https://widget.stackworks.ru/        -> widget static site
https://widget.stackworks.ru/admin/  -> admin panel
https://api.stackworks.ru/health     -> backend API through FastPanel reverse proxy
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

Backend listens locally only:

```text
http://127.0.0.1:3000
```

FastPanel reverse proxy:

```text
api.stackworks.ru -> http://127.0.0.1:3000
```

Widget/admin webroot:

```text
/var/www/widget_stack_usr/data/www/widget.stackworks.ru
```

Admin panel lives under:

```text
/var/www/widget_stack_usr/data/www/widget.stackworks.ru/admin/
```

## Architecture decision

MVP is VPS-only.

Raspberry Pi 3B was removed from MVP because of Node.js/OS/DPKG problems:

- 32-bit OS: NodeSource armhf incompatibility and segfaults.
- 64-bit OS: NodeSource arm64 produced `Illegal instruction`.
- APT/DPKG corruption was observed.

Current architecture:

```text
Website with embed widget
  -> widget.stackworks.ru static widget/admin
  -> api.stackworks.ru HTTPS reverse proxy
  -> Node.js Fastify backend on 127.0.0.1:3000
  -> SQLite at /opt/ws-chat/data/chat.sqlite
  -> Telegram bridge via Telegraf
  -> optional SOCKS5 proxy for Telegram
  -> Telegram operators
```

## Current backend env requirements

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

TELEGRAM_BOT_TOKEN=
TELEGRAM_PROXY_ENABLED=false
TELEGRAM_PROXY_TYPE=socks5
TELEGRAM_PROXY_HOST=127.0.0.1
TELEGRAM_PROXY_PORT=9050
TELEGRAM_PROXY_USERNAME=
TELEGRAM_PROXY_PASSWORD=
```

Important: Telegram settings are now also persisted in SQLite `settings` table and managed from admin panel.

## Database

SQLite DB path:

```text
/opt/ws-chat/data/chat.sqlite
```

Tables currently managed by `backend/src/db.js`:

```text
sites
operators
site_operators
visitors
conversations
messages
settings
```

Default site:

```text
site id: site_default
widget_key: site_default
```

Important Telegram settings keys:

```text
telegram.bot_token
telegram.proxy.enabled
telegram.proxy.type
telegram.proxy.host
telegram.proxy.port
telegram.proxy.username
telegram.proxy.password
```

Check saved proxy settings on VPS:

```bash
sqlite3 /opt/ws-chat/data/chat.sqlite "select key, value from settings where key like 'telegram.proxy.%';"
```

Check token length without exposing token:

```bash
sqlite3 /opt/ws-chat/data/chat.sqlite "select key, length(value) as len from settings where key='telegram.bot_token';"
```

## Current backend endpoints

```text
GET  /health
GET  /api/config/public
GET  /api/admin/stats
GET  /api/admin/messages?limit=50
GET  /api/admin/telegram/settings
POST /api/admin/telegram/settings
POST /api/admin/telegram/test-proxy
POST /api/admin/telegram/restart
POST /api/widget/message
GET  /ws
```

`/health` now should include Telegram bridge state:

```json
{
  "ok": true,
  "service": "wschat-backend",
  "env": "production",
  "telegram": {
    "enabled": true,
    "running": true,
    "error": "",
    "username": "...",
    "proxyEnabled": true,
    "startedAt": "...",
    "hasBot": true
  }
}
```

## Admin panel current state

Admin is a React/Vite panel at:

```text
https://widget.stackworks.ru/admin/
```

Implemented:

- dark compact dashboard UI;
- API health indicator;
- stats cards;
- recent messages list from SQLite;
- auto-refresh of dashboard data;
- Telegram/SOCKS5 settings form;
- dirty-state protection so auto-refresh no longer wipes input while typing;
- token/password masks `********`;
- SOCKS5 enable/host/port/login/password fields;
- save settings button;
- test proxy button;
- reset form button.

Important fix: dashboard auto-refresh must not reload Telegram/SOCKS5 form while the user is editing it.

## Telegram bridge current state

Runtime bridge file:

```text
backend/src/telegram.js
```

Dependencies:

```text
telegraf
socks-proxy-agent
node-fetch
```

Current behavior:

- backend starts Telegram bridge on startup using settings from SQLite;
- `/start` registers Telegram user as active operator;
- new operator is linked to `site_default` through `site_operators`;
- `/status` replies with bridge status;
- text reply in Telegram can be saved as operator message if it is a reply to WSChat notification containing `Conversation: conv_...`;
- website visitor message is saved to SQLite and then sent to active Telegram operators;
- operator reply is saved to SQLite, but delivery back to widget via WebSocket is not finished yet.

Important: bridge originally used `socks5://`, but successful curl test showed Telegram must be accessed via `socks5h://` so DNS resolves through proxy.

Current fix:

```text
backend/src/telegram.js uses socks5h:// for SocksProxyAgent
```

Commit for this fix:

```text
4b46aabc8210158f97c3c6e9274b8f703f7a8aa2
```

## Telegram/SOCKS5 debugging history

Observed `/health` error before socks5h fix:

```text
request to https://api.telegram.org/bot.../getMe failed, reason: Proxy connection timed out
```

User confirmed SOCKS5 itself works from VPS with curl:

```bash
curl -v --proxy 'socks5h://proxy:Adelina%402015@194.156.65.175:42673' https://api.telegram.org
```

Result showed:

```text
SOCKS5 request granted
HTTP/2 302
```

This proves proxy works and Telegram is reachable through it.

Important note: the SOCKS5 password contains `@`. In curl URL it must be encoded as `%40`, but in admin panel it should be entered normally as `Adelina@2015`. Code uses `encodeURIComponent`, so the app should encode it correctly.

Current proxy values used in testing:

```text
Host: 194.156.65.175
Port: 42673
Login: proxy
Password: Adelina@2015
SOCKS5 enabled: true
```

Do not expose Telegram bot token in chat or logs.

## Important commits after original snapshot

- `eae37d38a98026c39e4cd71e0f54f94d4785d9e9` — admin dashboard shows stats/messages.
- `b9b68d401ce0a6661f169064a1fee4e5ca441f19` — updated admin styling.
- `d601e6925718e5d8c59394682da05ff25e4581a0` — DB functions for Telegram/SOCKS5 settings.
- `966c3cf531c61d13c300bb584b3cb50453c56a7c` — backend API for Telegram/SOCKS5 settings.
- `c1169032ee0809fcc0f52f8e7d1b8cdfd4c1f375` — proxy config validation endpoint.
- `1c644e1df7ebd5fb88e92fb3f6360f86355aac04` — Telegram/SOCKS5 form in admin.
- `53fad336d3013b9f1fc1e25fdac4149956dc356b` — styles for Telegram/SOCKS5 form.
- `9999139ab5c1cf227187d6b596caea8e2c0e7f32` — fixed auto-refresh wiping SOCKS5 form.
- `760e85e342fd1c08e9a80de6eb6429fca17ec3ac` — added backend dependencies for Telegram/SOCKS5 bridge.
- `5c6da6582e9d7077c4d7fe504b9731f853058072` — operators and operator messages DB functions.
- `72edf824e0d7ebf92dfc27dfc8a956d2d927448c` — added runtime Telegram bridge file.
- `47096dd0de601448a2c7f9ba1d5ac724f3bd7b69` — connected Telegram bridge to backend runtime.
- `b22381061236a3a9568a5a906375f73dcbe16f87` — restartable Telegram bridge.
- `27e94c96533b2955325d1d7e407f53d98bd0e81b` — restart endpoint and attempted auto-restart after settings save.
- `8632c577a8b798bd7c5480998156919988affccb` — separated settings save from bridge restart to avoid timeout wiping UI state.
- `4b46aabc8210158f97c3c6e9274b8f703f7a8aa2` — changed Telegram SOCKS agent to `socks5h://`.

## Deployment/update commands

Backend update:

```bash
cd /opt/ws-chat/source
git pull --ff-only origin main
cd backend
npm install
pm2 restart wschat-backend --update-env
```

Hard reset if server is behind or files are missing:

```bash
cd /opt/ws-chat/source
git fetch origin main
git reset --hard origin/main
git clean -fd
cd backend
npm install
pm2 delete wschat-backend
pm2 start src/server.js --name wschat-backend --update-env
pm2 save
```

Admin/widget build and publish:

```bash
cd /opt/ws-chat/source
npm install
npm run build
rsync -av --delete widget/dist/ /var/www/widget_stack_usr/data/www/widget.stackworks.ru/
rsync -av --delete admin-panel/dist/ /var/www/widget_stack_usr/data/www/widget.stackworks.ru/admin/
```

Health check:

```bash
curl -s http://127.0.0.1:3000/health | jq
```

Logs:

```bash
pm2 logs wschat-backend --lines 100
```

## FastPanel safety rules

Never from project scripts:

- edit `/etc/nginx/nginx.conf`;
- overwrite FastPanel vhost configs;
- run broad `systemctl restart nginx`;
- install packages that replace FastPanel web stack;
- bind project services directly to ports 80/443;
- delete parent `/var/www` directories;
- run `rsync --delete` against `/var/www` or parent directories.

Only copy static files into exact domain webroot directories.

## Current next steps

1. Pull latest code with `socks5h://` fix on VPS.
2. Restart backend with PM2.
3. Check `/health` and confirm `telegram.running: true`.
4. In Telegram, send `/start` to the bot and confirm operator registration.
5. Send a message from widget and confirm it arrives to Telegram operator.
6. Implement delivery of Telegram operator replies back to widget through WebSocket.
7. Add admin UI bridge status/restart button.
8. Add admin list of Telegram operators.
9. Add admin auth.
10. Add site CRUD and operator-site permissions.
11. Fix production widget build to emit stable `widget.js`.
12. Add origin/domain validation: `site_id + Origin` must match configured site.
13. Add updater bundle workflow.
14. Continue updating this `.sw` after each meaningful change.

## User preferences and constraints

- User wants practical development, not only planning.
- User wants all work in GitHub repository `viktor138irk/chat`.
- User wants to resume development in new dialogs using this `.sw` file.
- User explicitly wants `.sw` continuously updated.
- User prefers not to risk breaking FastPanel.
- User wants manual control over domains in FastPanel.
- User wants future auto-update file/bundle workflow.
- User changed architecture to VPS-only after Raspberry issues.
- VPS currently uses root user by default, so MVP installation can run as root.
- Widget and admin must live in one FastPanel site: widget at `/`, admin at `/admin/`.

## How to continue in a new chat

Open `.sw` first, then continue from `Current next steps`.

Recommended immediate task:

```text
Pull latest code on VPS, restart backend, verify Telegram bridge with socks5h proxy, then test /start.
```
