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

  const style = document.createElement('style');
  style.textContent = `
    .raspi-chat-button{position:fixed;right:18px;bottom:18px;z-index:2147483000;border:0;border-radius:999px;background:#172033;color:#fff;padding:13px 17px;font:700 14px system-ui;box-shadow:0 14px 35px rgba(0,0,0,.18);cursor:pointer;line-height:1}
    .raspi-chat-panel{position:fixed;right:18px;bottom:72px;z-index:2147483000;width:360px;max-width:calc(100vw - 32px);height:460px;max-height:calc(100vh - 96px);display:none;flex-direction:column;border-radius:22px;overflow:hidden;background:#fff;box-shadow:0 22px 70px rgba(0,0,0,.22);font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
    .raspi-chat-panel.open{display:flex}
    .raspi-chat-header{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:54px;padding:12px 14px 12px 16px;background:#172033;color:#fff;font-weight:800;line-height:1.2}
    .raspi-chat-title{display:flex;flex-direction:column;gap:2px;min-width:0}
    .raspi-chat-title strong{font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .raspi-chat-title span{font-size:11px;font-weight:600;color:rgba(255,255,255,.68)}
    .raspi-chat-close{width:34px;height:34px;display:grid;place-items:center;border:0;border-radius:12px;background:rgba(255,255,255,.1);color:#fff;font:800 22px/1 system-ui;cursor:pointer;flex:0 0 auto}
    .raspi-chat-close:hover{background:rgba(255,255,255,.16)}
    .raspi-chat-messages{flex:1;padding:14px;overflow:auto;background:#f4f6fb;color:#172033;font-size:14px;overscroll-behavior:contain}
    .raspi-chat-message{margin:0 0 10px;padding:10px 12px;border-radius:14px;background:#fff;line-height:1.45;word-wrap:break-word;white-space:pre-wrap}
    .raspi-chat-message.operator{background:#dfe8ff;margin-left:18px}
    .raspi-chat-message.visitor{background:#fff;margin-right:18px}
    .raspi-chat-system{opacity:.7;font-size:12px;padding:4px 2px}
    .raspi-chat-form{display:flex;gap:8px;padding:10px;border-top:1px solid #e7ebf3;background:#fff}
    .raspi-chat-input{flex:1;min-width:0;border:1px solid #d7deea;border-radius:12px;padding:10px;font:14px system-ui;outline:none}
    .raspi-chat-input:focus{border-color:#4f6bff;box-shadow:0 0 0 3px rgba(79,107,255,.12)}
    .raspi-chat-send{border:0;border-radius:12px;background:#4f6bff;color:#fff;min-width:44px;padding:0 14px;font-weight:800;cursor:pointer}
    @media (max-width: 560px){
      .raspi-chat-button{right:14px;bottom:14px;padding:13px 16px}
      .raspi-chat-panel{right:10px;left:10px;bottom:74px;width:auto;max-width:none;height:min(560px,calc(100vh - 92px));max-height:calc(100vh - 92px);border-radius:20px}
      .raspi-chat-header{min-height:50px;padding:10px 12px 10px 14px}
      .raspi-chat-close{width:38px;height:38px;border-radius:13px}
      .raspi-chat-messages{padding:12px;font-size:13px}
      .raspi-chat-message.operator{margin-left:10px}
      .raspi-chat-message.visitor{margin-right:10px}
      .raspi-chat-form{padding:9px}
    }
    @media (max-height: 560px){
      .raspi-chat-panel{top:10px;bottom:10px;height:auto;max-height:none}
    }
  `;
  document.head.appendChild(style);

  const button = document.createElement('button');
  button.className = 'raspi-chat-button';
  button.type = 'button';
  button.textContent = '💬 Чат';

  const panel = document.createElement('section');
  panel.className = 'raspi-chat-panel';
  panel.setAttribute('aria-label', 'Чат поддержки');
  panel.innerHTML = `
    <div class="raspi-chat-header">
      <div class="raspi-chat-title">
        <strong>StackWorks Support</strong>
        <span>Обычно отвечаем быстро</span>
      </div>
      <button class="raspi-chat-close" type="button" data-role="close" aria-label="Закрыть чат">×</button>
    </div>
    <div class="raspi-chat-messages" data-role="messages">
      <div class="raspi-chat-message operator">Здравствуйте! Чем можем помочь?</div>
    </div>
    <form class="raspi-chat-form" data-role="form">
      <input class="raspi-chat-input" data-role="input" placeholder="Ваше сообщение" autocomplete="off" />
      <button class="raspi-chat-send" type="submit" aria-label="Отправить">➤</button>
    </form>
  `;

  document.body.append(button, panel);

  const messages = panel.querySelector('[data-role="messages"]');
  const form = panel.querySelector('[data-role="form"]');
  const input = panel.querySelector('[data-role="input"]');
  const closeButton = panel.querySelector('[data-role="close"]');

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
    item.className = `raspi-chat-message ${type}`;
    item.textContent = text;
    messages.appendChild(item);
    messages.scrollTop = messages.scrollHeight;
  }

  function addSystem(text) {
    const item = document.createElement('div');
    item.className = 'raspi-chat-system';
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
