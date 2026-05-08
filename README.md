# Raspi Telegram Live Chat

Self-hosted live chat system for Raspberry Pi with embeddable website widget, web admin panel, Telegram as the operator interface, and a separate VPS-hosted frontend.

## Goal

Build a lightweight Jivo-like chat platform where visitors write through a website widget and only Telegram operators configured in the admin panel receive and answer messages.

## Target deployment

Primary target for MVP:

- Raspberry Pi 3 Model B at home
- Raspberry Pi OS Lite 32-bit
- Backend API on Raspberry Pi
- Telegram bot on Raspberry Pi
- SQLite database on Raspberry Pi
- VPS for admin panel, widget.js, static assets, HTTPS, and public reverse proxy
- WireGuard between VPS and Raspberry Pi
- Nginx + Let's Encrypt on VPS

Cloudflare must not be required for this project.

Recommended OS for Raspberry Pi 3B MVP:

- Raspberry Pi OS Lite 32-bit for maximum RAM economy and stability on 1 GB RAM
- Raspberry Pi OS Lite 64-bit can be tested later if specific ARM64 packages are needed

## Core components

```text
website widget -> VPS Nginx/API proxy -> WireGuard -> Raspberry Pi backend -> SQLite -> Telegram bot -> operators

VPS also serves:
- admin panel
- widget.js
- static assets
```

## MVP modules

- Backend API
- WebSocket gateway
- Telegram bot bridge
- Embeddable website widget
- Web admin panel
- SQLite storage
- Operator/site access rules
- SOCKS5 proxy settings for Telegram connectivity
- Frontend deployment management from admin panel

## Required admin settings

### Telegram bot

- Bot token
- Webhook or polling mode
- Allowed operators
- Operator-to-site mapping

### SOCKS5 proxy

The system must support optional SOCKS5 configuration for Telegram requests:

```env
TELEGRAM_PROXY_ENABLED=false
TELEGRAM_PROXY_TYPE=socks5
TELEGRAM_PROXY_HOST=127.0.0.1
TELEGRAM_PROXY_PORT=9050
TELEGRAM_PROXY_USERNAME=
TELEGRAM_PROXY_PASSWORD=
```

Admin panel should expose:

- Enable/disable SOCKS5
- Proxy host
- Proxy port
- Username
- Password
- Test connection button

Sensitive fields must be stored encrypted or kept in environment variables for MVP.

### Frontend deployment updates

The admin panel must include a deployment section for updating the VPS-hosted frontend.

Required modes:

1. Manual update by button
2. Automatic update by webhook from GitHub
3. Optional scheduled update check

Admin panel should expose:

- Current frontend version
- Current commit hash
- Last deployment time
- Last deployment status
- Update branch, default: `main`
- Button: `Check for updates`
- Button: `Update frontend now`
- Deployment logs
- Rollback to previous frontend build
- Lock to prevent parallel deployments

Frontend deployment flow:

```text
Admin clicks update button
  -> backend validates admin permissions
  -> backend calls deploy agent on VPS
  -> VPS pulls latest repository changes
  -> VPS builds admin-panel and widget
  -> VPS publishes new build atomically
  -> backend stores deployment result
  -> admin panel shows status and logs
```

Recommended VPS frontend paths:

```text
/opt/raspi-chat/source
/opt/raspi-chat/releases/<timestamp>
/opt/raspi-chat/current -> /opt/raspi-chat/releases/<timestamp>
/var/www/raspi-chat/admin
/var/www/raspi-chat/widget
```

Recommended deploy command on VPS:

```bash
git fetch origin main
npm ci
npm run build --workspace admin-panel
npm run build --workspace widget
```

Publishing must be atomic:

```text
build new release directory
verify build artifacts
switch symlink
reload nginx only if needed
```

Admin deployment permissions:

- Only users with role `admin` can trigger frontend updates
- Deployment endpoint must require JWT auth
- Deployment webhook must require secret token validation
- All deployment attempts must be logged

Environment variables:

```env
FRONTEND_DEPLOY_ENABLED=true
FRONTEND_DEPLOY_MODE=ssh
FRONTEND_DEPLOY_BRANCH=main
FRONTEND_DEPLOY_HOST=127.0.0.1
FRONTEND_DEPLOY_USER=deploy
FRONTEND_DEPLOY_PATH=/opt/raspi-chat/source
FRONTEND_DEPLOY_WEBHOOK_SECRET=
```

MVP implementation can run the deployment agent directly on VPS. Raspberry backend should call the VPS deploy endpoint through HTTPS, or the admin panel can call the VPS deploy API directly if protected by strong authentication.

## Website widget

Example embed code:

```html
<script src="https://widget.example.ru/widget.js" data-site-id="site_xxxxx"></script>
```

The widget must connect to the public API endpoint on VPS:

```text
https://api.example.ru
wss://api.example.ru/ws
```

## Message flow

```text
Visitor sends message on website
  -> widget sends message to VPS api.example.ru
  -> VPS proxies request through WireGuard to Raspberry Pi backend
  -> backend validates site_id and origin domain
  -> backend stores message
  -> backend finds active operators assigned to this site
  -> Telegram bot sends message only to those operators
  -> operator replies in Telegram
  -> backend maps reply to conversation
  -> message is delivered back to website widget through WebSocket
```

## Future Android app

The backend must expose stable REST and WebSocket APIs so an Android app can later work as another operator interface.

Planned Android-ready API concepts:

- JWT auth
- refresh tokens
- operator sessions
- conversation list
- message history
- push-ready notification events
- WebSocket live updates

## Initial stack

- Node.js
- Fastify
- WebSocket
- SQLite
- React + Vite admin panel
- Vanilla JS widget
- Telegram Bot API
- WireGuard
- Nginx
- PM2 preferred for Raspberry Pi 3B MVP

## Development phases

### Phase 1

- Website widget
- Backend API
- Telegram message forwarding
- Reply from Telegram back to website
- SQLite persistence

### Phase 2

- Admin login
- Site management
- Operator management
- Site/operator permissions
- Widget embed code generator
- SOCKS5 proxy settings

### Phase 3

- VPS frontend deployment scripts
- Admin button for frontend update
- Deployment logs
- GitHub webhook auto-update
- Frontend rollback support

### Phase 4

- Conversation history
- Dialog statuses
- Rate limiting
- Origin/domain validation
- Backup script
- Deployment guide for Raspberry Pi and VPS

### Phase 5

- Android app API preparation
- Push notification model
- Multi-device operator sessions
