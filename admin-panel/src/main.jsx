import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Activity,
  Bot,
  CheckCircle,
  Clock,
  Copy,
  Database,
  Globe,
  KeyRound,
  Link2,
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
const WIDGET_URL = import.meta.env.VITE_WIDGET_URL || 'https://widget.stackworks.ru/widget.js';
const WS_URL = import.meta.env.VITE_WS_URL || 'wss://api.stackworks.ru';
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
  return new Intl.DateTimeFormat('ru-RU', { dateStyle: 'short', timeStyle: 'short' }).format(source);
}

function makeEmbedCode(widgetKey) {
  return `<script\n  src="${WIDGET_URL}"\n  data-site-id="${widgetKey}"\n  data-api-url="${API_URL}"\n  data-ws-url="${WS_URL}"\n></script>`;
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
  const [sites, setSites] = useState([]);
  const [operators, setOperators] = useState([]);
  const [newSite, setNewSite] = useState({ name: '', domain: '' });
  const [telegramSettings, setTelegramSettings] = useState(emptyTelegramSettings);
  const [telegramBridge, setTelegramBridge] = useState(null);
  const [telegramDirty, setTelegramDirty] = useState(false);
  const [loading, setLoading] = useState(false);
  const [savingTelegram, setSavingTelegram] = useState(false);
  const [savingSite, setSavingSite] = useState(false);
  const [testingProxy, setTestingProxy] = useState(false);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [error, setError] = useState('');
  const [telegramError, setTelegramError] = useState('');
  const [telegramNotice, setTelegramNotice] = useState('');
  const [adminNotice, setAdminNotice] = useState('');
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
        return { ...current, proxy: { ...current.proxy, [key]: value } };
      }
      return { ...current, [path]: value };
    });
  }

  async function requestJson(path, options = {}) {
    const response = await fetch(API_URL + path, {
      ...options,
      headers: {
        'content-type': 'application/json',
        ...(options.headers || {})
      }
    });
    const data = await response.json();
    if (!data.ok) throw new Error(data.error || `Request failed: ${path}`);
    return data;
  }

  async function loadTelegramSettings({ force = false } = {}) {
    if (telegramDirty && !force) return;
    setTelegramError('');
    const data = await requestJson('/api/admin/telegram/settings');
    setTelegramSettings(data.settings || emptyTelegramSettings);
    setTelegramBridge(data.bridge || null);
    setTelegramDirty(false);
  }

  async function loadSitesAndOperators() {
    const [sitesData, operatorsData] = await Promise.all([
      requestJson('/api/admin/sites'),
      requestJson('/api/admin/operators')
    ]);
    setSites(Array.isArray(sitesData.sites) ? sitesData.sites : []);
    setOperators(Array.isArray(operatorsData.operators) ? operatorsData.operators : []);
  }

  async function loadDashboard({ silent = false, includeTelegram = false } = {}) {
    if (!silent) setLoading(true);
    setError('');

    try {
      const [healthData, statsData, messagesData] = await Promise.all([
        fetch(API_URL + '/health').then((r) => r.json()),
        requestJson('/api/admin/stats'),
        requestJson('/api/admin/messages?limit=25')
      ]);

      setHealth(healthData);
      setStats(statsData.stats || null);
      setMessages(Array.isArray(messagesData.messages) ? messagesData.messages : []);
      if (healthData.telegram) setTelegramBridge(healthData.telegram);
      if (statsData.telegram) setTelegramBridge(statsData.telegram);

      await loadSitesAndOperators();

      if (includeTelegram) {
        try { await loadTelegramSettings({ force: false }); }
        catch (telegramRequestError) { setTelegramError(telegramRequestError.message); }
      }

      setLastUpdate(new Date());
    } catch (requestError) {
      setHealth({ ok: false, error: requestError.message });
      setError(requestError.message);
    } finally {
      if (!silent) setLoading(false);
    }
  }

  async function createSite(event) {
    event.preventDefault();
    setSavingSite(true);
    setAdminNotice('');

    try {
      await requestJson('/api/admin/sites', {
        method: 'POST',
        body: JSON.stringify(newSite)
      });
      setNewSite({ name: '', domain: '' });
      setAdminNotice('Сайт добавлен. Embed-код появился в списке ниже.');
      await loadDashboard({ silent: true });
    } catch (siteError) {
      setAdminNotice(`Ошибка добавления сайта: ${siteError.message}`);
    } finally {
      setSavingSite(false);
    }
  }

  async function bindOperator(siteId, operatorId) {
    setAdminNotice('');
    try {
      await requestJson('/api/admin/site-operators', {
        method: 'POST',
        body: JSON.stringify({ siteId, operatorId })
      });
      setAdminNotice('Оператор привязан к сайту.');
      await loadSitesAndOperators();
    } catch (bindError) {
      setAdminNotice(`Ошибка привязки: ${bindError.message}`);
    }
  }

  async function unbindOperator(siteId, operatorId) {
    setAdminNotice('');
    try {
      await requestJson('/api/admin/site-operators', {
        method: 'DELETE',
        body: JSON.stringify({ siteId, operatorId })
      });
      setAdminNotice('Оператор отвязан от сайта.');
      await loadSitesAndOperators();
    } catch (bindError) {
      setAdminNotice(`Ошибка отвязки: ${bindError.message}`);
    }
  }

  async function copyText(text) {
    await navigator.clipboard.writeText(text);
    setAdminNotice('Embed-код скопирован.');
  }

  async function saveTelegramSettings(event) {
    event.preventDefault();
    setSavingTelegram(true);
    setTelegramNotice('');
    setTelegramError('');
    setProxyTestResult(null);

    try {
      const data = await requestJson('/api/admin/telegram/settings', {
        method: 'POST',
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
      const data = await requestJson('/api/admin/telegram/test-proxy', { method: 'POST' });
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
      const data = await requestJson('/api/admin/telegram/restart', { method: 'POST' });
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
          <p className="lead">Сообщения с сайта, статистика, Telegram-операторы, сайты и настройки прокси в одном месте.</p>
          <div className="status-row">
            <span className={healthOk ? 'status-pill ok' : 'status-pill bad'}><Server size={14} /> API: {healthOk ? 'работает' : 'ошибка'}</span>
            <span className={telegramSettings.proxy.enabled ? 'status-pill ok' : 'status-pill muted'}><Wifi size={14} /> SOCKS5: {telegramSettings.proxy.enabled ? 'включен' : 'выключен'}</span>
            <span className={telegramBridge?.running ? 'status-pill ok' : 'status-pill bad'}><Bot size={14} /> bridge: {telegramBridge?.running ? 'online' : 'offline'}</span>
            {telegramDirty ? <span className="status-pill warn"><Save size={14} /> есть несохранённые изменения</span> : null}
            <span className="status-pill muted"><Clock size={14} /> {lastUpdate ? `обновлено ${formatDate(lastUpdate)}` : 'ожидает данных'}</span>
          </div>
        </div>
        <button className="button" onClick={() => loadDashboard({ includeTelegram: true })} disabled={loading}>
          <RefreshCw size={18} className={loading ? 'spin' : ''} /> {loading ? 'Обновляю...' : 'Обновить'}
        </button>
      </section>

      {error ? <div className="alert">Ошибка API: {error}</div> : null}
      {telegramError ? <div className="alert">Ошибка Telegram settings API: {telegramError}</div> : null}
      {adminNotice ? <div className="notice"><CheckCircle size={16} /> {adminNotice}</div> : null}

      <section className="stats-grid">
        {statCards.map((card) => <StatCard key={card.label} {...card} />)}
      </section>

      <section className="panel sites-panel">
        <div className="panel-head">
          <div>
            <p className="eyebrow">Sites & operators</p>
            <h2>Сайты, embed-код и Telegram-операторы</h2>
          </div>
          <span className="counter">{sites.length}</span>
        </div>

        <form className="settings-form compact-form" onSubmit={createSite}>
          <label className="field">
            <span>Название</span>
            <input value={newSite.name} placeholder="StackWorks" onChange={(event) => setNewSite((current) => ({ ...current, name: event.target.value }))} />
          </label>
          <label className="field">
            <span>Домен</span>
            <input value={newSite.domain} placeholder="stackworks.ru" onChange={(event) => setNewSite((current) => ({ ...current, domain: event.target.value }))} />
          </label>
          <div className="form-actions align-end">
            <button className="button" type="submit" disabled={savingSite}>
              <Globe size={18} /> {savingSite ? 'Добавляю...' : 'Добавить сайт'}
            </button>
          </div>
        </form>

        <div className="site-list">
          {sites.map((site) => {
            const embed = makeEmbedCode(site.widget_key);
            const linkedOperatorIds = new Set(
              operators
                .filter((operator) => String(operator.sites || '').split(', ').includes(site.domain))
                .map((operator) => operator.id)
            );

            return (
              <article className="site-card" key={site.id}>
                <div className="site-card-head">
                  <div>
                    <strong>{site.name}</strong>
                    <span>{site.domain}</span>
                  </div>
                  <span className={site.is_active ? 'status-pill ok' : 'status-pill bad'}>{site.is_active ? 'active' : 'off'}</span>
                </div>

                <div className="mini-stats">
                  <span><Globe size={14} /> {site.widget_key}</span>
                  <span><Users size={14} /> {site.visitors_count || 0} visitors</span>
                  <span><MessageCircle size={14} /> {site.conversations_count || 0} dialogs</span>
                  <span><Bot size={14} /> {site.operators_count || 0} operators</span>
                </div>

                <pre className="embed-code">{embed}</pre>
                <button className="secondary-button" type="button" onClick={() => copyText(embed)}><Copy size={16} /> Скопировать embed</button>

                <div className="operator-bindings">
                  <h3><Link2 size={16} /> Привязка операторов</h3>
                  {operators.length === 0 ? <p className="muted-text">Операторов пока нет. Напишите /start Telegram-боту.</p> : null}
                  {operators.map((operator) => {
                    const linked = linkedOperatorIds.has(operator.id);
                    return (
                      <button
                        key={operator.id}
                        type="button"
                        className={linked ? 'operator-chip linked' : 'operator-chip'}
                        onClick={() => linked ? unbindOperator(site.id, operator.id) : bindOperator(site.id, operator.id)}
                      >
                        <Bot size={14} />
                        {operator.name || operator.telegram_username || operator.telegram_user_id}
                        <small>{linked ? 'привязан' : 'не привязан'}</small>
                      </button>
                    );
                  })}
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section className="settings-grid">
        <article className="panel settings-panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Telegram bridge</p>
              <h2>Настройки бота и SOCKS5</h2>
            </div>
            <span className={telegramSettings.hasBotToken ? 'status-pill ok' : 'status-pill bad'}><KeyRound size={14} /> token {telegramSettings.hasBotToken ? 'есть' : 'не задан'}</span>
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
              <input type="password" value={telegramSettings.botToken || ''} placeholder={telegramSettings.hasBotToken ? '********' : '123456:ABC...'} onChange={(event) => patchTelegramSettings('botToken', event.target.value)} />
              <small>Если токен уже сохранён, можно оставить маску ******** — старое значение не перезапишется.</small>
            </label>
            <label className="switch-field wide-field">
              <input type="checkbox" checked={Boolean(telegramSettings.proxy.enabled)} onChange={(event) => patchTelegramSettings('proxy.enabled', event.target.checked)} />
              <span><strong>Использовать SOCKS5 для Telegram</strong><small>Нужно для тестов бота через прокси. Без этого Telegram подключается напрямую.</small></span>
            </label>
            <label className="field"><span>Тип</span><select value={telegramSettings.proxy.type || 'socks5'} onChange={(event) => patchTelegramSettings('proxy.type', event.target.value)}><option value="socks5">socks5</option></select></label>
            <label className="field"><span>Host</span><input value={telegramSettings.proxy.host || ''} placeholder="127.0.0.1" onChange={(event) => patchTelegramSettings('proxy.host', event.target.value)} /></label>
            <label className="field"><span>Port</span><input type="number" min="1" max="65535" value={telegramSettings.proxy.port || ''} placeholder="9050" onChange={(event) => patchTelegramSettings('proxy.port', event.target.value)} /></label>
            <label className="field"><span>Login</span><input value={telegramSettings.proxy.username || ''} placeholder="необязательно" onChange={(event) => patchTelegramSettings('proxy.username', event.target.value)} /></label>
            <label className="field wide-field"><span>Password</span><input type="password" value={telegramSettings.proxy.password || ''} placeholder={telegramSettings.proxy.hasPassword ? '********' : 'необязательно'} onChange={(event) => patchTelegramSettings('proxy.password', event.target.value)} /><small>Маску ******** можно оставить, тогда сохранённый пароль не изменится.</small></label>
            <div className="form-actions wide-field">
              <button className="button" type="submit" disabled={savingTelegram}><Save size={18} className={savingTelegram ? 'spin' : ''} />{savingTelegram ? 'Сохраняю...' : 'Сохранить'}</button>
              <button className="button secondary-button" type="button" onClick={testProxy} disabled={testingProxy || telegramDirty}><PlugZap size={18} className={testingProxy ? 'spin' : ''} />{testingProxy ? 'Проверяю...' : 'Проверить прокси'}</button>
              <button className="button secondary-button" type="button" onClick={restartBridge} disabled={testingProxy || telegramDirty}><RefreshCw size={18} className={testingProxy ? 'spin' : ''} />Restart bridge</button>
              <button className="ghost-button" type="button" onClick={resetTelegramForm}>Сбросить форму</button>
            </div>
          </form>

          {telegramNotice ? <div className="notice"><CheckCircle size={16} /> {telegramNotice}</div> : null}
          {proxyTestResult ? <div className={proxyTestResult.ok ? 'notice' : 'alert compact-alert'}><PlugZap size={16} /> {proxyTestResult.message || proxyTestResult.status}</div> : null}
        </article>
      </section>

      <section className="content-grid">
        <article className="panel messages-panel">
          <div className="panel-head"><div><p className="eyebrow">Inbox</p><h2>Последние сообщения</h2></div><span className="counter">{messages.length}</span></div>
          {messages.length === 0 ? <div className="empty-state"><MessageCircle size={28} /><p>Сообщений пока нет. После отправки из виджета они появятся здесь.</p></div> : (
            <div className="message-list">{messages.map((message) => <article className="message-item" key={message.id}><div className="message-meta"><strong>{message.visitor_key || message.direction}</strong><span>{formatDate(message.created_at)}</span></div><p>{message.body}</p><footer><span>{message.site_domain || message.site_name || message.site_id}</span><span>{message.conversation_id}</span></footer></article>)}</div>
          )}
        </article>
        <aside className="side-stack">
          <article className="panel compact-panel"><Wifi /><h2>Telegram / SOCKS5</h2><p>Источник настроек: SQLite через API. Сверяйте блок диагностики выше: API URL, DB path и bridge status.</p></article>
          <article className="panel compact-panel"><ShieldCheck /><h2>FastPanel-safe</h2><p>Публикуем только widget/admin webroot, backend держим на 127.0.0.1:3000 через reverse proxy.</p></article>
          <article className="panel compact-panel code-panel"><Server /><h2>Backend</h2><pre>{JSON.stringify(health, null, 2)}</pre></article>
        </aside>
      </section>
    </main>
  );
}

createRoot(document.getElementById('root')).render(<App />);
