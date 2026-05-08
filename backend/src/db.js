import { dirname } from 'node:path';
import { mkdirSync } from 'node:fs';
import Database from 'better-sqlite3';
import { nanoid } from 'nanoid';
import { config } from './config.js';

mkdirSync(dirname(config.db.path), { recursive: true });

export const db = new Database(config.db.path);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export function migrate() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS sites (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      domain TEXT NOT NULL,
      widget_key TEXT NOT NULL UNIQUE,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS operators (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      telegram_user_id TEXT UNIQUE,
      telegram_username TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS site_operators (
      site_id TEXT NOT NULL,
      operator_id TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (site_id, operator_id),
      FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE,
      FOREIGN KEY (operator_id) REFERENCES operators(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS visitors (
      id TEXT PRIMARY KEY,
      site_id TEXT NOT NULL,
      visitor_key TEXT NOT NULL,
      first_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      user_agent TEXT,
      ip TEXT,
      UNIQUE(site_id, visitor_key),
      FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      site_id TEXT NOT NULL,
      visitor_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open',
      assigned_operator_id TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE,
      FOREIGN KEY (visitor_id) REFERENCES visitors(id) ON DELETE CASCADE,
      FOREIGN KEY (assigned_operator_id) REFERENCES operators(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      site_id TEXT NOT NULL,
      visitor_id TEXT,
      operator_id TEXT,
      direction TEXT NOT NULL CHECK(direction IN ('visitor','operator','system')),
      body TEXT NOT NULL,
      transport TEXT NOT NULL DEFAULT 'web',
      telegram_message_id TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
      FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE,
      FOREIGN KEY (visitor_id) REFERENCES visitors(id) ON DELETE SET NULL,
      FOREIGN KEY (operator_id) REFERENCES operators(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_visitors_site_key ON visitors(site_id, visitor_key);
    CREATE INDEX IF NOT EXISTS idx_conversations_site_status ON conversations(site_id, status);
    CREATE INDEX IF NOT EXISTS idx_messages_conversation_created ON messages(conversation_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_messages_site_created ON messages(site_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_operators_telegram_user_id ON operators(telegram_user_id);
    CREATE INDEX IF NOT EXISTS idx_sites_domain_active ON sites(domain, is_active);
  `);

  ensureDefaultSite();
  ensureDefaultTelegramSettings();
}

export function ensureDefaultSite() {
  const existing = db.prepare('SELECT id FROM sites WHERE id = ?').get('site_default');
  if (existing) return existing.id;

  db.prepare(`
    INSERT INTO sites (id, name, domain, widget_key)
    VALUES (?, ?, ?, ?)
  `).run('site_default', 'Default site', config.cors.widgetOrigin.replace(/^https?:\/\//, ''), 'site_default');

  return 'site_default';
}

function normalizeHost(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .split('/')[0]
    .split(':')[0];
}

export function isAllowedWidgetOrigin(origin) {
  if (!origin) return true;

  let originHost = '';
  try {
    originHost = normalizeHost(new URL(origin).hostname);
  } catch {
    originHost = normalizeHost(origin);
  }

  if (!originHost) return false;

  const rows = db.prepare(`
    SELECT domain
    FROM sites
    WHERE is_active = 1
  `).all();

  return rows.some((row) => normalizeHost(row.domain) === originHost);
}

function boolToSetting(value) {
  return value ? 'true' : 'false';
}

function settingToBool(value) {
  return ['1', 'true', 'yes', 'on'].includes(String(value || '').toLowerCase());
}

export function getSetting(key, fallback = '') {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : fallback;
}

export function setSetting(key, value) {
  db.prepare(`
    INSERT INTO settings (key, value, updated_at)
    VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
  `).run(key, String(value ?? ''));
}

export function ensureDefaultTelegramSettings() {
  const defaults = {
    'telegram.bot_token': config.telegram.token,
    'telegram.proxy.enabled': boolToSetting(config.telegram.proxy.enabled),
    'telegram.proxy.type': config.telegram.proxy.type,
    'telegram.proxy.host': config.telegram.proxy.host,
    'telegram.proxy.port': String(config.telegram.proxy.port || 9050),
    'telegram.proxy.username': config.telegram.proxy.username,
    'telegram.proxy.password': config.telegram.proxy.password
  };

  for (const [key, value] of Object.entries(defaults)) {
    const exists = db.prepare('SELECT key FROM settings WHERE key = ?').get(key);
    if (!exists) setSetting(key, value);
  }
}

export function getTelegramSettings({ revealSecrets = false } = {}) {
  const token = getSetting('telegram.bot_token', config.telegram.token);
  const password = getSetting('telegram.proxy.password', config.telegram.proxy.password);

  return {
    botToken: revealSecrets ? token : token ? '********' : '',
    hasBotToken: Boolean(token),
    proxy: {
      enabled: settingToBool(getSetting('telegram.proxy.enabled', boolToSetting(config.telegram.proxy.enabled))),
      type: getSetting('telegram.proxy.type', config.telegram.proxy.type) || 'socks5',
      host: getSetting('telegram.proxy.host', config.telegram.proxy.host) || '127.0.0.1',
      port: Number(getSetting('telegram.proxy.port', String(config.telegram.proxy.port || 9050)) || 9050),
      username: getSetting('telegram.proxy.username', config.telegram.proxy.username),
      password: revealSecrets ? password : password ? '********' : '',
      hasPassword: Boolean(password)
    }
  };
}

export function updateTelegramSettings(payload = {}) {
  const current = getTelegramSettings({ revealSecrets: true });
  const proxy = payload.proxy || {};

  if (Object.prototype.hasOwnProperty.call(payload, 'botToken') && payload.botToken !== '********') {
    setSetting('telegram.bot_token', String(payload.botToken || '').trim());
  }

  if (Object.prototype.hasOwnProperty.call(proxy, 'enabled')) {
    setSetting('telegram.proxy.enabled', boolToSetting(Boolean(proxy.enabled)));
  }

  if (Object.prototype.hasOwnProperty.call(proxy, 'type')) {
    setSetting('telegram.proxy.type', String(proxy.type || 'socks5').trim().toLowerCase());
  }

  if (Object.prototype.hasOwnProperty.call(proxy, 'host')) {
    setSetting('telegram.proxy.host', String(proxy.host || '').trim());
  }

  if (Object.prototype.hasOwnProperty.call(proxy, 'port')) {
    const port = Number(proxy.port || current.proxy.port || 9050);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new Error('proxy port must be between 1 and 65535');
    }
    setSetting('telegram.proxy.port', String(port));
  }

  if (Object.prototype.hasOwnProperty.call(proxy, 'username')) {
    setSetting('telegram.proxy.username', String(proxy.username || '').trim());
  }

  if (Object.prototype.hasOwnProperty.call(proxy, 'password') && proxy.password !== '********') {
    setSetting('telegram.proxy.password', String(proxy.password || ''));
  }

  return getTelegramSettings();
}

export function upsertTelegramOperator({ telegramUserId, telegramUsername, name }) {
  const existing = db.prepare('SELECT * FROM operators WHERE telegram_user_id = ?').get(String(telegramUserId));

  if (existing) {
    db.prepare(`
      UPDATE operators
      SET name = ?, telegram_username = ?, is_active = 1, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(name || existing.name, telegramUsername || existing.telegram_username, existing.id);
    return db.prepare('SELECT * FROM operators WHERE id = ?').get(existing.id);
  }

  const id = `op_${nanoid(12)}`;
  db.prepare(`
    INSERT INTO operators (id, name, telegram_user_id, telegram_username, is_active)
    VALUES (?, ?, ?, ?, 1)
  `).run(id, name || `Operator ${telegramUserId}`, String(telegramUserId), telegramUsername || null);

  db.prepare(`
    INSERT OR IGNORE INTO site_operators (site_id, operator_id)
    VALUES (?, ?)
  `).run('site_default', id);

  return db.prepare('SELECT * FROM operators WHERE id = ?').get(id);
}

export function listActiveTelegramOperatorsForSite(siteId) {
  return db.prepare(`
    SELECT operators.*
    FROM operators
    JOIN site_operators ON site_operators.operator_id = operators.id
    WHERE site_operators.site_id = ?
      AND operators.is_active = 1
      AND operators.telegram_user_id IS NOT NULL
  `).all(siteId);
}

export function getOperatorByTelegramUserId(telegramUserId) {
  return db.prepare(`
    SELECT * FROM operators
    WHERE telegram_user_id = ? AND is_active = 1
  `).get(String(telegramUserId));
}

export function getSiteByWidgetKey(widgetKey) {
  return db.prepare(`
    SELECT * FROM sites WHERE widget_key = ? AND is_active = 1
  `).get(widgetKey);
}

export function touchVisitor({ siteId, visitorKey, userAgent, ip }) {
  const existing = db.prepare(`
    SELECT * FROM visitors WHERE site_id = ? AND visitor_key = ?
  `).get(siteId, visitorKey);

  if (existing) {
    db.prepare(`
      UPDATE visitors
      SET last_seen_at = CURRENT_TIMESTAMP, user_agent = COALESCE(?, user_agent), ip = COALESCE(?, ip)
      WHERE id = ?
    `).run(userAgent || null, ip || null, existing.id);
    return existing;
  }

  const id = `visitor_${nanoid(12)}`;
  db.prepare(`
    INSERT INTO visitors (id, site_id, visitor_key, user_agent, ip)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, siteId, visitorKey, userAgent || null, ip || null);

  return db.prepare('SELECT * FROM visitors WHERE id = ?').get(id);
}

export function getOrCreateOpenConversation({ siteId, visitorId }) {
  const existing = db.prepare(`
    SELECT * FROM conversations
    WHERE site_id = ? AND visitor_id = ? AND status = 'open'
    ORDER BY created_at DESC
    LIMIT 1
  `).get(siteId, visitorId);

  if (existing) return existing;

  const id = `conv_${nanoid(12)}`;
  db.prepare(`
    INSERT INTO conversations (id, site_id, visitor_id)
    VALUES (?, ?, ?)
  `).run(id, siteId, visitorId);

  return db.prepare('SELECT * FROM conversations WHERE id = ?').get(id);
}

export function getConversationWithVisitor(conversationId) {
  return db.prepare(`
    SELECT
      conversations.*,
      sites.name AS site_name,
      sites.domain AS site_domain,
      visitors.visitor_key
    FROM conversations
    JOIN sites ON sites.id = conversations.site_id
    JOIN visitors ON visitors.id = conversations.visitor_id
    WHERE conversations.id = ?
  `).get(conversationId);
}

export function createVisitorMessage({ conversationId, siteId, visitorId, body }) {
  const id = `msg_${nanoid(14)}`;
  db.prepare(`
    INSERT INTO messages (id, conversation_id, site_id, visitor_id, direction, body, transport)
    VALUES (?, ?, ?, ?, 'visitor', ?, 'web')
  `).run(id, conversationId, siteId, visitorId, body);

  db.prepare(`
    UPDATE conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = ?
  `).run(conversationId);

  return db.prepare('SELECT * FROM messages WHERE id = ?').get(id);
}

export function createOperatorMessage({ conversationId, siteId, operatorId, body, telegramMessageId = null }) {
  const id = `msg_${nanoid(14)}`;
  db.prepare(`
    INSERT INTO messages (id, conversation_id, site_id, operator_id, direction, body, transport, telegram_message_id)
    VALUES (?, ?, ?, ?, 'operator', ?, 'telegram', ?)
  `).run(id, conversationId, siteId, operatorId, body, telegramMessageId);

  db.prepare(`
    UPDATE conversations
    SET updated_at = CURRENT_TIMESTAMP, assigned_operator_id = COALESCE(assigned_operator_id, ?)
    WHERE id = ?
  `).run(operatorId, conversationId);

  return db.prepare('SELECT * FROM messages WHERE id = ?').get(id);
}

export function listRecentMessages(limit = 50) {
  return db.prepare(`
    SELECT
      messages.*,
      sites.name AS site_name,
      sites.domain AS site_domain,
      visitors.visitor_key
    FROM messages
    JOIN sites ON sites.id = messages.site_id
    LEFT JOIN visitors ON visitors.id = messages.visitor_id
    ORDER BY messages.created_at DESC
    LIMIT ?
  `).all(limit);
}

export function getStats() {
  const siteCount = db.prepare('SELECT COUNT(*) AS count FROM sites').get().count;
  const visitorCount = db.prepare('SELECT COUNT(*) AS count FROM visitors').get().count;
  const conversationCount = db.prepare('SELECT COUNT(*) AS count FROM conversations').get().count;
  const messageCount = db.prepare('SELECT COUNT(*) AS count FROM messages').get().count;
  const operatorCount = db.prepare('SELECT COUNT(*) AS count FROM operators WHERE is_active = 1').get().count;
  const openConversationCount = db.prepare("SELECT COUNT(*) AS count FROM conversations WHERE status = 'open'").get().count;

  return {
    sites: siteCount,
    visitors: visitorCount,
    conversations: conversationCount,
    openConversations: openConversationCount,
    messages: messageCount,
    operators: operatorCount
  };
}
