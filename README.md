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
- VPS with FastPanel for admin panel, widget.js, static assets, HTTPS, and public reverse proxy
- WireGuard between VPS and Raspberry Pi
- Domain/site management through FastPanel where possible

Cloudflare must not be required for this project.

Recommended OS for Raspberry Pi 3B MVP:

- Raspberry Pi OS Lite 32-bit for maximum RAM economy and stability on 1 GB RAM
- Raspberry Pi OS Lite 64-bit can be tested later if specific ARM64 packages are needed

## Core components

```text
website widget -> VPS FastPanel/Nginx/API proxy -> WireGuard -> Raspberry Pi backend -> SQLite -> Telegram bot -> operators

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
- FastPanel-safe frontend publishing on VPS

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

### FastPanel-safe frontend hosting

The frontend server uses FastPanel. The project deployment must not break, overwrite, restart, or bypass FastPanel-managed services.

Hard rules:

- Do not edit global FastPanel configs directly
- Do not overwrite `/etc/nginx/nginx.conf`
- Do not overwrite FastPanel-generated virtual host configs
- Do not run broad `systemctl restart nginx` from the deploy script
- Do not install packages that replace FastPanel web stack components
- Do not run frontend as root
- Do not bind frontend services to ports `80` or `443`
- Prefer static build publishing into a FastPanel-created site directory
- Use `nginx -t` before any reload if reload is unavoidable
- Prefer no reload at all for static frontend updates

Recommended FastPanel model:

```text
FastPanel creates domains/sites:
- admin.example.ru
- widget.example.ru
- api.example.ru

Deploy script only updates files inside the allowed web root:
- admin panel build files
- widget.js
- widget assets
```

Recommended FastPanel-safe paths:

```text
/var/www/<fastpanel-user>/data/www/admin.example.ru
/var/www/<fastpanel-user>/data/www/widget.example.ru
/opt/raspi-chat/source
/opt/raspi-chat/releases/<timestamp>
/opt/raspi-chat/current -> /opt/raspi-chat/releases/<timestamp>
```

Deployment should copy or rsync built static files into the FastPanel site directories:

```text
admin-panel/dist/* -> /var/www/<fastpanel-user>/data/www/admin.example.ru/
widget/dist/*      -> /var/www/<fastpanel-user>/data/www/widget.example.ru/
```

The API reverse proxy for `api.example.ru` should be configured through FastPanel custom Nginx directives if available, or through a separate include file that FastPanel will not overwrite.

FastPanel compatibility must be treated as a deployment requirement, not an afterthought.

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
- FastPanel compatibility status
- Target FastPanel web root paths

Frontend deployment flow:

```text
Admin clicks update button
  -> backend validates admin permissions
  -> backend calls deploy agent on VPS
  -> VPS pulls latest repository changes
  -> VPS builds admin-panel and widget
  -> VPS verifies FastPanel-safe target paths
  -> VPS publishes new static build atomically
  -> backend stores deployment result
  -> admin panel shows status and logs
```

Recommended deploy command on VPS:

```bash
git fetch origin main
npm ci
npm run build --workspace admin-panel
npm run build --workspace widget
```

Publishing must be atomic and FastPanel-safe:

```text
build new release directory
verify build artifacts
verify target directories are inside allowed FastPanel web roots
copy files with rsync --delete only inside those roots
never delete parent web root directories
never touch FastPanel system configs
```

Admin deployment permissions:

- Only users with role `admin` can trigger frontend updates
- Deployment endpoint must require JWT auth
- Deployment webhook must require secret token validation
- All deployment attempts must be logged

Environment variables:

```env
FRONTEND_DEPLOY_ENABLED=true
FRONTEND_DEPLOY_MODE=local-vps
FRONTEND_DEPLOY_BRANCH=main
FRONTEND_DEPLOY_SOURCE_PATH=/opt/raspi-chat/source
FRONTEND_DEPLOY_RELEASES_PATH=/opt/raspi-chat/releases
FRONTEND_DEPLOY_ADMIN_WEBROOT=/var/www/example_user/data/www/admin.example.ru
FRONTEND_DEPLOY_WIDGET_WEBROOT=/var/www/example_user/data/www/widget.example.ru
FRONTEND_DEPLOY_WEBHOOK_SECRET=
FRONTPANEL_SAFE_MODE=true
```

MVP implementation should run the deployment agent directly on the VPS. The deploy agent must have permissions only for the project source, release directory, and specific FastPanel web roots.

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
- FastPanel-managed web server on VPS
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

- FastPanel-safe VPS frontend deployment scripts
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
- Deployment guide for Raspberry Pi, VPS, FastPanel, and WireGuard

### Phase 5

- Android app API preparation
- Push notification model
- Multi-device operator sessions
