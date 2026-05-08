import dotenv from 'dotenv';
import { execFileSync } from 'node:child_process';
import { existsSync, realpathSync, statSync } from 'node:fs';
import path from 'node:path';

dotenv.config();

const sourcePath = process.env.FRONTEND_DEPLOY_SOURCE_PATH || '/opt/raspi-chat/source';
const adminWebroot = process.env.FRONTEND_DEPLOY_ADMIN_WEBROOT;
const widgetWebroot = process.env.FRONTEND_DEPLOY_WIDGET_WEBROOT;
const branch = process.env.FRONTEND_DEPLOY_BRANCH || 'main';
const safeMode = process.env.FASTPANEL_SAFE_MODE !== 'false';

function run(command, args, cwd = sourcePath) {
  console.log(`$ ${command} ${args.join(' ')}`);
  execFileSync(command, args, { cwd, stdio: 'inherit' });
}

function assertDirectory(label, target) {
  if (!target) throw new Error(`${label} is required`);
  if (!existsSync(target)) throw new Error(`${label} does not exist: ${target}`);
  if (!statSync(target).isDirectory()) throw new Error(`${label} is not a directory: ${target}`);
}

function assertFastPanelSafe(label, target) {
  if (!safeMode) return;
  const real = realpathSync(target);
  const normalized = real.replaceAll('\\', '/');
  const valid = normalized.startsWith('/var/www/') && normalized.includes('/data/www/');
  if (!valid) {
    throw new Error(`${label} must be inside FastPanel webroot /var/www/<user>/data/www/<domain>. Got: ${real}`);
  }
  if (['/var/www', '/var/www/'].includes(normalized)) {
    throw new Error(`${label} points to a dangerous parent directory: ${real}`);
  }
}

assertDirectory('Source path', sourcePath);
assertDirectory('Admin webroot', adminWebroot);
assertDirectory('Widget webroot', widgetWebroot);
assertFastPanelSafe('Admin webroot', adminWebroot);
assertFastPanelSafe('Widget webroot', widgetWebroot);

run('git', ['fetch', 'origin', branch]);
run('git', ['checkout', branch]);
run('git', ['pull', '--ff-only', 'origin', branch]);
run('npm', ['ci']);
run('npm', ['run', 'build:admin']);
run('npm', ['run', 'build:widget']);

const adminDist = path.join(sourcePath, 'admin-panel', 'dist') + '/';
const widgetDist = path.join(sourcePath, 'widget', 'dist') + '/';

assertDirectory('Admin dist', adminDist);
assertDirectory('Widget dist', widgetDist);

run('rsync', ['-a', '--delete', adminDist, `${adminWebroot}/`], sourcePath);
run('rsync', ['-a', '--delete', widgetDist, `${widgetWebroot}/`], sourcePath);

console.log('Frontend deployment finished safely. FastPanel configs were not touched.');
