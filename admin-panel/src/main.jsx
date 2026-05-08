import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Activity,
  Bot,
  CheckCircle,
  Clock,
  Database,
  KeyRound,
  MessageCircle,
  PlugZap,
  RefreshCw,
  Save,
  Server,
  ShieldCheck,
  Users,
  Wifi
} from 'lucide-react';
import './styles.css';

const API_URL = import.meta.env.VITE_API_URL || 'https://api.stackworks.ru';
const REFRESH_MS = 15000;

const emptyTelegramSettings = {
  botToken: '',
  hasBotToken: false,
  proxy: {
    enabled: false,
    type: 'socks5',
    host: '127.0.0.1',
    port: 9050,
    username: '',
    password: '',
    hasPassword: false
  }
};

function formatDate(value) {
  if (!value) return '—';
  const source = value instanceof Date ? value : new Date(String(value).replace(' ', 'T') + 'Z');
  if (Number.isNaN(source.getTime())) return String(value);
  return new Intl.DateTimeFormat('ru-RU', {
    dateStyle: 'short',
    timeStyle: 'short'
  }).format(source);
}

function StatCard({ icon: Icon, label, value }) {
  return (
    <article className="stat-card">
      <div className="stat-icon"><Icon size={20} /></div>
      <div>
        <p>{label}</p>
        <strong>{value ?? 0}</strong>
      </div>
    </article>
  );
}

