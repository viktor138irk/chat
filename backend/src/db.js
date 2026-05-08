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
  `);

  ensureDefaultSite();
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
  const openConversationCount = db.prepare("SELECT COUNT(*) AS count FROM conversations WHERE status = 'open'").get().count;

  return {
    sites: siteCount,
    visitors: visitorCount,
    conversations: conversationCount,
    openConversations: openConversationCount,
    messages: messageCount
  };
}
