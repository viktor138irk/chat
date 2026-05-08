import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Activity,
  Bot,
  Clock,
  MessageCircle,
  RefreshCw,
  Server,
  ShieldCheck,
  Users,
  Wifi
} from 'lucide-react';
import './styles.css';

const API_URL = import.meta.env.VITE_API_URL || 'https://api.stackworks.ru';
const REFRESH_MS = 15000;

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value.replace(' ', 'T') + 'Z');
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('ru-RU', {
    dateStyle: 'short',
    timeStyle: 'short'
  }).format(date);
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
  const [loading, setLoading] = useState(false);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [error, setError] = useState('');

  const healthOk = health?.ok === true;

  const statCards = useMemo(() => ([
    { icon: ShieldCheck, label: 'Сайты', value: stats?.sites },
    { icon: Users, label: 'Посетители', value: stats?.visitors },
    { icon: MessageCircle, label: 'Диалоги', value: stats?.conversations },
    { icon: Activity, label: 'Открытые', value: stats?.openConversations },
    { icon: Bot, label: 'Сообщения', value: stats?.messages }
  ]), [stats]);

  async function loadDashboard({ silent = false } = {}) {
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
      setLastUpdate(new Date());
    } catch (requestError) {
      setHealth({ ok: false, error: requestError.message });
      setError(requestError.message);
    } finally {
      if (!silent) setLoading(false);
    }
  }

  useEffect(() => {
    loadDashboard();
    const timer = setInterval(() => loadDashboard({ silent: true }), REFRESH_MS);
    return () => clearInterval(timer);
  }, []);

  return (
    <main className="page">
      <section className="hero">
        <div>
          <p className="eyebrow">WSChat · operator console</p>
          <h1>Панель управления</h1>
          <p className="lead">Сообщения с сайта, статистика, Telegram-операторы и будущие настройки виджета в одном месте.</p>
          <div className="status-row">
            <span className={healthOk ? 'status-pill ok' : 'status-pill bad'}>
              <Server size={14} /> API: {healthOk ? 'работает' : 'ошибка'}
            </span>
            <span className="status-pill muted">
              <Clock size={14} /> {lastUpdate ? `обновлено ${formatDate(lastUpdate.toISOString())}` : 'ожидает данных'}
            </span>
          </div>
        </div>
        <button className="button" onClick={() => loadDashboard()} disabled={loading}>
          <RefreshCw size={18} className={loading ? 'spin' : ''} />
          {loading ? 'Обновляю...' : 'Обновить'}
        </button>
      </section>

      {error ? <div className="alert">Ошибка API: {error}</div> : null}

      <section className="stats-grid">
        {statCards.map((card) => <StatCard key={card.label} {...card} />)}
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
            <p>Следующий крупный блок: привязка операторов Telegram, прокси и маршрутизация ответов обратно в виджет.</p>
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
