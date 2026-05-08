import dotenv from 'dotenv';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const envPath = resolve(__dirname, '../.env');

dotenv.config({ path: envPath });

const bool = (value, fallback = false) => {
  if (value === undefined || value === null || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
};

export const config = {
  app: {
    env: process.env.APP_ENV || 'development',
    host: process.env.APP_HOST || '127.0.0.1',
    port: Number(process.env.APP_PORT || 3000),
    trustProxy: bool(process.env.TRUST_PROXY, true),
    publicApiUrl: process.env.PUBLIC_API_URL || 'http://localhost:3000',
    publicWsUrl: process.env.PUBLIC_WS_URL || 'ws://localhost:3000/ws'
  },
  db: {
    path: process.env.DATABASE_PATH || './data/chat.sqlite'
  },
  cors: {
    adminOrigin: process.env.ADMIN_ORIGIN || 'http://localhost:5173',
    widgetOrigin: process.env.WIDGET_ORIGIN || 'http://localhost:5174'
  },
  telegram: {
    token: process.env.TELEGRAM_BOT_TOKEN || '',
    proxy: {
      enabled: bool(process.env.TELEGRAM_PROXY_ENABLED, false),
      type: process.env.TELEGRAM_PROXY_TYPE || 'socks5',
      host: process.env.TELEGRAM_PROXY_HOST || '127.0.0.1',
      port: Number(process.env.TELEGRAM_PROXY_PORT || 9050),
      username: process.env.TELEGRAM_PROXY_USERNAME || '',
      password: process.env.TELEGRAM_PROXY_PASSWORD || ''
    }
  },
  auth: {
    jwtSecret: process.env.JWT_SECRET || 'change-me'
  }
};
