import { Telegraf } from 'telegraf';
import { SocksProxyAgent } from 'socks-proxy-agent';
import {
  createOperatorMessage,
  getConversationWithVisitor,
  getOperatorByTelegramUserId,
  getTelegramSettings,
  listActiveTelegramOperatorsForSite,
  upsertTelegramOperator
} from './db.js';

let bot = null;
let operatorMessageNotifier = null;
let botStatus = {
  enabled: false,
  running: false,
  error: '',
  username: '',
  proxyEnabled: false,
  startedAt: null
};

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function buildProxyAgent(proxy) {
  if (!proxy?.enabled) return null;

  const auth = proxy.username
    ? `${encodeURIComponent(proxy.username)}:${encodeURIComponent(proxy.password || '')}@`
    : '';

  return new SocksProxyAgent(`socks5h://${auth}${proxy.host}:${proxy.port}`);
}

function buildTelegramOptions(settings) {
  const agent = buildProxyAgent(settings.proxy);
  if (!agent) return undefined;

  return {
    telegram: {
      agent
    }
  };
}

export function setOperatorMessageNotifier(callback) {
  operatorMessageNotifier = callback;
}

export function getTelegramBridgeStatus() {
  return {
    ...botStatus,
    hasBot: Boolean(bot)
  };
}

export async function stopTelegramBridge(reason = 'restart') {
  if (bot) {
    try {
      await bot.stop(reason);
    } catch {
      // Safe to ignore when polling was not started yet.
    }
  }

  bot = null;
  botStatus = {
    ...botStatus,
    running: false,
    error: '',
    startedAt: null
  };

  return getTelegramBridgeStatus();
}

export async function startTelegramBridge({ logger } = {}) {
  await stopTelegramBridge('restart');

  const settings = getTelegramSettings({ revealSecrets: true });
  const token = settings.botToken;

  botStatus = {
    enabled: Boolean(token),
    running: false,
    error: '',
    username: '',
    proxyEnabled: Boolean(settings.proxy?.enabled),
    startedAt: null
  };

  if (!token) {
    logger?.warn?.('Telegram bridge skipped: bot token is empty');
    return botStatus;
  }

  try {
    const nextBot = new Telegraf(token, buildTelegramOptions(settings));

    nextBot.start(async (ctx) => {
      const from = ctx.from || {};
      const operator = upsertTelegramOperator({
        telegramUserId: from.id,
        telegramUsername: from.username || '',
        name: [from.first_name, from.last_name].filter(Boolean).join(' ') || from.username || String(from.id)
      });

      await ctx.reply(
        `WSChat operator connected.\n\nID: ${operator.id}\nTelegram: ${from.username ? '@' + from.username : from.id}\n\nNew site messages will come here.`
      );
    });

    nextBot.command('status', async (ctx) => {
      const status = getTelegramBridgeStatus();
      await ctx.reply(
        `WSChat bridge\n` +
        `running: ${status.running ? 'yes' : 'no'}\n` +
        `proxy: ${status.proxyEnabled ? 'enabled' : 'disabled'}\n` +
        `bot: ${status.username || 'unknown'}`
      );
    });

    nextBot.on('text', async (ctx) => {
      const text = ctx.message?.text || '';
      if (!text || text.startsWith('/')) return;

      const operator = getOperatorByTelegramUserId(ctx.from.id);
      if (!operator) {
        await ctx.reply('Send /start first to register as operator.');
        return;
      }

      const replyTo = ctx.message?.reply_to_message;
      const sourceText = replyTo?.text || replyTo?.caption || '';
      const match = sourceText.match(/Conversation:\s*(conv_[a-zA-Z0-9_-]+)/);

      if (!match) {
        await ctx.reply('Reply to a WSChat notification message to answer a visitor.');
        return;
      }

      const conversationId = match[1];
      const conversation = getConversationWithVisitor(conversationId);
      if (!conversation) {
        await ctx.reply('Conversation not found.');
        return;
      }

      const message = createOperatorMessage({
        conversationId,
        siteId: conversation.site_id,
        operatorId: operator.id,
        body: text,
        telegramMessageId: String(ctx.message.message_id)
      });

      if (operatorMessageNotifier) {
        operatorMessageNotifier({ conversation, message, operator });
      }

      await ctx.reply(`Answer saved for conversation ${conversationId}.`);
    });

    const me = await nextBot.telegram.getMe();

    bot = nextBot;
    botStatus = {
      enabled: true,
      running: true,
      error: '',
      username: me.username || '',
      proxyEnabled: Boolean(settings.proxy?.enabled),
      startedAt: new Date().toISOString()
    };

    nextBot.launch({ dropPendingUpdates: true }).catch((error) => {
      botStatus = {
        ...botStatus,
        running: false,
        error: error.message
      };
      logger?.error?.(error, 'Telegram bridge polling failed');
    });

    logger?.info?.({ username: botStatus.username, proxyEnabled: botStatus.proxyEnabled }, 'Telegram bridge started');

    return botStatus;
  } catch (error) {
    botStatus = {
      ...botStatus,
      running: false,
      error: error.message
    };
    logger?.error?.(error, 'Telegram bridge failed to start');
    return botStatus;
  }
}

export async function restartTelegramBridge({ logger } = {}) {
  await stopTelegramBridge('manual restart');
  return startTelegramBridge({ logger });
}

export async function notifyOperatorsAboutVisitorMessage({ site, visitor, conversation, message, logger } = {}) {
  if (!botStatus.running || !bot) return { ok: false, sent: 0, error: 'telegram bridge is not running' };

  const operators = listActiveTelegramOperatorsForSite(site.id);
  if (operators.length === 0) return { ok: true, sent: 0, error: 'no active telegram operators' };

  const text = [
    'New WSChat message',
    '',
    `Site: ${escapeHtml(site.domain || site.name || site.id)}`,
    `Visitor: ${escapeHtml(visitor.visitor_key || visitor.id)}`,
    `Conversation: ${escapeHtml(conversation.id)}`,
    '',
    escapeHtml(message.body),
    '',
    'Reply to this message to save an operator answer.'
  ].join('\n');

  let sent = 0;
  for (const operator of operators) {
    try {
      await bot.telegram.sendMessage(operator.telegram_user_id, text);
      sent += 1;
    } catch (error) {
      logger?.warn?.({ operatorId: operator.id, error: error.message }, 'Failed to notify Telegram operator');
    }
  }

  return { ok: true, sent };
}
