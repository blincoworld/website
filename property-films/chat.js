(() => {
  'use strict';

  const config = window.PROPERTY_FILMS_CONFIG || {};

  const apiUrl =
    config.chatApiUrl ||
    (config.apiUrl
      ? config.apiUrl.replace(/\/submit(?:\?.*)?$/, '/chat')
      : '');

  const launcher = document.querySelector('#property-chat-launcher');
  const panel = document.querySelector('#property-chat');
  const closeButton = document.querySelector('#property-chat-close');
  const messages = document.querySelector('#property-chat-messages');
  const form = document.querySelector('#property-chat-form');
  const input = document.querySelector('#property-chat-input');
  const sendButton = document.querySelector('#property-chat-send');

  if (
    !apiUrl ||
    !launcher ||
    !panel ||
    !closeButton ||
    !messages ||
    !form ||
    !input ||
    !sendButton
  ) {
    return;
  }

  const STORAGE_KEY = 'property-films-chat-history';
  const MAX_STORED_MESSAGES = 20;

  let history = [];
  let busy = false;
  let openedOnce = false;

  function loadHistory() {
    try {
      const stored = JSON.parse(sessionStorage.getItem(STORAGE_KEY));

      if (!Array.isArray(stored)) return [];

      return stored
        .filter(item =>
          item &&
          (item.role === 'user' || item.role === 'assistant') &&
          typeof item.content === 'string' &&
          item.content.trim()
        )
        .slice(-MAX_STORED_MESSAGES);
    } catch {
      return [];
    }
  }

  function saveHistory() {
    try {
      sessionStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(history.slice(-MAX_STORED_MESSAGES))
      );
    } catch {}
  }

  function restoreHistory() {
    const stored = loadHistory();

    if (!stored.length) return;

    history = stored;

    messages.innerHTML = '';

    for (const item of history) {
      addMessage(item.role, item.content);
    }
  }

  function track(name, data = {}) {
    if (typeof window.propertyFilmsEvent === 'function') {
      window.propertyFilmsEvent(name, data);
    }
  }

  function scrollToBottom() {
    requestAnimationFrame(() => {
      messages.scrollTop = messages.scrollHeight;
    });
  }

  function openChat() {
    panel.hidden = false;
    launcher.setAttribute('aria-expanded', 'true');

    requestAnimationFrame(() => {
      panel.classList.add('is-open');
      input.focus();
      scrollToBottom();
    });

    if (!openedOnce) {
      openedOnce = true;
      track('chat_opened');
    }
  }

  function closeChat() {
    panel.classList.remove('is-open');
    launcher.setAttribute('aria-expanded', 'false');

    window.setTimeout(() => {
      panel.hidden = true;
    }, 180);

    launcher.focus();
  }

  function addMessage(role, text) {
    const row = document.createElement('div');
    row.className = `property-chat-message property-chat-message-${role}`;

    const bubble = document.createElement('div');
    bubble.className = 'property-chat-bubble';
    bubble.textContent = text;

    row.appendChild(bubble);
    messages.appendChild(row);
    scrollToBottom();

    return row;
  }

  function addTyping() {
    const row = document.createElement('div');
    row.className =
      'property-chat-message property-chat-message-assistant property-chat-typing';

    row.setAttribute('aria-label', 'Property Films assistant is typing');

    row.innerHTML = `
      <div class="property-chat-bubble">
        <span></span><span></span><span></span>
      </div>
    `;

    messages.appendChild(row);
    scrollToBottom();

    return row;
  }

  function setBusy(value) {
    busy = value;
    input.disabled = value;
    sendButton.disabled = value;

    if (!value) {
      input.focus();
    }
  }

  async function sendMessage(message) {
    if (!message || busy) return;

    const previousHistory = history.slice();

    addMessage('user', message);

    history.push({
      role: 'user',
      content: message
    });

    saveHistory();

    track('chat_message_sent');

    input.value = '';
    input.style.height = 'auto';

    setBusy(true);
    const typing = addTyping();

    try {
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message,
          history: previousHistory
        })
      });

      let data = {};

      try {
        data = await response.json();
      } catch (_) {}

      typing.remove();

      if (!response.ok || !data.reply) {
        throw new Error(data.error || 'Chat request failed');
      }

      addMessage('assistant', data.reply);

      history.push({
        role: 'assistant',
        content: data.reply
      });

      saveHistory();

      track('chat_reply_received');

    } catch (error) {
      typing.remove();

      addMessage(
        'assistant',
        'Sorry, I’m having trouble answering right now. You can still use Tell Me More below and we’ll get back to you.'
      );

      track('chat_error');
      console.error('Property Films chat error:', error);

    } finally {
      setBusy(false);
    }
  }

  restoreHistory();

  launcher.addEventListener('click', () => {
    if (panel.hidden) {
      openChat();
    } else {
      closeChat();
    }
  });

  closeButton.addEventListener('click', closeChat);

  form.addEventListener('submit', event => {
    event.preventDefault();

    const message = input.value.trim();

    if (!message) return;

    sendMessage(message);
  });

  input.addEventListener('keydown', event => {
    if (
      event.key === 'Enter' &&
      !event.shiftKey &&
      !event.isComposing
    ) {
      event.preventDefault();
      form.requestSubmit();
    }
  });

  input.addEventListener('input', () => {
    input.style.height = 'auto';
    input.style.height =
      Math.min(input.scrollHeight, 120) + 'px';
  });

  document.addEventListener('keydown', event => {
    if (
      event.key === 'Escape' &&
      !panel.hidden
    ) {
      closeChat();
    }
  });

})();
