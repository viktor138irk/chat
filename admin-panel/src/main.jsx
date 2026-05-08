import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { RefreshCw, Server, ShieldCheck, Wifi } from 'lucide-react';
import './styles.css';

const API_URL = import.meta.env.VITE_API_URL || 'https://api.stackworks.ru';

function App() {
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(false);

  async function checkHealth() {
    setLoading(true);
    try {
      const response = await fetch(API_URL + '/health');
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
          <p className="eyebrow">WSChat</p>
          <h1>Admin panel</h1>
          <p className="lead">VPS backend, website widget, Telegram operators.</p>
        </div>
        <button className="button" onClick={checkHealth} disabled={loading}>
          <RefreshCw size={18} />
          {loading ? 'Checking...' : 'Check API'}
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
          <p>Deploy updates only widget/admin static files inside the configured webroot.</p>
        </article>

        <article className="card">
          <Wifi />
          <h2>Telegram SOCKS5</h2>
          <p>Proxy settings are already supported by backend config and will be moved into admin settings.</p>
        </article>
      </section>
    </main>
  );
}

createRoot(document.getElementById('root')).render(<App />);
