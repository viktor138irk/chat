import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import websocket from '@fastify/websocket';
import { randomUUID } from 'node:crypto';
import { nanoid } from 'nanoid';
import { config } from './config.js';
import {
  createVisitorMessage,
  db,
  getOrCreateOpenConversation,
  getSiteByWidgetKey,
  getStats,
  getTelegramSettings,
  isAllowedWidgetOrigin,
  listRecentMessages,
  migrate,
  touchVisitor,
  updateTelegramSettings
} from './db.js';
import {
  getTelegramBridgeStatus,
  notifyOperatorsAboutVisitorMessage,
  restartTelegramBridge,
  setOperatorMessageNotifier,
  startTelegramBridge
} from './telegram.js';

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

    const staticAllowed = new Set([config.cors.adminOrigin, config.cors.widgetOrigin]);
    const allowed = staticAllowed.has(origin) || isAllowedWidgetOrigin(origin);

    callback(null, allowed);
  },
  credentials: true
});

await app.register(rateLimit, {
  max: 120,
  timeWindow: '1 minute'
});

await app.register(websocket);

const clients = new Map();

function getClientKey(siteId, visitorId) {
  return `${siteId || 'unknown_site'}:${visitorId || 'unknown_visitor'}`;
}

function normalizeDomain(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .split('/')[0]
    .split(':')[0];
}

function makeWidgetKey(domain) {
  const normalized = normalizeDomain(domain).replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return `site_${normalized || nanoid(8)}`;
}

function sendJson(connection, payload) {
  try {
    connection.send(JSON.stringify(payload));
    return true;
  } catch {
    return false;
  }
}

function broadcastToVisitor({ siteId, visitorId, payload }) {
  const key = getClientKey(siteId, visitorId);
  const bucket = clients.get(key);
  if (!bucket || bucket.size === 0) return 0;

  let sent = 0;
  for (const connection of bucket) {
    if (sendJson(connection, payload)) sent += 1;
  }
  return sent;
}

setOperatorMessageNotifier(({ conversation, message, operator }) => {
  const sent = broadcastToVisitor({
    siteId: conversation.site_id,
    visitorId: conversation.visitor_key,
    payload: {
      type: 'operator_message',
      conversationId: conversation.id,
      message: {
        id: message.id,
        direction: 'operator',
        body: message.body,
        createdAt: message.created_at,
        operator: {
          id: operator.id,
          name: operator.name || 'Оператор'
        }
      }
    }
  });

  app.log.info(
    { conversationId: conversation.id, visitorId: conversation.visitor_key, sent },
    'Operator Telegram answer delivered to widget clients'
  );
});

function validateSocks5Settings(settings) {
  const proxy = settings.proxy || {};

  if (!proxy.enabled) {
    return {
      ok: true,
      status: 'disabled',
      message: 'SOCKS5 выключен. Telegram будет подключаться напрямую.'
    };
  }

  if (proxy.type !== 'socks5') {
    return {
      ok: false,
      status: 'invalid',
      message: 'Сейчас поддерживается только socks5.'
    };
  }

  if (!proxy.host) {
    return {
      ok: false,
      status: 'invalid',
      message: 'Укажите host SOCKS5 прокси.'
    };
  }

  if (!Number.isInteger(proxy.port) || proxy.port < 1 || proxy.port > 65535) {
    return {
      ok: false,
      status: 'invalid',
      message: 'Порт SOCKS5 должен быть от 1 до 65535.'
    };
  }

  return {
    ok: true,
    status: 'configured',
    message: `SOCKS5 включен: ${proxy.host}:${proxy.port}. Настройки сохранены, bridge можно перезапустить отдельно.`
  };
}

app.get('/health', async () => ({
  ok: true,
  service: 'wschat-backend',
  env: config.app.env,
  dbPath: config.db.path,
  telegram: getTelegramBridgeStatus(),
  wsClients: Array.from(clients.values()).reduce((sum, bucket) => sum + bucket.size, 0)
}));

app.get('/api/config/public', async () => ({
  apiUrl: config.app.publicApiUrl,
  wsUrl: config.app.publicWsUrl
}));

app.get('/api/admin/stats', async () => ({
  ok: true,
  stats: getStats(),
  telegram: getTelegramBridgeStatus()
}));

app.get('/api/admin/messages', async (request) => {
  const limit = Math.min(Math.max(Number(request.query?.limit || 50), 1), 200);
  return {
    ok: true,
    messages: listRecentMessages(limit)
  };
});

app.get('/api/admin/sites', async () => ({
  ok: true,
  sites: db.prepare(`
    SELECT
      sites.*,
      COUNT(DISTINCT visitors.id) AS visitors_count,
      COUNT(DISTINCT conversations.id) AS conversations_count,
      COUNT(DISTINCT site_operators.operator_id) AS operators_count
    FROM sites
    LEFT JOIN visitors ON visitors.site_id = sites.id
    LEFT JOIN conversations ON conversations.site_id = sites.id
    LEFT JOIN site_operators ON site_operators.site_id = sites.id
    GROUP BY sites.id
    ORDER BY sites.created_at DESC
  `).all()
}));

