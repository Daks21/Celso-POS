// frontend/js/pages/ai.js
(function () {

  var chatHistory = [];
  var isStreaming  = false;

  var messagesEl, inputEl, sendBtn, clearBtn, suggestionsEl;
  var disabledState, chatState;

  // ── Helpers ───────────────────────────────────────────────────

  function isOsEnabled() {
    try {
      var user  = JSON.parse(localStorage.getItem('currentUser') || '{}');
      var key   = 'prefs_' + (user.id || 'guest');
      var prefs = JSON.parse(localStorage.getItem(key) || '{}');
      return prefs.osEnabled === true;
    } catch (_) { return false; }
  }

  function scrollToBottom() {
    if (messagesEl) messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  // role: 'user' | 'assistant'
  // Always textContent — never innerHTML — for AI-generated text
  function addMessage(role, text, isStreamingBubble) {
    var bubble = document.createElement('div');
    bubble.className = 'os-message os-message--' + role;
    if (isStreamingBubble) bubble.classList.add('is-streaming');
    bubble.textContent = text;
    messagesEl.appendChild(bubble);
    scrollToBottom();
    return bubble;
  }

  function setInputEnabled(enabled) {
    inputEl.disabled = !enabled;
    sendBtn.disabled = !enabled;
    isStreaming = !enabled;
  }

  // ── Suggestions ───────────────────────────────────────────────

  function hideSuggestions() {
    if (suggestionsEl) suggestionsEl.style.display = 'none';
  }

  function initSuggestions() {
    if (!suggestionsEl) return;
    suggestionsEl.querySelectorAll('.os-chip').forEach(function (chip) {
      chip.addEventListener('click', function () {
        var q = chip.getAttribute('data-q');
        if (q) {
          inputEl.value = q;
          sendMessage();
        }
      });
    });
  }

  // ── Clear conversation ────────────────────────────────────────

  function clearConversation() {
    chatHistory = [];
    sessionStorage.removeItem('osHistory');
    while (messagesEl.firstChild) {
      messagesEl.removeChild(messagesEl.firstChild);
    }
    if (suggestionsEl) suggestionsEl.style.display = '';
  }

  // ── Send message (streaming) ──────────────────────────────────

  async function sendMessage() {
    var message = inputEl.value.trim();
    if (!message || isStreaming) return;

    var token = localStorage.getItem('token');
    if (!token) return;

    hideSuggestions();
    addMessage('user', message);
    inputEl.value      = '';
    inputEl.style.height = 'auto';
    setInputEnabled(false);

    // Keep last 10 turns to avoid token overflow
    var safeHistory  = chatHistory.slice(-10);
    var streamBubble = null;

    try {
      const response = await fetch(BASE_URL + '/ai/chat/stream', {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': 'Bearer ' + token,
        },
        body: JSON.stringify({ message: message, history: safeHistory }),
      });

      if (!response.ok) {
        addMessage('assistant', 'Os is unavailable right now. Please try again.');
        return;
      }

      const reader  = response.body.getReader();
      const decoder = new TextDecoder();
      streamBubble  = addMessage('assistant', '', true);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n').filter(l => l.startsWith('data: '));
        for (const line of lines) {
          const raw = line.slice(6).trim();
          if (raw === '[DONE]') continue;
          try {
            const parsed = JSON.parse(raw);
            if (parsed.text) {
              streamBubble.textContent += parsed.text;
              scrollToBottom();
            }
            if (parsed.done) {
              chatHistory = parsed.history;
              sessionStorage.setItem('osHistory', JSON.stringify(chatHistory));
              streamBubble.classList.remove('is-streaming');
            }
            if (parsed.error) {
              streamBubble.textContent = 'Os encountered an error. Please try again.';
              streamBubble.classList.remove('is-streaming');
            }
          } catch (_) {}
        }
      }

    } catch (err) {
      var errMsg = 'Connection lost. Please check your network and try again.';
      if (streamBubble) {
        streamBubble.textContent = errMsg;
        streamBubble.classList.remove('is-streaming');
      } else {
        addMessage('assistant', errMsg);
      }
    } finally {
      setInputEnabled(true);
      inputEl.focus();
    }
  }

  // ── Init ──────────────────────────────────────────────────────

  function init() {
    disabledState = document.getElementById('os-disabled-state');
    chatState     = document.getElementById('os-chat-state');
    messagesEl    = document.getElementById('os-messages');
    inputEl       = document.getElementById('os-input');
    sendBtn       = document.getElementById('os-send');
    clearBtn      = document.getElementById('os-clear');
    suggestionsEl = document.getElementById('os-suggestions');

    if (!disabledState || !chatState) return;

    if (!isOsEnabled()) {
      disabledState.style.display = '';
      chatState.style.display     = 'none';
      return;
    }

    disabledState.style.display = 'none';
    chatState.style.display     = '';

    // Restore conversation from this browser session
    try {
      var saved = sessionStorage.getItem('osHistory');
      if (saved) {
        chatHistory = JSON.parse(saved);
        chatHistory.forEach(function (msg) {
          addMessage(msg.role, msg.content, false);
        });
        if (chatHistory.length > 0) hideSuggestions();
      }
    } catch (_) { chatHistory = []; }

    initSuggestions();

    // Send button
    sendBtn.addEventListener('click', sendMessage);

    // Enter to send, Shift+Enter for newline
    inputEl.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });

    // Auto-grow textarea up to max-height set in CSS
    inputEl.addEventListener('input', function () {
      inputEl.style.height = 'auto';
      inputEl.style.height = Math.min(inputEl.scrollHeight, 120) + 'px';
    });

    // Clear button
    clearBtn.addEventListener('click', clearConversation);

    inputEl.focus();
  }

  document.addEventListener('DOMContentLoaded', init);

})();