function App() {
  const [health, setHealth] = useState(null);
  const [stats, setStats] = useState(null);
  const [messages, setMessages] = useState([]);
  const [telegramSettings, setTelegramSettings] = useState(emptyTelegramSettings);
  const [telegramBridge, setTelegramBridge] = useState(null);
  const [telegramDirty, setTelegramDirty] = useState(false);
  const [loading, setLoading] = useState(false);
  const [savingTelegram, setSavingTelegram] = useState(false);
  const [testingProxy, setTestingProxy] = useState(false);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [error, setError] = useState('');
  const [telegramError, setTelegramError] = useState('');
  const [telegramNotice, setTelegramNotice] = useState('');
  const [proxyTestResult, setProxyTestResult] = useState(null);

  const healthOk = health?.ok === true;

  const statCards = useMemo(() => ([
    { icon: ShieldCheck, label: 'Сайты', value: stats?.sites },
    { icon: Users, label: 'Посетители', value: stats?.visitors },
    { icon: MessageCircle, label: 'Диалоги', value: stats?.conversations },
    { icon: Activity, label: 'Открытые', value: stats?.openConversations },
    { icon: Bot, label: 'Сообщения', value: stats?.messages }
  ]), [stats]);

  function patchTelegramSettings(path, value) {
    setTelegramDirty(true);
    setTelegramSettings((current) => {
      if (path.startsWith('proxy.')) {
        const key = path.replace('proxy.', '');
        return {
          ...current,
          proxy: {
            ...current.proxy,
            [key]: value
          }
        };
      }

      return {
        ...current,
        [path]: value
      };
    });
  }

  async function loadTelegramSettings({ force = false } = {}) {
    if (telegramDirty && !force) return;

    setTelegramError('');
    const response = await fetch(API_URL + '/api/admin/telegram/settings');
    const data = await response.json();
    if (!data.ok) throw new Error(data.error || 'Telegram settings load failed');
    setTelegramSettings(data.settings || emptyTelegramSettings);
    setTelegramBridge(data.bridge || null);
    setTelegramDirty(false);
  }

  async function loadDashboard({ silent = false, includeTelegram = false } = {}) {
    if (!silent) setLoading(true);
    setError('');

    try {
      const [healthResponse, statsResponse, messagesResponse] = await Promise.all([
        fetch(API_URL + '/health'),
        fetch(API_URL + '/api/admin/stats'),
        fetch(API_URL + '/api/admin/messages?limit=25')
      ]);

      const [healthData, statsData, messagesData] = await Promise.all([
        healthResponse.json(),
        statsResponse.json(),
        messagesResponse.json()
      ]);

      setHealth(healthData);
      setStats(statsData.stats || null);
      setMessages(Array.isArray(messagesData.messages) ? messagesData.messages : []);
      if (healthData.telegram) setTelegramBridge(healthData.telegram);
      if (statsData.telegram) setTelegramBridge(statsData.telegram);

      if (includeTelegram) {
        try {
          await loadTelegramSettings({ force: false });
        } catch (telegramRequestError) {
          setTelegramError(telegramRequestError.message);
        }
      }

      setLastUpdate(new Date());
    } catch (requestError) {
      setHealth({ ok: false, error: requestError.message });
      setError(requestError.message);
    } finally {
      if (!silent) setLoading(false);
    }
  }

  async function saveTelegramSettings(event) {
    event.preventDefault();
    setSavingTelegram(true);
    setTelegramNotice('');
    setTelegramError('');
    setProxyTestResult(null);

    try {
      const response = await fetch(API_URL + '/api/admin/telegram/settings', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          botToken: telegramSettings.botToken,
          proxy: {
            enabled: Boolean(telegramSettings.proxy.enabled),
            type: telegramSettings.proxy.type || 'socks5',
            host: telegramSettings.proxy.host || '',
            port: Number(telegramSettings.proxy.port || 9050),
            username: telegramSettings.proxy.username || '',
            password: telegramSettings.proxy.password || ''
          }
        })
      });

      const data = await response.json();
      if (!data.ok) throw new Error(data.error || 'Save failed');
      setTelegramSettings(data.settings || emptyTelegramSettings);
      setTelegramBridge(data.bridge || telegramBridge);
      setTelegramDirty(false);
      setTelegramNotice(data.message || 'Настройки Telegram/SOCKS5 сохранены.');
    } catch (saveError) {
      setTelegramNotice(`Ошибка сохранения: ${saveError.message}`);
    } finally {
      setSavingTelegram(false);
    }
  }

  async function testProxy() {
    setTestingProxy(true);
    setTelegramNotice('');
    setTelegramError('');

    try {
      const response = await fetch(API_URL + '/api/admin/telegram/test-proxy', {
        method: 'POST'
      });
      const data = await response.json();
      setProxyTestResult(data);
      if (data.settings && !telegramDirty) setTelegramSettings(data.settings);
      if (data.bridge) setTelegramBridge(data.bridge);
    } catch (testError) {
      setProxyTestResult({ ok: false, status: 'error', message: testError.message });
    } finally {
      setTestingProxy(false);
    }
  }

  async function restartBridge() {
    setTestingProxy(true);
    setTelegramNotice('');
    setTelegramError('');

    try {
      const response = await fetch(API_URL + '/api/admin/telegram/restart', {
        method: 'POST'
      });
      const data = await response.json();
      if (!data.ok) throw new Error(data.error || 'Bridge restart failed');
      setTelegramBridge(data.bridge || null);
      setTelegramNotice(data.bridge?.running ? 'Telegram bridge перезапущен.' : `Bridge не запущен: ${data.bridge?.error || 'unknown error'}`);
      await loadDashboard({ silent: true, includeTelegram: true });
    } catch (restartError) {
      setTelegramError(restartError.message);
    } finally {
      setTestingProxy(false);
    }
  }

  async function resetTelegramForm() {
    setTelegramDirty(false);
    setTelegramNotice('');
    setTelegramError('');
    setProxyTestResult(null);
    await loadTelegramSettings({ force: true });
  }

  useEffect(() => {
    loadDashboard({ includeTelegram: true });
    const timer = setInterval(() => loadDashboard({ silent: true, includeTelegram: false }), REFRESH_MS);
    return () => clearInterval(timer);
  }, []);

  return (
    <main className="page">
      <section className="hero">
        <div>
          <p className="eyebrow">WSChat · operator console</p>
          <h1>Панель управления</h1>
          <p className="lead">Сообщения с сайта, статистика, Telegram-операторы и настройки прокси в одном месте.</p>
          <div className="status-row">
            <span className={healthOk ? 'status-pill ok' : 'status-pill bad'}>
              <Server size={14} /> API: {healthOk ? 'работает' : 'ошибка'}
            </span>
            <span className={telegramSettings.proxy.enabled ? 'status-pill ok' : 'status-pill muted'}>
              <Wifi size={14} /> SOCKS5: {telegramSettings.proxy.enabled ? 'включен' : 'выключен'}
            </span>
            <span className={telegramBridge?.running ? 'status-pill ok' : 'status-pill bad'}>
              <Bot size={14} /> bridge: {telegramBridge?.running ? 'online' : 'offline'}
            </span>
            {telegramDirty ? (
              <span className="status-pill warn">
                <Save size={14} /> есть несохранённые изменения
              </span>
            ) : null}
            <span className="status-pill muted">
              <Clock size={14} /> {lastUpdate ? `обновлено ${formatDate(lastUpdate)}` : 'ожидает данных'}
            </span>
          </div>
        </div>
        <button className="button" onClick={() => loadDashboard({ includeTelegram: true })} disabled={loading}>
          <RefreshCw size={18} className={loading ? 'spin' : ''} />
          {loading ? 'Обновляю...' : 'Обновить'}
        </button>
      </section>

      {error ? <div className="alert">Ошибка API: {error}</div> : null}
      {telegramError ? <div className="alert">Ошибка Telegram settings API: {telegramError}</div> : null}

      <section className="stats-grid">
        {statCards.map((card) => <StatCard key={card.label} {...card} />)}
      </section>

      <section className="settings-grid">
        <article className="panel settings-panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Telegram bridge</p>
              <h2>Настройки бота и SOCKS5</h2>
            </div>
            <span className={telegramSettings.hasBotToken ? 'status-pill ok' : 'status-pill bad'}>
              <KeyRound size={14} /> token {telegramSettings.hasBotToken ? 'есть' : 'не задан'}
            </span>
          </div>

          <div className="diagnostics-grid">
            <span><Server size={14} /> API: {API_URL}</span>
            <span><Database size={14} /> DB: {health?.dbPath || 'неизвестно'}</span>
            <span><Bot size={14} /> Bot: {telegramBridge?.username || 'неизвестно'}</span>
            <span><Activity size={14} /> Error: {telegramBridge?.error || 'нет'}</span>
          </div>

          <form className="settings-form" onSubmit={saveTelegramSettings}>
            <label className="field wide-field">
              <span>Telegram Bot Token</span>
              <input
                type="password"
                value={telegramSettings.botToken || ''}
                placeholder={telegramSettings.hasBotToken ? '********' : '123456:ABC...'}
                onChange={(event) => patchTelegramSettings('botToken', event.target.value)}
              />
              <small>Если токен уже сохранён, можно оставить маску ******** — старое значение не перезапишется.</small>
            </label>

            <label className="switch-field wide-field">
              <input
                type="checkbox"
                checked={Boolean(telegramSettings.proxy.enabled)}
                onChange={(event) => patchTelegramSettings('proxy.enabled', event.target.checked)}
              />
              <span>
                <strong>Использовать SOCKS5 для Telegram</strong>
                <small>Нужно для тестов бота через прокси. Без этого Telegram подключается напрямую.</small>
              </span>
            </label>

            <label className="field">
              <span>Тип</span>
              <select
                value={telegramSettings.proxy.type || 'socks5'}
                onChange={(event) => patchTelegramSettings('proxy.type', event.target.value)}
              >
                <option value="socks5">socks5</option>
              </select>
            </label>

            <label className="field">
              <span>Host</span>
              <input
                value={telegramSettings.proxy.host || ''}
                placeholder="127.0.0.1"
                onChange={(event) => patchTelegramSettings('proxy.host', event.target.value)}
              />
            </label>

            <label className="field">
              <span>Port</span>
              <input
                type="number"
                min="1"
                max="65535"
                value={telegramSettings.proxy.port || ''}
                placeholder="9050"
                onChange={(event) => patchTelegramSettings('proxy.port', event.target.value)}
              />
            </label>

            <label className="field">
              <span>Login</span>
              <input
                value={telegramSettings.proxy.username || ''}
                placeholder="необязательно"
                onChange={(event) => patchTelegramSettings('proxy.username', event.target.value)}
              />
            </label>

            <label className="field wide-field">
              <span>Password</span>
              <input
                type="password"
                value={telegramSettings.proxy.password || ''}
                placeholder={telegramSettings.proxy.hasPassword ? '********' : 'необязательно'}
                onChange={(event) => patchTelegramSettings('proxy.password', event.target.value)}
              />
              <small>Маску ******** можно оставить, тогда сохранённый пароль не изменится.</small>
            </label>

            <div className="form-actions wide-field">
              <button className="button" type="submit" disabled={savingTelegram}>
                <Save size={18} className={savingTelegram ? 'spin' : ''} />
                {savingTelegram ? 'Сохраняю...' : 'Сохранить'}
              </button>
              <button className="button secondary-button" type="button" onClick={testProxy} disabled={testingProxy || telegramDirty}>
                <PlugZap size={18} className={testingProxy ? 'spin' : ''} />
                {testingProxy ? 'Проверяю...' : 'Проверить прокси'}
              </button>
              <button className="button secondary-button" type="button" onClick={restartBridge} disabled={testingProxy || telegramDirty}>
                <RefreshCw size={18} className={testingProxy ? 'spin' : ''} />
                Restart bridge
              </button>
              <button className="ghost-button" type="button" onClick={resetTelegramForm}>Сбросить форму</button>
            </div>
            {telegramDirty ? <small className="wide-field form-hint">Сначала сохраните изменения, потом проверяйте прокси или перезапускайте bridge.</small> : null}
          </form>

          {telegramNotice ? <div className="notice"><CheckCircle size={16} /> {telegramNotice}</div> : null}
          {proxyTestResult ? (
            <div className={proxyTestResult.ok ? 'notice' : 'alert compact-alert'}>
              <PlugZap size={16} /> {proxyTestResult.message || proxyTestResult.status}
            </div>
          ) : null}
        </article>
      </section>

      <section className="content-grid">
        <article className="panel messages-panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Inbox</p>
              <h2>Последние сообщения</h2>
            </div>
            <span className="counter">{messages.length}</span>
          </div>

          {messages.length === 0 ? (
            <div className="empty-state">
              <MessageCircle size={28} />
              <p>Сообщений пока нет. После отправки из виджета они появятся здесь.</p>
            </div>
          ) : (
            <div className="message-list">
              {messages.map((message) => (
                <article className="message-item" key={message.id}>
                  <div className="message-meta">
                    <strong>{message.visitor_key || message.direction}</strong>
                    <span>{formatDate(message.created_at)}</span>
                  </div>
                  <p>{message.body}</p>
                  <footer>
                    <span>{message.site_domain || message.site_name || message.site_id}</span>
                    <span>{message.conversation_id}</span>
                  </footer>
                </article>
              ))}
            </div>
          )}
        </article>

        <aside className="side-stack">
          <article className="panel compact-panel">
            <Wifi />
            <h2>Telegram / SOCKS5</h2>
            <p>Источник настроек: SQLite через API. Сверяйте блок диагностики выше: API URL, DB path и bridge status.</p>
          </article>

          <article className="panel compact-panel">
            <ShieldCheck />
            <h2>FastPanel-safe</h2>
            <p>Публикуем только widget/admin webroot, backend держим на 127.0.0.1:3000 через reverse proxy.</p>
          </article>

          <article className="panel compact-panel code-panel">
            <Server />
            <h2>Backend</h2>
            <pre>{JSON.stringify(health, null, 2)}</pre>
          </article>
        </aside>
      </section>
    </main>
  );
}

createRoot(document.getElementById('root')).render(<App />);
