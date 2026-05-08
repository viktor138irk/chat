# WSChat development state snapshot

Project: WSChat
Repository: https://github.com/viktor138irk/chat
Default branch: main

## Mandatory rule

Always update this `.sw` file after meaningful code, deployment, architecture, or debugging changes.

Never store secrets in this file: no Telegram tokens, proxy passwords, API keys, SSH credentials, or similar values. Use `[REDACTED]`.

## Product

Self-hosted live chat similar to Jivo/Tidio. Website widget sends visitor messages to Telegram operators. Operators reply in Telegram, and replies return back into the website widget through WebSocket.

MVP is currently functional:

```text
website -> widget.js -> backend -> Telegram operator -> backend -> WebSocket -> website widget
```

## Deployment

```text
widget/test page: https://widget.stackworks.ru/
admin panel:      https://widget.stackworks.ru/admin/
backend API:      https://api.stackworks.ru/health
backend local:    http://127.0.0.1:3000
PM2 process:      wschat-backend
source:           /opt/ws-chat/source
data:             /opt/ws-chat/data
SQLite:           /opt/ws-chat/data/chat.sqlite
webroot:          /var/www/widget_stack_usr/data/www/widget.stackworks.ru
```

MVP architecture is VPS-only. Raspberry Pi was removed from MVP because of Node.js/OS/DPKG instability.

## Working domains/sites

Known working sites:

```text
widget.stackworks.ru -> site_default
stackworks.ru        -> site_stackworks
```

Known Telegram operator:

```text
telegram_user_id: 833333156
```

This operator is linked to both:

```text
site_default
site_stackworks
```

## Database and settings

Correct DB path:

```text
/opt/ws-chat/data/chat.sqlite
```

Production fallback DB path was fixed to the same value even if `.env` is not loaded.

`/health` must show:

```text
dbPath=/opt/ws-chat/data/chat.sqlite
telegram.running=true
telegram.hasBot=true
wsClients=<number>
```

Settings come from SQLite table `settings`, not from frontend.

Important keys:

```text
telegram.bot_token
telegram.proxy.enabled
telegram.proxy.type
telegram.proxy.host
telegram.proxy.port
telegram.proxy.username
telegram.proxy.password
```

Diagnostics:

```bash
sqlite3 /opt/ws-chat/data/chat.sqlite "select id,name,domain,widget_key,is_active from sites;"
sqlite3 /opt/ws-chat/data/chat.sqlite "select id,name,telegram_user_id,is_active from operators;"
sqlite3 /opt/ws-chat/data/chat.sqlite "select * from site_operators;"
sqlite3 /opt/ws-chat/data/chat.sqlite "select key, value from settings where key like 'telegram.proxy.%';"
sqlite3 /opt/ws-chat/data/chat.sqlite "select key, length(value) as len from settings where key='telegram.bot_token';"
```

If a DB exists inside `/opt/ws-chat/source/backend/data/`, that was a wrong fallback DB from older code.

## Current endpoints

```text
GET    /health
GET    /api/config/public
GET    /api/admin/stats
GET    /api/admin/messages?limit=50
GET    /api/admin/sites
POST   /api/admin/sites
GET    /api/admin/operators
POST   /api/admin/site-operators
DELETE /api/admin/site-operators
GET    /api/admin/telegram/settings
POST   /api/admin/telegram/settings
POST   /api/admin/telegram/test-proxy
POST   /api/admin/telegram/restart
POST   /api/widget/message
GET    /ws
```

## WebSocket architecture

Widget opens:

```text
/ws?siteId=<siteId>&visitorId=<visitorId>
```

Backend stores WebSocket clients by:

```text
siteId:visitorId
```

Telegram replies are delivered from:

```text
telegram.js -> operatorMessageNotifier -> server.js broadcastToVisitor()
```

Payload format:

```json
{
  "type": "operator_message",
  "conversationId": "conv_xxx",
  "message": {
    "id": "msg_xxx",
    "direction": "operator",
    "body": "text"
  }
}
```

Nginx for `api.stackworks.ru` must proxy `/ws` with upgrade headers. Includes file used:

```text
/etc/nginx/fastpanel2-sites/api_stackwor_usr/api.stackworks.ru.includes
```

Required block:

```nginx
location /ws {
    proxy_pass http://127.0.0.1:3000/ws;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_read_timeout 86400;
}
```

Check:

```bash
wscat -c "wss://api.stackworks.ru/ws?siteId=site_default&visitorId=test"
```

Expected:

```json
{"type":"connected","siteId":"site_default","visitorId":"test"}
```

## Telegram bridge

Runtime file:

```text
backend/src/telegram.js
```

Dependencies:

```text
telegraf
socks-proxy-agent
node-fetch
```

Implemented:

- bridge startup from SQLite settings;
- SOCKS5 proxy support;
- `socks5h://` proxy URL so DNS resolves through proxy;
- `/start` registers operator;
- `/status` replies with bridge state and active dialog;
- visitor messages go to active Telegram operators;
- Telegram reply to notification still works;
- inline button `Ответить в этот чат` selects active conversation;
- after selecting active conversation, normal Telegram messages are sent to that website visitor without reply;
- inline button `Сбросить активный диалог` clears selected dialog;
- Telegram replies are saved as operator messages;
- Telegram replies are delivered back to widget through WebSocket.

Important: only one polling instance may run per Telegram bot token.

Old observed Telegram error:

```text
409 Conflict: terminated by other getUpdates request; make sure that only one bot instance is running
```

Fix on VPS:

```bash
pkill -f "/opt/ws-chat/source/backend/src/server.js" || true
pkill -f "node src/server.js" || true
pm2 delete wschat-backend || true
cd /opt/ws-chat/source/backend
pm2 start src/server.js --name wschat-backend --update-env
pm2 save
sleep 5
curl -s http://127.0.0.1:3000/health | jq
```

