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

  return new SocksProxyAgent(`socks5://${auth}${proxy.host}:${proxy.port}`);
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

export function getTelegramBridgeStatus() {
  return {
    ...botStatus,
    hasBot: Boolean(bot)
  };
}

export async function startTelegramBridge({ logger } = {}) {
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
    bot = new Telegraf(token, buildTelegramOptions(settings));

    bot.start(async (ctx) => {
      const from = ctx.from || {};
      const operator = upsertTelegramOperator({
        telegramUserId: from.id,
        telegramUsername: from.username || '',
        name: [from.first_name, from.last_name].filter(Boolean).join(' ') || from.username || String(from.id)
      });

      await ctx.reply(
        `✅ WSChat оператор подключён.\n\nID: ${operator.id}\nTelegram: ${from.username ? '@' + from.username : from.id}\n\nТеперь новые сообщения сайта будут приходить сюда.`
      );
    });

    bot.command('status', async (ctx) => {
      const status = getTelegramBridgeStatus();
      await ctx.reply(
        `WSChat bridge\n` +
        `running: ${status.running ? 'yes' : 'no'}\n` +
        `proxy: ${status.proxyEnabled ? 'enabled' : 'disabled'}\n` +
        `bot: ${status.username || 'unknown'}`
      );
    });

    bot.on('text', async (ctx) => {
      const text = ctx.message?.text || '';
      if (!text || text.startsWith('/')) return;

      const operator = getOperatorByTelegramUserId(ctx.from.id);
      if (!operator) {
        await ctx.reply('Сначала отправьте /start, чтобы зарегистрироваться оператором.');
        return;
      }

      const replyTo = ctx.message?.reply_to_message;
      const sourceText = replyTo?.text || replyTo?.caption || '';
      const match = sourceText.match(/Conversation:\s*(conv_[a-zA-Z0-9_-]+)/);

      if (!match) {
        await ctx.reply('Ответьте реплаем на сообщение WSChat, чтобы отправить ответ посетителю.');
        return;
      }

      const conversationId = match[1];
      const conversation = getConversationWithVisitor(conversationId);
      if (!conversation) {
        await ctx.reply('Диалог не найден. Возможно, он был удалён.');
        return;
      }

      createOperatorMessage({
        conversationId,
        siteId: conversation.site_id,
        operatorId: operator.id,
        body: text,
        telegramMessageId: String(ctx.message.message_id)
      });

      await ctx.reply(`✅ Ответ сохранён для диалога ${conversationId}. Доставка в виджет будет включена на следующем шаге.`);
    });

    const me = await bot.telegram.getMe();
    await bot.launch();

    botStatus = {
      enabled: true,
      running: true,
      error: '',
      username: me.username || '',
      proxyEnabled: Boolean(settings.proxy?.enabled),
      startedAt: new Date().toISOString()
    };

    logger?.info?.({ username: botStatus.username, proxyEnabled: botStatus.proxyEnabled }, 'Telegram bridge started');

    process.once('SIGINT', () => bot?.stop('SIGINT'));
    process.once('SIGTERM', () => bot?.stop('SIGTERM'));

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

export async function notifyOperatorsAboutVisitorMessage({ site, visitor, conversation, message, logger } = {}) {
  if (!botStatus.running || !bot) return { ok: false, sent: 0, error: 'telegram bridge is not running' };

  const operators = listActiveTelegramOperatorsForSite(site.id);
  if (operators.length === 0) return { ok: true, sent: 0, error: 'no active telegram operators' };

  const text = [
    '💬 <b>Новое сообщение WSChat</b>',
    '',
    `<b>Сайт:</b> ${escapeHtml(site.domain || site.name || site.id)}`,
    `<b>Visitor:</b> ${escapeHtml(visitor.visitor_key || visitor.id)}`,
    `<b>Conversation:</b> ${escapeHtml(conversation.id)}`,
    '',
    escapeHtml(message.body),
    '',
    'Ответьте реплаем на это сообщение, чтобы сохранить ответ оператором.'
  ].join('\n');

  let sent = 0;
  for (const operator of operators) {
    try {
      await bot.telegram.sendMessage(operator.telegram_user_id, text, { parse_mode: 'HTML' });
      sent += 1;
    } catch (error) {
      logger?.warn?.({ operatorId: operator.id, error: error.message }, 'Failed to notify Telegram operator');
    }
  }

  return { ok: true, sent };
}
