# Manual frontend installation on VPS with FastPanel

This guide is for the safe mode where FastPanel manages domains, SSL certificates, and web server configs manually through its UI.

The project must not create domains, edit FastPanel virtual hosts, or restart the web stack automatically.

## Goal

```text
FastPanel UI:
- create domains
- enable SSL
- choose web root directories
- configure api reverse proxy if needed

Project scripts:
- build admin-panel
- build widget
- copy static files only into selected web roots
```

## Recommended domains

Choose domains manually in FastPanel, for example:

```text
admin.example.ru   -> admin panel
widget.example.ru  -> embeddable widget
api.example.ru     -> reverse proxy to Raspberry Pi backend
```

All DNS A-records should point to the VPS IP:

```text
admin.example.ru   A  VPS_IP
widget.example.ru  A  VPS_IP
api.example.ru     A  VPS_IP
```

## Step 1. Create sites in FastPanel manually

In FastPanel:

1. Create website `admin.example.ru`
2. Create website `widget.example.ru`
3. Create website `api.example.ru`
4. Enable Let's Encrypt SSL for each domain
5. Check that each site opens in browser

Do not configure this through project scripts.

## Step 2. Find web root paths

FastPanel usually stores website files here:

```text
/var/www/<fastpanel-user>/data/www/<domain>
```

Examples:

```text
/var/www/siteuser/data/www/admin.example.ru
/var/www/siteuser/data/www/widget.example.ru
```

Confirm exact paths in FastPanel before configuring deploy.

## Step 3. Build frontend locally on VPS

SSH into VPS:

```bash
cd /opt/raspi-chat/source
git pull --ff-only origin main
npm install
npm run build:admin
npm run build:widget
```

Expected output directories:

```text
admin-panel/dist
widget/dist
```

## Step 4. Copy admin panel files manually

Replace `siteuser` and domains with your real FastPanel user/domain paths.

```bash
rsync -av --delete admin-panel/dist/ /var/www/siteuser/data/www/admin.example.ru/
```

## Step 5. Copy widget files manually

```bash
rsync -av --delete widget/dist/ /var/www/siteuser/data/www/widget.example.ru/
```

Important safety rule:

```text
Use --delete only inside the exact domain web root.
Never run rsync --delete against /var/www, /var/www/<user>, or /var/www/<user>/data/www.
```

## Step 6. Manual widget embed code

After publishing widget files, use:

```html
<script
  src="https://widget.example.ru/widget.js"
  data-site-id="site_xxxxx"
  data-api-url="https://api.example.ru">
</script>
```

## Step 7. Manual API reverse proxy

The `api.example.ru` domain should proxy traffic to Raspberry Pi backend through WireGuard.

Target:

```text
http://10.8.0.2:3000
```

Configure this through FastPanel custom Nginx settings if available.

Required behavior:

```text
https://api.example.ru/health -> http://10.8.0.2:3000/health
https://api.example.ru/api/*  -> http://10.8.0.2:3000/api/*
wss://api.example.ru/ws       -> http://10.8.0.2:3000/ws
```

Typical Nginx custom directives:

```nginx
location /ws {
    proxy_pass http://10.8.0.2:3000/ws;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}

location / {
    proxy_pass http://10.8.0.2:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

Before any reload:

```bash
sudo nginx -t
```

Reload only if FastPanel/custom config requires it:

```bash
sudo systemctl reload nginx
```

## Step 8. Disable automatic frontend deploy if manual mode is preferred

In backend/deploy settings use:

```env
FRONTEND_DEPLOY_ENABLED=false
FRONTEND_DEPLOY_MODE=manual-fastpanel
```

In this mode, the admin panel can show deployment instructions and current version, but it must not run deployment commands.

## Recommended manual update flow

```bash
cd /opt/raspi-chat/source
git pull --ff-only origin main
npm install
npm run build:admin
npm run build:widget
rsync -av --delete admin-panel/dist/ /var/www/siteuser/data/www/admin.example.ru/
rsync -av --delete widget/dist/ /var/www/siteuser/data/www/widget.example.ru/
```

## Safety checklist

Before copying files:

```bash
pwd
ls admin-panel/dist
ls widget/dist
```

Check target paths:

```bash
ls /var/www/siteuser/data/www/admin.example.ru
ls /var/www/siteuser/data/www/widget.example.ru
```

Never run:

```bash
rm -rf /var/www/*
rsync --delete something/ /var/www/
systemctl restart nginx
```

Manual FastPanel mode is the safest option for a VPS where other production websites are already running.
