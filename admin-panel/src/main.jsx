import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { RefreshCw, Server, ShieldCheck, Wifi } from 'lucide-react';
import './styles.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

function App() {
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(false);

  async function checkHealth() {
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/health`);
      setHealth(await response.json());
    } catch (error) {
      setHealth({ ok: false, error: error.message });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    checkHealth();
  }, []);

  return (
    <main className="page">
      <section className="hero">
        <div>
          <p className="eyebrow">Raspi Telegram Live Chat</p>
          <h1>Админка управления чатом</h1>
          <p className="lead">MVP-каркас: backend на Raspberry Pi, фронт на VPS/FastPanel, операторы в Telegram.</p>
        </div>
        <button className="button" onClick={checkHealth} disabled={loading}>
          <RefreshCw size={18} />
          {loading ? 'Проверяю...' : 'Проверить API'}
        </button>
      </section>

      <section className="grid">
        <article className="card">
          <Server />
          <h2>Backend</h2>
          <p>API: {API_URL}</p>
          <pre>{JSON.stringify(health, null, 2)}</pre>
        </article>

        <article className="card">
          <ShieldCheck />
          <h2>FastPanel-safe deploy</h2>
          <p>Деплой будет обновлять только static-файлы admin/widget внутри разрешённых webroot-директорий.</p>
        </article>

        <article className="card">
          <Wifi />
          <h2>SOCKS5 для Telegram</h2>
          <p>Настройки proxy заложены в backend config и будут вынесены в админку отдельным разделом.</p>
        </article>
      </section>
    </main>
  );
}

createRoot(document.getElementById('root')).render(<App />);
