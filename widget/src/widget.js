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
    .raspi-chat-button,.raspi-chat-panel,.raspi-chat-panel *{box-sizing:border-box}
    .raspi-chat-button{position:fixed!important;right:18px!important;bottom:18px!important;z-index:2147483000!important;border:0!important;border-radius:999px!important;background:#172033!important;color:#fff!important;padding:13px 17px!important;font:700 14px/1 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif!important;box-shadow:0 14px 35px rgba(0,0,0,.18)!important;cursor:pointer!important;margin:0!important}
    .raspi-chat-panel{position:fixed!important;right:18px!important;bottom:72px!important;z-index:2147483000!important;width:360px!important;max-width:calc(100vw - 32px)!important;height:min(460px,calc(100dvh - 96px))!important;display:none!important;flex-direction:column!important;border-radius:22px!important;overflow:hidden!important;background:#fff!important;box-shadow:0 22px 70px rgba(0,0,0,.22)!important;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif!important;margin:0!important;padding:0!important;border:0!important}
    .raspi-chat-panel.open{display:flex!important}
    .raspi-chat-header{display:flex!important;align-items:center!important;justify-content:space-between!important;gap:12px!important;height:58px!important;min-height:58px!important;max-height:58px!important;padding:11px 14px 11px 16px!important;background:#172033!important;color:#fff!important;font-weight:800!important;line-height:1.2!important;flex:0 0 58px!important;margin:0!important;border:0!important}
    .raspi-chat-title{display:flex!important;flex-direction:column!important;gap:2px!important;min-width:0!important;margin:0!important;padding:0!important}
    .raspi-chat-title strong{display:block!important;font-size:14px!important;line-height:17px!important;white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important;margin:0!important;color:#fff!important}
    .raspi-chat-title span{display:block!important;font-size:11px!important;line-height:14px!important;font-weight:600!important;color:rgba(255,255,255,.68)!important;margin:0!important}
    .raspi-chat-close{width:34px!important;height:34px!important;display:grid!important;place-items:center!important;border:0!important;border-radius:12px!important;background:rgba(255,255,255,.1)!important;color:#fff!important;font:800 22px/1 system-ui!important;cursor:pointer!important;flex:0 0 auto!important;margin:0!important;padding:0!important}
    .raspi-chat-close:hover{background:rgba(255,255,255,.16)!important}
    .raspi-chat-messages{flex:1 1 auto!important;height:0!important;min-height:0!important;padding:14px!important;overflow:auto!important;background:#f4f6fb!important;color:#172033!important;font-size:14px!important;overscroll-behavior:contain!important;margin:0!important;border:0!important}
    .raspi-chat-message{margin:0 0 10px!important;padding:10px 12px!important;border-radius:14px!important;background:#fff!important;color:#172033!important;line-height:1.45!important;word-wrap:break-word!important;white-space:pre-wrap!important;max-width:100%!important;border:0!important}
    .raspi-chat-message.operator{background:#dfe8ff!important;margin-left:18px!important}
    .raspi-chat-message.visitor{background:#fff!important;margin-right:18px!important}
    .raspi-chat-system{opacity:.7!important;font-size:12px!important;line-height:1.35!important;padding:4px 2px!important;color:#172033!important;margin:0!important;background:transparent!important}
    .raspi-chat-form{display:flex!important;align-items:stretch!important;gap:8px!important;height:62px!important;min-height:62px!important;max-height:62px!important;padding:10px!important;border-top:1px solid #e7ebf3!important;background:#fff!important;flex:0 0 62px!important;margin:0!important}
    .raspi-chat-input{flex:1 1 auto!important;min-width:0!important;height:42px!important;border:1px solid #d7deea!important;border-radius:12px!important;padding:0 10px!important;font:14px/42px system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif!important;outline:none!important;background:#fff!important;color:#172033!important;margin:0!important;box-shadow:none!important}
    .raspi-chat-input:focus{border-color:#4f6bff!important;box-shadow:0 0 0 3px rgba(79,107,255,.12)!important}
    .raspi-chat-send{border:0!important;border-radius:12px!important;background:#4f6bff!important;color:#fff!important;width:44px!important;min-width:44px!important;height:42px!important;padding:0!important;font:800 18px/42px system-ui!important;cursor:pointer!important;margin:0!important;display:grid!important;place-items:center!important}
    @media (max-width: 560px){
      .raspi-chat-button{right:14px!important;bottom:14px!important;padding:13px 16px!important}
      .raspi-chat-panel{right:10px!important;left:10px!important;bottom:74px!important;width:auto!important;max-width:none!important;height:min(430px,calc(100dvh - 92px))!important;border-radius:20px!important}
      .raspi-chat-header{height:56px!important;min-height:56px!important;max-height:56px!important;flex-basis:56px!important;padding:10px 12px 10px 14px!important}
      .raspi-chat-close{width:38px!important;height:38px!important;border-radius:13px!important}
      .raspi-chat-messages{height:0!important;min-height:0!important;padding:12px!important;font-size:13px!important;max-height:none!important}
      .raspi-chat-message.operator{margin-left:10px!important}
      .raspi-chat-message.visitor{margin-right:10px!important}
      .raspi-chat-form{height:60px!important;min-height:60px!important;max-height:60px!important;flex-basis:60px!important;padding:9px!important}
      .raspi-chat-input{height:42px!important;line-height:42px!important}
      .raspi-chat-send{height:42px!important;line-height:42px!important}
    }
    @media (max-height: 560px){
      .raspi-chat-panel{top:10px!important;bottom:10px!important;height:auto!important;max-height:none!important}
      .raspi-chat-messages{height:0!important;min-height:0!important;max-height:none!important}
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
