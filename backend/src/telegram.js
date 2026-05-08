import { Telegraf, Markup } from 'telegraf';
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
const activeOperatorConversations = new Map();
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

function getConversationIdFromReply(ctx) {
  const replyTo = ctx.message?.reply_to_message;
  const sourceText = replyTo?.text || replyTo?.caption || '';
  const match = sourceText.match(/Conversation:\s*(conv_[a-zA-Z0-9_-]+)/);
  return match ? match[1] : '';
}

async function saveOperatorAnswer({ ctx, operator, conversationId, text }) {
  const conversation = getConversationWithVisitor(conversationId);
  if (!conversation) {
    await ctx.reply('Conversation not found.');
    return false;
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

  activeOperatorConversations.set(String(ctx.from.id), conversationId);
  await ctx.reply(`Answer sent to ${conversation.site_domain || conversation.site_id} / ${conversation.visitor_key}.`);
  return true;
}

export function setOperatorMessageNotifier(callback) {
  operatorMessageNotifier = callback;
}

export function getTelegramBridgeStatus() {
  return {
    ...botStatus,
    hasBot: Boolean(bot),
    activeTelegramDialogs: activeOperatorConversations.size
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
  activeOperatorConversations.clear();
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
      const activeConversationId = activeOperatorConversations.get(String(ctx.from.id));
      await ctx.reply(
        `WSChat bridge\n` +
        `running: ${status.running ? 'yes' : 'no'}\n` +
        `proxy: ${status.proxyEnabled ? 'enabled' : 'disabled'}\n` +
        `bot: ${status.username || 'unknown'}\n` +
        `active dialog: ${activeConversationId || 'not selected'}`
      );
    });

    nextBot.action(/^answer:(conv_[a-zA-Z0-9_-]+)$/, async (ctx) => {
      const operator = getOperatorByTelegramUserId(ctx.from.id);
      if (!operator) {
        await ctx.answerCbQuery('Send /start first');
        return;
      }

      const conversationId = ctx.match[1];
      const conversation = getConversationWithVisitor(conversationId);
      if (!conversation) {
        await ctx.answerCbQuery('Conversation not found');
        return;
      }

      activeOperatorConversations.set(String(ctx.from.id), conversationId);
      await ctx.answerCbQuery('Dialog selected');
      await ctx.reply(
        `Active dialog selected:\n` +
        `${conversation.site_domain || conversation.site_id}\n` +
        `Visitor: ${conversation.visitor_key}\n\n` +
        `Now send a normal Telegram message here. It will go to this visitor.`
      );
    });

    nextBot.action(/^close_active$/, async (ctx) => {
      activeOperatorConversations.delete(String(ctx.from.id));
      await ctx.answerCbQuery('Active dialog cleared');
      await ctx.reply('Active dialog cleared. Choose another dialog with the Answer button or reply to a notification.');
    });

    nextBot.on('text', async (ctx) => {
      const text = ctx.message?.text || '';
      if (!text || text.startsWith('/')) return;

      const operator = getOperatorByTelegramUserId(ctx.from.id);
      if (!operator) {
        await ctx.reply('Send /start first to register as operator.');
        return;
      }

      const replyConversationId = getConversationIdFromReply(ctx);
      const activeConversationId = activeOperatorConversations.get(String(ctx.from.id));
      const conversationId = replyConversationId || activeConversationId;

      if (!conversationId) {
        await ctx.reply('Choose a dialog with the Answer button or reply to a WSChat notification message.');
        return;
      }

      await saveOperatorAnswer({ ctx, operator, conversationId, text });
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
    'Press Answer to select this dialog, or reply to this message directly.'
  ].join('\n');

  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback('Ответить в этот чат', `answer:${conversation.id}`)],
    [Markup.button.callback('Сбросить активный диалог', 'close_active')]
  ]);

  let sent = 0;
  for (const operator of operators) {
    try {
      await bot.telegram.sendMessage(operator.telegram_user_id, text, keyboard);
      sent += 1;
    } catch (error) {
      logger?.warn?.({ operatorId: operator.id, error: error.message }, 'Failed to notify Telegram operator');
    }
  }

  return { ok: true, sent };
}
