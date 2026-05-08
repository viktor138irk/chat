# FastPanel-safe frontend deployment

The VPS runs FastPanel, so deployment must update only project static files and must not manage the whole web stack.

## FastPanel sites

Create these sites in FastPanel:

- `admin.example.ru`
- `widget.example.ru`
- `api.example.ru`

The admin and widget domains should serve static files.

## Safe deploy user

Create a limited deploy user or run deploys as the FastPanel site owner. The user needs write access only to:

```text
/opt/raspi-chat/source
/var/www/<fastpanel-user>/data/www/admin.example.ru
/var/www/<fastpanel-user>/data/www/widget.example.ru
```

## What the deploy script does

```text
git fetch/pull
npm ci
build admin-panel
build widget
rsync dist files into FastPanel web roots
```

## What the deploy script must not do

```text
edit /etc/nginx/nginx.conf
rewrite FastPanel vhost configs
restart nginx/apache/mysql/php-fpm
bind to ports 80/443
remove /var/www parent directories
```

## Environment

Copy:

```bash
cp deploy/deploy-agent/.env.example deploy/deploy-agent/.env
```

Edit paths:

```env
FRONTEND_DEPLOY_SOURCE_PATH=/opt/raspi-chat/source
FRONTEND_DEPLOY_ADMIN_WEBROOT=/var/www/example_user/data/www/admin.example.ru
FRONTEND_DEPLOY_WIDGET_WEBROOT=/var/www/example_user/data/www/widget.example.ru
FASTPANEL_SAFE_MODE=true
```

## Run deploy manually

From repository root on VPS:

```bash
npm install
npm run deploy:frontend
```

## API reverse proxy

For `api.example.ru`, configure FastPanel custom Nginx directives to proxy traffic through WireGuard to Raspberry Pi backend.

Example target:

```text
http://10.8.0.2:3000
```

WebSocket path:

```text
/ws
```

Use FastPanel UI or a FastPanel-safe include file. Do not overwrite FastPanel generated configs directly.
