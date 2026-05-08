import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import websocket from '@fastify/websocket';
import { config } from './config.js';
import {
  createVisitorMessage,
  getOrCreateOpenConversation,
  getSiteByWidgetKey,
  getStats,
  listRecentMessages,
  migrate,
  touchVisitor
} from './db.js';

migrate();

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

app.get('/api/admin/stats', async () => ({
  ok: true,
  stats: getStats()
}));

app.get('/api/admin/messages', async (request) => {
  const limit = Math.min(Math.max(Number(request.query?.limit || 50), 1), 200);
  return {
    ok: true,
    messages: listRecentMessages(limit)
  };
});

app.post('/api/widget/message', async (request) => {
  const body = request.body || {};
  const siteId = String(body.siteId || body.widgetKey || '');
  const visitorKey = String(body.visitorId || '').trim();
  const messageBody = String(body.message || '').trim();

  if (!siteId || !visitorKey || !messageBody) {
    return { ok: false, error: 'siteId, visitorId and message are required' };
  }

  if (messageBody.length > 5000) {
    return { ok: false, error: 'message is too long' };
  }

  const site = getSiteByWidgetKey(siteId);
  if (!site) {
    return { ok: false, error: 'unknown or inactive site' };
  }

  const visitor = touchVisitor({
    siteId: site.id,
    visitorKey,
    userAgent: request.headers['user-agent'] || '',
    ip: request.ip
  });

  const conversation = getOrCreateOpenConversation({
    siteId: site.id,
    visitorId: visitor.id
  });

  const message = createVisitorMessage({
    conversationId: conversation.id,
    siteId: site.id,
    visitorId: visitor.id,
    body: messageBody
  });

  request.log.info({ siteId: site.id, visitorId: visitor.id, conversationId: conversation.id, messageId: message.id }, 'Widget message saved');

  return {
    ok: true,
    status: 'saved',
    conversationId: conversation.id,
    messageId: message.id
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
