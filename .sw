# WSChat development state snapshot

Project: WSChat
Repository: https://github.com/viktor138irk/chat
Default branch: main

## Mandatory rule

Always update this `.sw` file after meaningful code, deployment, architecture, or debugging changes.

Never store secrets in this file: no Telegram tokens, proxy passwords, API keys, SSH credentials, or similar values. Use `[REDACTED]`.

## Product

Self-hosted live chat similar to Jivo. Website widget sends visitor messages to Telegram operators. Operators reply in Telegram, and replies return back into the website widget through WebSocket.

## Deployment

```text
widget/admin: https://widget.stackworks.ru/
admin panel:  https://widget.stackworks.ru/admin/
backend API:  https://api.stackworks.ru/health
backend local: http://127.0.0.1:3000
PM2 process:  wschat-backend
source:       /opt/ws-chat/source
data:         /opt/ws-chat/data
SQLite:       /opt/ws-chat/data/chat.sqlite
webroot:      /var/www/widget_stack_usr/data/www/widget.stackworks.ru
```

MVP architecture is VPS-only. Raspberry Pi was removed from MVP because of Node.js/OS/DPKG instability.

## Database and settings

Correct DB path:

```text
/opt/ws-chat/data/chat.sqlite
```

Production fallback DB path was fixed to the same value even if `.env` is not loaded.

`/health` now includes `dbPath`; it must show:

```text
/opt/ws-chat/data/chat.sqlite
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

## Current endpoints

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

## WebSocket architecture

Widget now opens:

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
- `/start` registers operator;
- `/status` replies with bridge state;
- visitor messages go to active Telegram operators;
- Telegram replies are saved as operator messages;
- Telegram replies are delivered back to widget through WebSocket.

Important proxy fix:

```text
Telegram bridge must use socks5h:// so DNS resolution goes through proxy.
```

## Current debugging status

Current observed Telegram error:

```text
409 Conflict: terminated by other getUpdates request; make sure that only one bot instance is running
```

Meaning: Telegram token/proxy are usable, but two polling instances are running for the same bot token.

Most likely cause: a manual `node src/server.js` process was started during debugging and is still alive while PM2 also runs `wschat-backend`.

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

If 409 persists:

```bash
ps aux | grep -E "node|server.js|wschat" | grep -v grep
```

Only one polling instance may run per Telegram bot token.

## Important recent commits

```text
4b46aabc8210158f97c3c6e9274b8f703f7a8aa2 - Telegram proxy changed to socks5h
6f14353cd403f351c89e4274d189808951dcf940 - production DB fallback fixed
be004fd14ab16e3b1262980fe044356d2efbe806 - health endpoint includes dbPath
ec2eeeea66047dcd982a4c0258d1338314e25c29 - WebSocket delivery from Telegram replies implemented
49f502f84c8e2d2979481d71010908457fb0ce84 - widget connected to WebSocket backend
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

Frontend build/publish:

```bash
cd /opt/ws-chat/source
npm install
npm run build
rsync -av --delete widget/dist/ /var/www/widget_stack_usr/data/www/widget.stackworks.ru/
rsync -av --delete admin-panel/dist/ /var/www/widget_stack_usr/data/www/widget.stackworks.ru/admin/
```

Health/logs:

```bash
curl -s http://127.0.0.1:3000/health | jq
pm2 logs wschat-backend --lines 100
```

## FastPanel safety rules

Never edit global FastPanel/nginx configs from project scripts. Never bind project services directly to ports 80/443. Never run `rsync --delete` against `/var/www` or parent directories. Copy static files only into exact domain webroots.

## Current next steps

1. Kill duplicate Telegram polling process.
2. Start exactly one PM2 process `wschat-backend`.
3. Confirm `/health`: correct `dbPath`, `telegram.running=true`, and `wsClients` counter.
4. Send `/start` to the Telegram bot.
5. Send widget message and confirm it reaches Telegram.
6. Reply in Telegram and confirm it instantly appears in widget.
7. Add admin bridge status/restart button.
8. Add admin operator list.
9. Add admin auth.
10. Fix production widget build to emit stable `widget.js`.