## Widget

Runtime file:

```text
widget/src/widget.js
```

Production build now emits stable:

```text
https://widget.stackworks.ru/widget.js
```

Embed code example for `stackworks.ru`:

```html
<script
  src="https://widget.stackworks.ru/widget.js?v=20"
  data-site-id="site_stackworks"
  data-api-url="https://api.stackworks.ru"
  data-ws-url="wss://api.stackworks.ru"
></script>
```

Current widget implementation uses Shadow DOM for full style isolation. This was required because CSS on `stackworks.ru` broke the chat layout even with `!important` rules.

Current widget features:

- floating chat button;
- close button in header;
- mobile close works;
- header fixed height;
- form fixed at bottom;
- messages area fills remaining height;
- WebSocket auto-connect;
- automatic reconnect message;
- operator replies open chat automatically;
- Shadow DOM prevents host-site CSS from breaking input/button/form/layout.

## Admin panel

Admin URL:

```text
https://widget.stackworks.ru/admin/
```

Admin current features:

- dashboard stats;
- recent messages;
- Telegram/SOCKS5 settings;
- test proxy;
- restart Telegram bridge;
- list sites;
- add site;
- show widget key;
- show/copy embed code;
- list Telegram operators;
- bind/unbind operators to sites.

Admin UI was compacted, but visual polish is postponed.

Important deployment caveat: admin lives inside the same webroot as widget. Running this command deletes `/admin/` and causes 404:

```bash
rsync -av --delete /opt/ws-chat/source/widget/dist/ /var/www/widget_stack_usr/data/www/widget.stackworks.ru/
```

Do not use `--delete` when deploying widget into the shared webroot unless `/admin` is excluded.

Safe widget deploy:

```bash
cp -a /opt/ws-chat/source/widget/dist/. /var/www/widget_stack_usr/data/www/widget.stackworks.ru/
```

or:

```bash
rsync -av /opt/ws-chat/source/widget/dist/ /var/www/widget_stack_usr/data/www/widget.stackworks.ru/
```

Safe admin deploy:

```bash
mkdir -p /var/www/widget_stack_usr/data/www/widget.stackworks.ru/admin
rsync -av --delete /opt/ws-chat/source/admin-panel/dist/ /var/www/widget_stack_usr/data/www/widget.stackworks.ru/admin/
chown -R widget_stack_usr:widget_stack_usr /var/www/widget_stack_usr/data/www/widget.stackworks.ru
```

## Deployment commands

Backend update:

```bash
cd /opt/ws-chat/source
git pull --ff-only origin main
cd backend
npm install
pm2 restart wschat-backend --update-env
```

Frontend build:

```bash
cd /opt/ws-chat/source
npm install
npm run build
```

Safe frontend publish:

```bash
cp -a /opt/ws-chat/source/widget/dist/. /var/www/widget_stack_usr/data/www/widget.stackworks.ru/
mkdir -p /var/www/widget_stack_usr/data/www/widget.stackworks.ru/admin
rsync -av --delete /opt/ws-chat/source/admin-panel/dist/ /var/www/widget_stack_usr/data/www/widget.stackworks.ru/admin/
chown -R widget_stack_usr:widget_stack_usr /var/www/widget_stack_usr/data/www/widget.stackworks.ru
```

Health/logs:

```bash
curl -s http://127.0.0.1:3000/health | jq
curl -s https://api.stackworks.ru/health | jq
pm2 logs wschat-backend --lines 100
```

Check public assets:

```bash
curl -I https://widget.stackworks.ru/widget.js
curl -I https://widget.stackworks.ru/admin/
```

## FastPanel safety rules

Never edit global FastPanel/nginx configs from project scripts. Never bind project services directly to ports 80/443. Never run `rsync --delete` against `/var/www` or parent directories. Copy static files only into exact domain webroots.

`widget.stackworks.ru` currently uses Apache backend under FastPanel, but DocumentRoot is correct:

```text
/var/www/widget_stack_usr/data/www/widget.stackworks.ru
```

## Important recent commits

```text
4b46aabc8210158f97c3c6e9274b8f703f7a8aa2 - Telegram proxy changed to socks5h
6f14353cd403f351c89e4274d189808951dcf940 - production DB fallback fixed
be004fd14ab16e3b1262980fe044356d2efbe806 - health endpoint includes dbPath
ec2eeeea66047dcd982a4c0258d1338314e25c29 - WebSocket delivery from Telegram replies implemented
49f502f84c8e2d2979481d71010908457fb0ce84 - widget connected to WebSocket backend
258d5285382e9038167881fd6eccead02f3d6457 - stable Vite widget.js build
5ba7bd846b19bc2ea76c7610e16d2b00aa7b838a - admin API for sites/operators
5fb492ef7b6aa94374929d2a90caf71a4881c59d - Telegram inline answer button and active dialog mode
ccda416945d3608c5945e7adc3ce5502abf9a707 - compact admin CSS pass
bfdc9f091c1990a04b0c62593dfb94c4ec600f72 - widget moved to Shadow DOM
```

## Current next steps

Highest priority:

1. Add admin auth/login. Current admin is public and must not remain public.
2. Add web admin conversations page with selected conversation and full history.
3. Add conversation status: open/closed.
4. Add operator assignment / `take in work` flow.
5. Add offline mode: visitor name/phone/email + Telegram ticket.
6. Add sound notifications and unread counters.
7. Improve widget customization from admin: title, subtitle, color, position.
8. Later: split admin to separate subdomain, for example `admin.widget.stackworks.ru`, to avoid shared-webroot deploy collisions.
9. Later: replace SQLite with PostgreSQL for production scale.
10. Later: Docker compose / installer.
