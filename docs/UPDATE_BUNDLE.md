# Update bundle workflow

This project can be updated manually by copying an update bundle to the VPS and running a controlled updater script.

The VPS has FastPanel, so updates must not manage domains or global web server configs.

## Goal

The assistant can prepare a versioned update bundle file. The user uploads it to the VPS. The updater applies updates to:

- admin panel static files
- widget static files
- backend/API source on Raspberry Pi or deployment instructions for Raspberry Pi
- docs/config templates

## Recommended VPS directory layout

Use one project directory on VPS:

```text
/opt/raspi-chat/
  source/              # git clone or unpacked project source
  updates/             # uploaded update bundles
  backups/             # previous static builds/config backups
  logs/                # updater logs
  build/               # temporary build output
```

FastPanel still owns public website directories:

```text
/var/www/<fastpanel-user>/data/www/admin.example.ru
/var/www/<fastpanel-user>/data/www/widget.example.ru
```

The API subdomain is not a static directory. It should be a reverse proxy:

```text
api.example.ru -> VPS FastPanel/Nginx -> WireGuard -> Raspberry Pi backend
```

## One project directory, three subdomains

Recommended mapping:

```text
admin.example.ru
  public files from /opt/raspi-chat/source/admin-panel/dist
  copied to /var/www/<user>/data/www/admin.example.ru

widget.example.ru
  public files from /opt/raspi-chat/source/widget/dist
  copied to /var/www/<user>/data/www/widget.example.ru

api.example.ru
  no static deploy
  reverse proxy to http://10.8.0.2:3000
```

If FastPanel forces every subdomain to have a webroot, create one for `api.example.ru`, but do not publish project files there. Configure it as proxy-only where possible.

## Update bundle format

Preferred bundle name:

```text
raspi-chat-update-YYYYMMDD-HHMMSS.tar.gz
```

Preferred structure inside bundle:

```text
manifest.json
source/
  package.json
  backend/
  admin-panel/
  widget/
  deploy/
  docs/
scripts/
  apply-update.sh
```

Example `manifest.json`:

```json
{
  "project": "raspi-chat",
  "version": "0.1.0",
  "commit": "unknown",
  "requires": {
    "node": ">=20",
    "fastpanelSafeMode": true
  },
  "targets": {
    "admin": true,
    "widget": true,
    "api": true
  }
}
```

## Manual updater flow on VPS

```text
1. Upload bundle to /opt/raspi-chat/updates
2. Extract bundle into temporary directory
3. Validate manifest
4. Backup current admin/widget webroots
5. Build admin-panel
6. Build widget
7. Copy static files into FastPanel webroots
8. Do not touch FastPanel global configs
9. Print API/backend update notes
```

## API/backend updates

The backend runs on Raspberry Pi, not on the FastPanel VPS. Therefore API updates have two safe modes:

### Mode A: Git pull on Raspberry Pi

```bash
cd ~/apps/chat
git pull --ff-only origin main
npm install
pm2 restart raspi-chat-backend
```

### Mode B: update bundle for Raspberry Pi

Copy backend files from the update bundle to Raspberry Pi and restart PM2.

Recommended Raspberry Pi path:

```text
~/apps/chat
```

## FastPanel-safe rule

The updater may write only to:

```text
/opt/raspi-chat/source
/opt/raspi-chat/updates
/opt/raspi-chat/backups
/opt/raspi-chat/logs
/var/www/<fastpanel-user>/data/www/admin.example.ru
/var/www/<fastpanel-user>/data/www/widget.example.ru
```

The updater must not write to:

```text
/etc/nginx
/etc/apache2
/usr/local/fastpanel2
/var/www
/var/www/<fastpanel-user>
/var/www/<fastpanel-user>/data/www
```

## Future admin button

When manual updates are stable, the admin panel can get a button:

```text
Upload update bundle
Validate bundle
Apply frontend update
Show backend update instructions
```

For MVP, manual terminal execution is safer.
