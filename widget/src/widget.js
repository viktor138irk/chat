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
    .raspi-chat-button{position:fixed;right:20px;bottom:20px;z-index:2147483000;border:0;border-radius:999px;background:#172033;color:#fff;padding:14px 18px;font:700 14px system-ui;box-shadow:0 14px 35px rgba(0,0,0,.18);cursor:pointer}
    .raspi-chat-panel{position:fixed;right:20px;bottom:78px;z-index:2147483000;width:340px;max-width:calc(100vw - 40px);height:430px;display:none;flex-direction:column;border-radius:22px;overflow:hidden;background:#fff;box-shadow:0 22px 70px rgba(0,0,0,.22);font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
    .raspi-chat-panel.open{display:flex}
    .raspi-chat-header{padding:16px;background:#172033;color:#fff;font-weight:800}
    .raspi-chat-messages{flex:1;padding:14px;overflow:auto;background:#f4f6fb;color:#172033;font-size:14px}
    .raspi-chat-message{margin:0 0 10px;padding:10px 12px;border-radius:14px;background:#fff;line-height:1.45}
    .raspi-chat-message.operator{background:#dfe8ff;margin-left:18px}
    .raspi-chat-message.visitor{background:#fff;margin-right:18px}
    .raspi-chat-system{opacity:.7;font-size:12px;padding:4px 2px}
    .raspi-chat-form{display:flex;gap:8px;padding:12px;border-top:1px solid #e7ebf3}
    .raspi-chat-input{flex:1;border:1px solid #d7deea;border-radius:12px;padding:10px;font:14px system-ui}
    .raspi-chat-send{border:0;border-radius:12px;background:#4f6bff;color:#fff;padding:0 14px;font-weight:800;cursor:pointer}
  `;
  document.head.appendChild(style);

  const button = document.createElement('button');
  button.className = 'raspi-chat-button';
  button.textContent = '💬 Чат';

  const panel = document.createElement('section');
  panel.className = 'raspi-chat-panel';
  panel.innerHTML = `
    <div class="raspi-chat-header">StackWorks Support</div>
    <div class="raspi-chat-messages" data-role="messages">
      <div class="raspi-chat-message operator">Здравствуйте! Чем можем помочь?</div>
    </div>
    <form class="raspi-chat-form" data-role="form">
      <input class="raspi-chat-input" data-role="input" placeholder="Ваше сообщение" autocomplete="off" />
      <button class="raspi-chat-send" type="submit">➤</button>
    </form>
  `;

  document.body.append(button, panel);

  const messages = panel.querySelector('[data-role="messages"]');
  const form = panel.querySelector('[data-role="form"]');
  const input = panel.querySelector('[data-role="input"]');

  let socket = null;
  let reconnectTimer = null;

  button.addEventListener('click', () => {
    panel.classList.toggle('open');
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
