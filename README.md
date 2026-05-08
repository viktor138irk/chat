# Raspi Telegram Live Chat

Self-hosted live chat system for Raspberry Pi with embeddable website widget, web admin panel, and Telegram as the operator interface.

## Goal

Build a lightweight Jivo-like chat platform where visitors write through a website widget and only Telegram operators configured in the admin panel receive and answer messages.

## Target device

Primary target for MVP:

- Raspberry Pi 3 Model B
- Raspberry Pi OS Lite
- Node.js backend
- SQLite database
- Nginx reverse proxy
- Cloudflare Tunnel or VPS proxy for public HTTPS access

Recommended OS for Raspberry Pi 3B MVP:

- Raspberry Pi OS Lite 32-bit for maximum RAM economy and stability on 1 GB RAM
- Raspberry Pi OS Lite 64-bit can be tested later if specific ARM64 packages are needed

## Core components

```text
website widget -> backend API/WebSocket -> SQLite -> Telegram bot -> operators
                         |
                         -> web admin panel
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

## Website widget

Example embed code:

```html
<script src="https://chat.example.com/widget.js" data-site-id="site_xxxxx"></script>
```

## Message flow

```text
Visitor sends message on website
  -> backend receives message
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
- Docker optional, PM2 preferred for Raspberry Pi 3B MVP

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

- Conversation history
- Dialog statuses
- Rate limiting
- Origin/domain validation
- Backup script
- Deployment guide for Raspberry Pi

### Phase 4

- Android app API preparation
- Push notification model
- Multi-device operator sessions
