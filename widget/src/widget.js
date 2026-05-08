(() => {
  const currentScript = document.currentScript;
  const siteId = currentScript?.dataset?.siteId || 'unknown_site';
  const apiUrl = currentScript?.dataset?.apiUrl || 'http://localhost:3000';
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
    .raspi-chat-message{margin:0 0 10px;padding:10px 12px;border-radius:14px;background:#fff}
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
    <div class="raspi-chat-header">Напишите нам</div>
    <div class="raspi-chat-messages" data-role="messages">
      <div class="raspi-chat-message">Здравствуйте! Чем можем помочь?</div>
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

  button.addEventListener('click', () => {
    panel.classList.toggle('open');
  });

  function addMessage(text) {
    const item = document.createElement('div');
    item.className = 'raspi-chat-message';
    item.textContent = text;
    messages.appendChild(item);
    messages.scrollTop = messages.scrollHeight;
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const message = input.value.trim();
    if (!message) return;
    input.value = '';
    addMessage(message);

    try {
      const response = await fetch(`${apiUrl}/api/widget/message`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ siteId, visitorId, message })
      });
      const result = await response.json();
      if (!result.ok) addMessage(`Ошибка: ${result.error || 'message rejected'}`);
    } catch (error) {
      addMessage('Сообщение не отправилось. Проверьте соединение.');
    }
  });
})();
