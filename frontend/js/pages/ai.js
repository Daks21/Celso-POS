// frontend/js/pages/ai.js
(function () {

  // ── Onboarding steps (static — no AI calls, no tokens) ───────
  var ONBOARDING_STEPS = {
    admin: [
      {
        title:   'Welcome to Celso POS!',
        message: "Hi! I'm Os, your AI business advisor. I can help " +
                 "you understand your sales, inventory, and cashflow. " +
                 "Let me show you around.",
        action:  'Next →'
      },
      {
        title:   'Step 1 — Set Up Your Products',
        message: 'Head to the Products page to add everything you sell. ' +
                 'Then use Inventory to restock — I\'ll track costs automatically.',
        action:  'Next →'
      },
      {
        title:   'Step 2 — Watch Your Dashboard',
        message: 'Your Dashboard shows today\'s revenue, recent sales, and ' +
                 'low stock alerts. I\'ll add a daily brief card there once ' +
                 'you have some data.',
        action:  'Next →'
      },
      {
        title:   'Step 3 — Ask Me Anything',
        message: 'Click Os from the sidebar anytime. Try asking: ' +
                 '"Magkano pa ang utang ko?" or "Ano best seller natin?"',
        action:  'Got it — start using Celso POS'
      }
    ],
    cashier: [
      {
        title:   'Welcome to Celso POS!',
        message: "Hi! I'm Os. I can answer questions about the store. " +
                 "Let me show you the basics.",
        action:  'Next →'
      },
      {
        title:   'Step 1 — Making a Sale',
        message: 'Go to New Order in the sidebar. Add items to the cart, ' +
                 'enter the payment amount, and tap Checkout.',
        action:  'Next →'
      },
      {
        title:   'Step 2 — View Past Sales',
        message: 'Check History to see all past receipts. Ask me anything ' +
                 'about today\'s sales anytime.',
        action:  'Got it!'
      }
    ]
  };

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

  function getUserRole() {
    try {
      var user = JSON.parse(localStorage.getItem('currentUser') || '{}');
      return (user.role || 'cashier').toLowerCase();
    } catch (_) { return 'cashier'; }
  }

  function scrollToBottom() {
    if (messagesEl) messagesEl.scrollTop = messagesEl.scrollHeight;
  }

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

  // ── Onboarding ────────────────────────────────────────────────

  function showOnboardingStep(index) {
    hideSuggestions();

    var existing = document.getElementById('os-onboarding-card');
    if (existing) existing.parentNode.removeChild(existing);

    var role  = getUserRole();
    var steps = ONBOARDING_STEPS[role] || ONBOARDING_STEPS.cashier;

    if (index >= steps.length) {
      localStorage.setItem('osOnboardingDone', 'true');
      return;
    }

    var step    = steps[index];
    var isFirst = index === 0;
    var isLast  = index === steps.length - 1;

    var card = document.createElement('div');
    card.id        = 'os-onboarding-card';
    card.className = 'os-onboarding-card';

    var titleEl = document.createElement('p');
    titleEl.className   = 'os-onboarding-title';
    titleEl.textContent = step.title;

    var msgEl = document.createElement('p');
    msgEl.className   = 'os-onboarding-message';
    msgEl.textContent = step.message;

    var actionsEl = document.createElement('div');
    actionsEl.className = 'os-onboarding-actions';

    if (!isLast) {
      var skipBtn = document.createElement('button');
      skipBtn.className   = 'os-onboarding-skip';
      skipBtn.textContent = 'Skip tour';
      skipBtn.addEventListener('click', function () {
        localStorage.setItem('osOnboardingDone', 'true');
        var c = document.getElementById('os-onboarding-card');
        if (c) c.parentNode.removeChild(c);
      });
      actionsEl.appendChild(skipBtn);
    }

    if (!isFirst) {
      var backBtn = document.createElement('button');
      backBtn.className   = 'os-onboarding-btn os-onboarding-btn--back';
      backBtn.textContent = '← Back';
      backBtn.addEventListener('click', function () { showOnboardingStep(index - 1); });
      actionsEl.appendChild(backBtn);
    }

    var nextBtn = document.createElement('button');
    nextBtn.className   = 'os-onboarding-btn os-onboarding-btn--primary';
    nextBtn.textContent = step.action;
    nextBtn.addEventListener('click', function () {
      if (isLast) {
        localStorage.setItem('osOnboardingDone', 'true');
        var c = document.getElementById('os-onboarding-card');
        if (c) c.parentNode.removeChild(c);
      } else {
        showOnboardingStep(index + 1);
      }
    });
    actionsEl.appendChild(nextBtn);

    card.appendChild(titleEl);
    card.appendChild(msgEl);
    card.appendChild(actionsEl);
    messagesEl.appendChild(card);
    scrollToBottom();
  }

  // ── Send message (streaming) ──────────────────────────────────

  async function sendMessage() {
    var message = inputEl.value.trim();
    if (!message || isStreaming) return;

    // Tour re-trigger
    var lower = message.toLowerCase();
    if (lower.includes('show me around') || lower.includes('take the tour')) {
      inputEl.value        = '';
      inputEl.style.height = 'auto';
      addMessage('user', message);
      showOnboardingStep(0);
      return;
    }

    var token = localStorage.getItem('token');
    if (!token) return;

    hideSuggestions();
    addMessage('user', message);
    inputEl.value        = '';
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

    // Fire onboarding on first Os enable
    if (!localStorage.getItem('osOnboardingDone')) {
      setTimeout(function () { showOnboardingStep(0); }, 600);
    }
  }

  document.addEventListener('DOMContentLoaded', init);

})();