app.post('/api/admin/sites', async (request, reply) => {
  const body = request.body || {};
  const domain = normalizeDomain(body.domain);
  const name = String(body.name || domain || '').trim();
  const widgetKey = String(body.widgetKey || makeWidgetKey(domain)).trim();

  if (!domain) {
    reply.code(400);
    return { ok: false, error: 'domain is required' };
  }

  const id = widgetKey;

  try {
    db.prepare(`
      INSERT INTO sites (id, name, domain, widget_key, is_active)
      VALUES (?, ?, ?, ?, 1)
    `).run(id, name || domain, domain, widgetKey);

    return {
      ok: true,
      site: db.prepare('SELECT * FROM sites WHERE id = ?').get(id)
    };
  } catch (error) {
    reply.code(400);
    return { ok: false, error: error.message };
  }
});

app.get('/api/admin/operators', async () => ({
  ok: true,
  operators: db.prepare(`
    SELECT
      operators.*,
      GROUP_CONCAT(sites.domain, ', ') AS sites
    FROM operators
    LEFT JOIN site_operators ON site_operators.operator_id = operators.id
    LEFT JOIN sites ON sites.id = site_operators.site_id
    GROUP BY operators.id
    ORDER BY operators.updated_at DESC
  `).all()
}));

app.post('/api/admin/site-operators', async (request, reply) => {
  const body = request.body || {};
  const siteId = String(body.siteId || '').trim();
  const operatorId = String(body.operatorId || '').trim();

  if (!siteId || !operatorId) {
    reply.code(400);
    return { ok: false, error: 'siteId and operatorId are required' };
  }

  const site = db.prepare('SELECT id FROM sites WHERE id = ? AND is_active = 1').get(siteId);
  const operator = db.prepare('SELECT id FROM operators WHERE id = ? AND is_active = 1').get(operatorId);

  if (!site || !operator) {
    reply.code(404);
    return { ok: false, error: 'site or operator not found' };
  }

  db.prepare(`
    INSERT OR IGNORE INTO site_operators (site_id, operator_id)
    VALUES (?, ?)
  `).run(siteId, operatorId);

  return { ok: true };
});

app.delete('/api/admin/site-operators', async (request) => {
  const body = request.body || {};
  const siteId = String(body.siteId || '').trim();
  const operatorId = String(body.operatorId || '').trim();

  db.prepare('DELETE FROM site_operators WHERE site_id = ? AND operator_id = ?').run(siteId, operatorId);
  return { ok: true };
});

app.get('/api/admin/telegram/settings', async () => ({
  ok: true,
  settings: getTelegramSettings(),
  bridge: getTelegramBridgeStatus()
}));

app.post('/api/admin/telegram/settings', async (request, reply) => {
  try {
    const settings = updateTelegramSettings(request.body || {});

    return {
      ok: true,
      settings,
      bridge: getTelegramBridgeStatus(),
      message: 'Настройки сохранены. Перезапустите Telegram bridge отдельной кнопкой после проверки прокси.'
    };
  } catch (error) {
    reply.code(400);
    return {
      ok: false,
      error: error.message
    };
  }
});

app.post('/api/admin/telegram/restart', async () => ({
  ok: true,
  bridge: await restartTelegramBridge({ logger: app.log })
}));

app.post('/api/admin/telegram/test-proxy', async () => {
  const settings = getTelegramSettings({ revealSecrets: true });
  const result = validateSocks5Settings(settings);

  return {
    ...result,
    settings: getTelegramSettings(),
    bridge: getTelegramBridgeStatus()
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

  await notifyOperatorsAboutVisitorMessage({
    site,
    visitor,
    conversation,
    message,
    logger: request.log
  });

  request.log.info({ siteId: site.id, visitorId: visitor.id, conversationId: conversation.id, messageId: message.id }, 'Widget message saved');

  return {
    ok: true,
    status: 'saved',
    conversationId: conversation.id,
    messageId: message.id,
    telegram: getTelegramBridgeStatus()
  };
});

app.get('/ws', { websocket: true }, (connection, request) => {
  const siteId = String(request.query?.siteId || request.query?.widgetKey || 'unknown_site');
  const visitorId = String(request.query?.visitorId || `visitor_${randomUUID()}`);
  const key = getClientKey(siteId, visitorId);

  if (!clients.has(key)) clients.set(key, new Set());
  clients.get(key).add(connection);

  connection.on('close', () => {
    const bucket = clients.get(key);
    if (!bucket) return;
    bucket.delete(connection);
    if (bucket.size === 0) clients.delete(key);
  });

  sendJson(connection, { type: 'connected', siteId, visitorId });
});

try {
  await app.listen({ host: config.app.host, port: config.app.port });
  app.log.info({ host: config.app.host, port: config.app.port }, 'WSChat API started');

  startTelegramBridge({ logger: app.log }).catch((error) => {
    app.log.error(error, 'Telegram bridge async startup failed');
  });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
