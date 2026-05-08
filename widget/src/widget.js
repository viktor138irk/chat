(() => {
  const currentScript = document.currentScript;
  const siteId = currentScript?.dataset?.siteId || 'unknown_site';
  const apiUrl = currentScript?.dataset?.apiUrl || 'http://localhost:3000';
  const wsUrl = currentScript?.dataset?.wsUrl || apiUrl.replace(/^http/i, 'ws');
  const visitorIdKey = `raspi_chat_visitor_${siteId}`;

  let visitorId = localStorage.getItem(visitorIdKey);
  if (!visitorId) {
    visitorId = `visitor_${crypto.randomUUID()}`;
    localStorage.setItem(visitorIdKey, visitorId);
  }

  const host = document.createElement('div');
  host.id = `wschat-host-${siteId}`;
  host.style.all = 'initial';
  document.body.appendChild(host);

  const root = host.attachShadow({ mode: 'open' });

  root.innerHTML = `
    <style>
      :host{all:initial;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
      *{box-sizing:border-box}
      .chat-button{position:fixed;right:18px;bottom:18px;z-index:2147483000;border:0;border-radius:999px;background:#172033;color:#fff;padding:13px 17px;font:700 14px/1 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;box-shadow:0 14px 35px rgba(0,0,0,.18);cursor:pointer;margin:0}
      .chat-panel{position:fixed;right:18px;bottom:72px;z-index:2147483000;width:360px;max-width:calc(100vw - 32px);height:min(460px,calc(100dvh - 96px));display:none;flex-direction:column;border-radius:22px;overflow:hidden;background:#fff;box-shadow:0 22px 70px rgba(0,0,0,.22);font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;margin:0;padding:0;border:0}
      .chat-panel.open{display:flex}
      .chat-header{display:flex;align-items:center;justify-content:space-between;gap:12px;height:58px;min-height:58px;max-height:58px;padding:11px 14px 11px 16px;background:#172033;color:#fff;font-weight:800;line-height:1.2;flex:0 0 58px;margin:0;border:0}
      .chat-title{display:flex;flex-direction:column;gap:2px;min-width:0;margin:0;padding:0}
      .chat-title strong{display:block;font-size:14px;line-height:17px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin:0;color:#fff}
      .chat-title span{display:block;font-size:11px;line-height:14px;font-weight:600;color:rgba(255,255,255,.68);margin:0}
      .chat-close{width:34px;height:34px;display:grid;place-items:center;border:0;border-radius:12px;background:rgba(255,255,255,.1);color:#fff;font:800 22px/1 system-ui;cursor:pointer;flex:0 0 auto;margin:0;padding:0}
      .chat-close:hover{background:rgba(255,255,255,.16)}
      .chat-messages{flex:1 1 auto;height:0;min-height:0;padding:14px;overflow:auto;background:#f4f6fb;color:#172033;font-size:14px;overscroll-behavior:contain;margin:0;border:0}
      .chat-message{margin:0 0 10px;padding:10px 12px;border-radius:14px;background:#fff;color:#172033;line-height:1.45;word-wrap:break-word;white-space:pre-wrap;max-width:100%;border:0;font-size:14px}
      .chat-message.operator{background:#dfe8ff;margin-left:18px}
      .chat-message.visitor{background:#fff;margin-right:18px}
      .chat-system{opacity:.7;font-size:12px;line-height:1.35;padding:4px 2px;color:#172033;margin:0;background:transparent}
      .chat-form{display:flex;align-items:stretch;gap:8px;height:62px;min-height:62px;max-height:62px;padding:10px;border-top:1px solid #e7ebf3;background:#fff;flex:0 0 62px;margin:0}
      .chat-input{flex:1 1 auto;min-width:0;height:42px;border:1px solid #d7deea;border-radius:12px;padding:0 10px;font:14px/42px system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;outline:none;background:#fff;color:#172033;margin:0;box-shadow:none}
      .chat-input:focus{border-color:#4f6bff;box-shadow:0 0 0 3px rgba(79,107,255,.12)}
      .chat-send{border:0;border-radius:12px;background:#4f6bff;color:#fff;width:44px;min-width:44px;height:42px;padding:0;font:800 18px/42px system-ui;cursor:pointer;margin:0;display:grid;place-items:center}
      @media (max-width:560px){
        .chat-button{right:14px;bottom:14px;padding:13px 16px}
        .chat-panel{right:10px;left:10px;bottom:74px;width:auto;max-width:none;height:min(430px,calc(100dvh - 92px));border-radius:20px}
        .chat-header{height:56px;min-height:56px;max-height:56px;flex-basis:56px;padding:10px 12px 10px 14px}
        .chat-close{width:38px;height:38px;border-radius:13px}
        .chat-messages{height:0;min-height:0;padding:12px;font-size:13px;max-height:none}
        .chat-message{font-size:13px}
        .chat-message.operator{margin-left:10px}
        .chat-message.visitor{margin-right:10px}
        .chat-form{height:60px;min-height:60px;max-height:60px;flex-basis:60px;padding:9px}
        .chat-input{height:42px;line-height:42px}
        .chat-send{height:42px;line-height:42px}
      }
      @media (max-height:560px){
        .chat-panel{top:10px;bottom:10px;height:auto;max-height:none}
        .chat-messages{height:0;min-height:0;max-height:none}
      }
    </style>

    <button class="chat-button" type="button">💬 Чат</button>

    <section class="chat-panel" aria-label="Чат поддержки">
      <div class="chat-header">
        <div class="chat-title">
          <strong>StackWorks Support</strong>
          <span>Обычно отвечаем быстро</span>
        </div>
        <button class="chat-close" type="button" data-role="close" aria-label="Закрыть чат">×</button>
      </div>
      <div class="chat-messages" data-role="messages">
        <div class="chat-message operator">Здравствуйте! Чем можем помочь?</div>
      </div>
      <form class="chat-form" data-role="form">
        <input class="chat-input" data-role="input" placeholder="Ваше сообщение" autocomplete="off" />
        <button class="chat-send" type="submit" aria-label="Отправить">➤</button>
      </form>
    </section>
  `;

  const button = root.querySelector('.chat-button');
  const panel = root.querySelector('.chat-panel');
  const messages = root.querySelector('[data-role="messages"]');
  const form = root.querySelector('[data-role="form"]');
  const input = root.querySelector('[data-role="input"]');
  const closeButton = root.querySelector('[data-role="close"]');

  let socket = null;
  let reconnectTimer = null;

  function openChat() {
    panel.classList.add('open');
    button.style.display = 'none';
    setTimeout(() => input?.focus(), 120);
  }

  function closeChat() {
    panel.classList.remove('open');
    button.style.display = '';
  }

  button.addEventListener('click', openChat);
  closeButton.addEventListener('click', closeChat);

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && panel.classList.contains('open')) {
      closeChat();
    }
  });

  function addMessage(text, type = 'visitor') {
    const item = document.createElement('div');
    item.className = `chat-message ${type}`;
    item.textContent = text;
    messages.appendChild(item);
    messages.scrollTop = messages.scrollHeight;
  }

  function addSystem(text) {
    const item = document.createElement('div');
    item.className = 'chat-system';
    item.textContent = text;
    messages.appendChild(item);
    messages.scrollTop = messages.scrollHeight;
  }

  function connectWs() {
    if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
      return;
    }

    socket = new WebSocket(`${wsUrl}/ws?siteId=${encodeURIComponent(siteId)}&visitorId=${encodeURIComponent(visitorId)}`);

    socket.addEventListener('open', () => {
      addSystem('Оператор подключен');
    });

    socket.addEventListener('message', (event) => {
      try {
        const payload = JSON.parse(event.data);

        if (payload.type === 'operator_message') {
          addMessage(payload.message?.body || 'Новое сообщение от оператора', 'operator');
          openChat();
        }
      } catch {
        // ignore invalid frames
      }
    });

    socket.addEventListener('close', () => {
      addSystem('Соединение потеряно, переподключение...');
      clearTimeout(reconnectTimer);
      reconnectTimer = setTimeout(connectWs, 3000);
    });
  }

  connectWs();

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const message = input.value.trim();
    if (!message) return;

    input.value = '';
    addMessage(message, 'visitor');

    try {
      const response = await fetch(`${apiUrl}/api/widget/message`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ siteId, visitorId, message })
      });

      const result = await response.json();
      if (!result.ok) {
        addSystem(`Ошибка: ${result.error || 'message rejected'}`);
      }
    } catch {
      addSystem('Сообщение не отправилось. Проверьте соединение.');
    }
  });
})();
