import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import websocket from '@fastify/websocket';
import { config } from './config.js';

const app = Fastify({
  logger: {
    transport: config.app.env === 'development' ? { target: 'pino-pretty' } : undefined
  },
  trustProxy: config.app.trustProxy
});

await app.register(cors, {
  origin(origin, callback) {
    if (!origin) return callback(null, true);
    const allowed = new Set([config.cors.adminOrigin, config.cors.widgetOrigin]);
    callback(null, allowed.has(origin));
  },
  credentials: true
});

await app.register(rateLimit, {
  max: 120,
  timeWindow: '1 minute'
});

await app.register(websocket);

const clients = new Map();

app.get('/health', async () => ({
  ok: true,
  service: 'wschat-backend',
  env: config.app.env
}));

app.get('/api/config/public', async () => ({
  apiUrl: config.app.publicApiUrl,
  wsUrl: config.app.publicWsUrl
}));

app.post('/api/widget/message', async (request) => {
  const body = request.body || {};
  const siteId = String(body.siteId || '');
  const visitorId = String(body.visitorId || '');
  const message = String(body.message || '').trim();

  if (!siteId || !visitorId || !message) {
    return { ok: false, error: 'siteId, visitorId and message are required' };
  }

  request.log.info({ siteId, visitorId }, 'Widget message received');

  return {
    ok: true,
    status: 'accepted',
    note: 'Telegram forwarding and persistence will be implemented next.'
  };
});

app.get('/ws', { websocket: true }, (connection, request) => {
  const visitorId = request.query?.visitorId || crypto.randomUUID();
  clients.set(visitorId, connection);

  connection.on('close', () => {
    clients.delete(visitorId);
  });

  connection.send(JSON.stringify({ type: 'connected', visitorId }));
});

try {
  await app.listen({ host: config.app.host, port: config.app.port });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
