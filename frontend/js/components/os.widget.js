// frontend/js/components/os.widget.js
//
// Os AI floating chat panel — Messenger-style.
//   Desktop / tablet (≥769px): bottom-right docked panel, no backdrop.
//   Mobile (≤768px): full-screen bottom sheet with backdrop + scroll lock.
//
// Lazy-mounts on first open, then stays in the DOM for fast toggling.
// Consumes window.OsClient for all chat I/O (history + streaming).
//
// Public API on window.OsWidget:
//   open()    close()    toggle()    isOpen()
//
// Persistence:
//   sessionStorage.osPanelOpen  — restored on every page load so the
//                                 conversation surface follows the user.
//
// IMPORTANT: assistant text is always inserted via textContent — never
// innerHTML — same security model as the existing chat page.

(function () {

  var MOBILE_MAX_WIDTH   = 768;
  var STATE_KEY          = 'osPanelOpen';
  // Bilingual mix on purpose — signals to a first-time user that both
  // languages are welcome. Order alternates EN / TL so neither feels primary.
  var SUGGESTIONS = [
    { label: "How's business today?",   q: 'How is my business doing today?' },
    { label: 'Kailangan i-restock?',    q: 'Ano ang kailangan ko i-restock?' },
    { label: 'Best sellers?',           q: 'What are my best sellers this month?' },
    { label: 'Magkano utang ko?',       q: 'Magkano pa ang utang ko?' },
    { label: 'Busiest day?',            q: 'What day of the week is busiest?' },
    { label: 'Safe mag-kuha?',          q: 'Safe ba mag-kuha ngayon?' },
  ];

  var _root              = null;   // .os-widget-panel
  var _backdrop          = null;   // .os-widget-backdrop (mobile only)
  var _messagesEl        = null;
  var _suggestionsEl     = null;
  var _inputEl           = null;
  var _sendBtn           = null;
  var _emptyStateEl      = null;
  var _langPillEl        = null;   // .os-widget-langpill (segmented)
  var _isMounted         = false;
  var _isOpen            = false;
  var _previousFocus     = null;
  var _onKeydownBound    = null;
  var _currentLang       = loadLang();    // 'auto' | 'en' | 'tl'

  // ── Language preference (per-user, localStorage) ───────────────

  function getPrefsKey() {
    try {
      var user = JSON.parse(localStorage.getItem('currentUser') || '{}');
      return 'prefs_' + (user.id || 'guest');
    } catch (_) { return 'prefs_guest'; }
  }
  function loadLang() {
    try {
      var prefs = JSON.parse(localStorage.getItem(getPrefsKey()) || '{}');
      var v = prefs.osLang;
      return (v === 'en' || v === 'tl') ? v : 'auto';
    } catch (_) { return 'auto'; }
  }
  function saveLang(v) {
    try {
      var key   = getPrefsKey();
      var prefs = JSON.parse(localStorage.getItem(key) || '{}');
      prefs.osLang = v;
      localStorage.setItem(key, JSON.stringify(prefs));
    } catch (_) {}
  }

  // ── Utility ─────────────────────────────────────────────────────

  function isMobile() {
    return window.innerWidth <= MOBILE_MAX_WIDTH;
  }

  function isOsEnabled() {
    try {
      var user  = JSON.parse(localStorage.getItem('currentUser') || '{}');
      var key   = 'prefs_' + (user.id || 'guest');
      var prefs = JSON.parse(localStorage.getItem(key) || '{}');
      return prefs.osEnabled === true;
    } catch (_) { return false; }
  }

  function getAccountPath() {
    // Widget mounts only on /pages/*.html files
    return 'account.html';
  }

  function getAiFullPath() {
    return 'ai.html';
  }

  function scrollToBottom() {
    if (_messagesEl) _messagesEl.scrollTop = _messagesEl.scrollHeight;
  }

  // ── DOM construction (lazy) ────────────────────────────────────

  function buildPanel() {
    if (_isMounted) return;

    // Mobile backdrop (rendered always — CSS hides it on desktop)
    _backdrop = document.createElement('div');
    _backdrop.className = 'os-widget-backdrop';
    _backdrop.setAttribute('aria-hidden', 'true');
    _backdrop.addEventListener('click', close);
    document.body.appendChild(_backdrop);

    _root = document.createElement('div');
    _root.className = 'os-widget-panel';
    _root.setAttribute('role',           'dialog');
    _root.setAttribute('aria-modal',     isMobile() ? 'true' : 'false');
    _root.setAttribute('aria-labelledby','os-widget-name');
    _root.setAttribute('aria-hidden',    'true');

    // Drag handle (mobile only — hidden via CSS on desktop)
    var handle = document.createElement('div');
    handle.className = 'os-widget-handle';
    handle.setAttribute('aria-hidden', 'true');
    _root.appendChild(handle);

    // Header
    var header = document.createElement('div');
    header.className = 'os-widget-header';

    var avatar       = document.createElement('div');
    avatar.className = 'os-widget-avatar';
    avatar.textContent = 'Os';
    header.appendChild(avatar);

    var title         = document.createElement('div');
    title.className   = 'os-widget-title';
    title.innerHTML   =
      '<div class="os-widget-title-row">' +
        '<span class="os-widget-name" id="os-widget-name">Os AI</span>' +
        '<span class="os-widget-beta">BETA</span>' +
      '</div>' +
      '<div class="os-widget-status">Online · Powered by Groq</div>';
    header.appendChild(title);

    var actions       = document.createElement('div');
    actions.className = 'os-widget-header-actions';

    var fullViewBtn   = document.createElement('a');
    fullViewBtn.className = 'os-widget-icon-btn';
    fullViewBtn.setAttribute('title',      'Open in full view');
    fullViewBtn.setAttribute('aria-label', 'Open in full view');
    fullViewBtn.href = getAiFullPath();
    fullViewBtn.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
        '<polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/>' +
        '<line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/>' +
      '</svg>';
    actions.appendChild(fullViewBtn);

    var clearBtn       = document.createElement('button');
    clearBtn.type      = 'button';
    clearBtn.className = 'os-widget-icon-btn';
    clearBtn.setAttribute('title',      'Clear conversation');
    clearBtn.setAttribute('aria-label', 'Clear conversation');
    clearBtn.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
        '<path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>' +
        '<path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>' +
      '</svg>';
    clearBtn.addEventListener('click', onClearClick);
    actions.appendChild(clearBtn);

    var closeBtn       = document.createElement('button');
    closeBtn.type      = 'button';
    closeBtn.className = 'os-widget-icon-btn';
    closeBtn.setAttribute('title',      'Close Os');
    closeBtn.setAttribute('aria-label', 'Close Os');
    closeBtn.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
        '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>' +
      '</svg>';
    closeBtn.addEventListener('click', close);
    actions.appendChild(closeBtn);

    header.appendChild(actions);
    _root.appendChild(header);

    // Language pill strip — sits between header and messages.
    // Controls the LLM's REPLY language (Auto = mirror user).
    var langBar       = document.createElement('div');
    langBar.className = 'os-widget-langbar';

    var langLabel       = document.createElement('span');
    langLabel.className = 'os-widget-langbar-label';
    langLabel.textContent = 'Reply in:';
    langBar.appendChild(langLabel);

    _langPillEl = document.createElement('div');
    _langPillEl.className = 'os-widget-langpill';
    _langPillEl.setAttribute('role', 'group');
    _langPillEl.setAttribute('aria-label', 'Reply language');
    [
      { v: 'auto', label: 'Auto', title: 'Match your language'   },
      { v: 'en',   label: 'EN',   title: 'Reply in English'      },
      { v: 'tl',   label: 'TL',   title: 'Reply in Tagalog/Taglish' },
    ].forEach(function (o) {
      var btn       = document.createElement('button');
      btn.type      = 'button';
      btn.className = 'os-widget-langpill-btn';
      btn.setAttribute('data-lang', o.v);
      btn.setAttribute('title', o.title);
      btn.textContent = o.label;
      btn.addEventListener('click', function () {
        _currentLang = o.v;
        saveLang(o.v);
        updateLangPillState();
      });
      _langPillEl.appendChild(btn);
    });
    langBar.appendChild(_langPillEl);
    _root.appendChild(langBar);

    // Messages
    _messagesEl = document.createElement('div');
    _messagesEl.className = 'os-widget-messages';
    _messagesEl.setAttribute('role',      'log');
    _messagesEl.setAttribute('aria-live', 'polite');
    _root.appendChild(_messagesEl);

    // Suggestions
    _suggestionsEl = document.createElement('div');
    _suggestionsEl.className = 'os-widget-suggestions';
    SUGGESTIONS.forEach(function (s) {
      var chip       = document.createElement('button');
      chip.type      = 'button';
      chip.className = 'os-widget-chip';
      chip.textContent = s.label;
      chip.setAttribute('data-q', s.q);
      chip.addEventListener('click', function () {
        if (OsClient.isStreaming()) return;
        _inputEl.value = s.q;
        send();
      });
      _suggestionsEl.appendChild(chip);
    });
    _root.appendChild(_suggestionsEl);

    // Input
    var inputArea       = document.createElement('div');
    inputArea.className = 'os-widget-input-area';

    _inputEl             = document.createElement('textarea');
    _inputEl.className   = 'os-widget-input';
    _inputEl.placeholder = 'Ask Os anything about your store…';
    _inputEl.rows        = 1;
    _inputEl.setAttribute('aria-label', 'Message Os');
    _inputEl.addEventListener('keydown', onInputKeydown);
    _inputEl.addEventListener('input', autoGrowInput);
    inputArea.appendChild(_inputEl);

    _sendBtn          = document.createElement('button');
    _sendBtn.type     = 'button';
    _sendBtn.className = 'os-widget-send';
    _sendBtn.setAttribute('aria-label', 'Send');
    _sendBtn.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
        '<line x1="22" y1="2" x2="11" y2="13"/>' +
        '<polygon points="22 2 15 22 11 13 2 9 22 2"/>' +
      '</svg>';
    _sendBtn.addEventListener('click', send);
    inputArea.appendChild(_sendBtn);

    _root.appendChild(inputArea);

    // Footer
    var footer       = document.createElement('div');
    footer.className = 'os-widget-footer';
    footer.innerHTML =
      '<span>Os may not be perfect. Verify before deciding.</span>' +
      '<span>llama-3.3-70b</span>';
    _root.appendChild(footer);

    document.body.appendChild(_root);

    _isMounted = true;
    updateLangPillState();
    renderHistory();
  }

  // Reflect _currentLang on the segmented pill buttons.
  function updateLangPillState() {
    if (!_langPillEl) return;
    var btns = _langPillEl.querySelectorAll('.os-widget-langpill-btn');
    btns.forEach(function (b) {
      var on = b.getAttribute('data-lang') === _currentLang;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }

  // ── Rendering ──────────────────────────────────────────────────

  function showEmptyState() {
    if (_emptyStateEl) return;
    _emptyStateEl = document.createElement('div');
    _emptyStateEl.className = 'os-widget-empty';
    _emptyStateEl.innerHTML =
      '<div class="os-widget-empty-logo">Os</div>' +
      '<h3 class="os-widget-empty-title">Hi! I\'m Os. Kumusta!</h3>' +
      '<p class="os-widget-empty-body">' +
      'Ask me about your sales, inventory, utang, or anything ' +
      'about your store — in English, Tagalog, or Taglish. ' +
      'Mag-tanong ka lang kung anong gusto mong malaman.' +
      '</p>';
    _messagesEl.appendChild(_emptyStateEl);
  }

  function hideEmptyState() {
    if (_emptyStateEl && _emptyStateEl.parentNode) {
      _emptyStateEl.parentNode.removeChild(_emptyStateEl);
    }
    _emptyStateEl = null;
  }

  function showDisabledState() {
    while (_messagesEl.firstChild) _messagesEl.removeChild(_messagesEl.firstChild);
    var card = document.createElement('div');
    card.className = 'os-widget-empty';
    card.innerHTML =
      '<div class="os-widget-empty-logo">Os</div>' +
      '<h3 class="os-widget-empty-title">Os is disabled</h3>' +
      '<p class="os-widget-empty-body">Enable Os in Account Settings ' +
      'to start asking questions about your store.</p>' +
      '<a class="os-widget-disabled-cta" href="' + getAccountPath() + '">' +
        'Go to Account Settings' +
      '</a>';
    _messagesEl.appendChild(card);
    if (_suggestionsEl) _suggestionsEl.style.display = 'none';
    if (_inputEl)       _inputEl.disabled = true;
    if (_sendBtn)       _sendBtn.disabled = true;
  }

  function addBubble(role, text, isStreaming) {
    hideEmptyState();
    var b = document.createElement('div');
    b.className = 'os-widget-message os-widget-message--' + role;
    if (isStreaming) b.classList.add('is-streaming');
    b.textContent = text;
    _messagesEl.appendChild(b);
    scrollToBottom();
    return b;
  }

  function renderHistory() {
    while (_messagesEl.firstChild) _messagesEl.removeChild(_messagesEl.firstChild);
    _emptyStateEl = null;

    if (!isOsEnabled()) { showDisabledState(); return; }

    var hist = OsClient.getHistory();
    if (!hist.length) {
      showEmptyState();
      if (_suggestionsEl) _suggestionsEl.style.display = '';
      return;
    }

    hist.forEach(function (m) { addBubble(m.role, m.content, false); });
    if (_suggestionsEl) _suggestionsEl.style.display = 'none';
  }

  // ── Input behavior ─────────────────────────────────────────────

  function autoGrowInput() {
    _inputEl.style.height = 'auto';
    _inputEl.style.height = Math.min(_inputEl.scrollHeight, 100) + 'px';
  }

  function onInputKeydown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  function setBusy(busy) {
    _inputEl.disabled = busy;
    _sendBtn.disabled = busy;
  }

  function send() {
    var text = _inputEl.value.trim();
    if (!text || OsClient.isStreaming()) return;

    if (_suggestionsEl) _suggestionsEl.style.display = 'none';
    addBubble('user', text);
    _inputEl.value        = '';
    _inputEl.style.height = 'auto';
    setBusy(true);

    var streamBubble = addBubble('assistant', '', true);

    OsClient.sendMessage(text, {
      onChunk: function (delta) {
        streamBubble.textContent += delta;
        scrollToBottom();
      },
      onDone: function () {
        streamBubble.classList.remove('is-streaming');
        setBusy(false);
        if (_isOpen) _inputEl.focus();
      },
      onError: function (msg) {
        streamBubble.textContent = msg;
        streamBubble.classList.remove('is-streaming');
        setBusy(false);
      },
    }, { lang: _currentLang });
  }

  function onClearClick() {
    if (OsClient.isStreaming()) OsClient.cancel();
    OsClient.clearHistory();
    renderHistory();
    setBusy(false);
    if (_isOpen) _inputEl.focus();
  }

  // ── Open / close ───────────────────────────────────────────────

  function open() {
    if (_isOpen) return;
    buildPanel();

    // Refresh aria-modal in case the user resized between open/close
    _root.setAttribute('aria-modal', isMobile() ? 'true' : 'false');
    _root.setAttribute('aria-hidden', 'false');

    _previousFocus = document.activeElement;

    requestAnimationFrame(function () {
      _root.classList.add('is-open');
      _backdrop.classList.add('is-open');
      document.body.classList.add('os-widget-open');
      _isOpen = true;
      try { sessionStorage.setItem(STATE_KEY, '1'); } catch (_) {}

      // Refresh content in case osEnabled changed since last open
      renderHistory();

      if (_inputEl && !_inputEl.disabled) {
        setTimeout(function () { _inputEl.focus(); }, 200);
      }
    });

    _onKeydownBound = onGlobalKeydown;
    document.addEventListener('keydown', _onKeydownBound);
  }

  function close() {
    if (!_isOpen) return;

    // Cancel any in-flight stream so we don't keep tokens flowing
    if (OsClient.isStreaming()) OsClient.cancel();

    if (_root) {
      _root.classList.remove('is-open');
      _root.setAttribute('aria-hidden', 'true');
    }
    if (_backdrop) _backdrop.classList.remove('is-open');
    document.body.classList.remove('os-widget-open');
    _isOpen = false;
    try { sessionStorage.removeItem(STATE_KEY); } catch (_) {}

    if (_onKeydownBound) {
      document.removeEventListener('keydown', _onKeydownBound);
      _onKeydownBound = null;
    }

    if (_previousFocus && _previousFocus.focus) {
      try { _previousFocus.focus(); } catch (_) {}
    }
    _previousFocus = null;
  }

  function toggle() { _isOpen ? close() : open(); }

  // ── Keyboard handling ──────────────────────────────────────────

  function onGlobalKeydown(e) {
    if (!_isOpen) return;
    if (e.key === 'Escape') { close(); return; }

    // Simple focus trap on mobile (where panel is modal)
    if (e.key === 'Tab' && isMobile()) {
      var focusable = _root.querySelectorAll(
        'button, a, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (!focusable.length) return;
      var first = focusable[0];
      var last  = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault(); last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault(); first.focus();
      }
    }
  }

  // ── Restore on page load ───────────────────────────────────────

  function restoreFromSession() {
    // On the Full View page (ai.html), don't auto-open a panel on top
    // of the full-page chat — that page IS the chat surface.
    if (window.location.pathname.indexOf('ai.html') !== -1) return;

    try {
      if (sessionStorage.getItem(STATE_KEY) !== '1') return;
      if (!isOsEnabled()) return;
    } catch (_) { return; }

    // Defer one tick so any onboarding scripts that mount on
    // DOMContentLoaded (welcome modal, spotlight tour) have a chance
    // to inject their overlays first. If those layers are present,
    // skip the auto-restore — the user can reopen Os from the FAB
    // once onboarding finishes.
    setTimeout(function () {
      var hasWelcome = document.querySelector('.onb-welcome-modal');
      var hasTour    = document.querySelector('.onb-tour-overlay');
      if (hasWelcome || hasTour) return;
      open();
    }, 0);
  }

  // ── Public API ─────────────────────────────────────────────────

  window.OsWidget = {
    open:   open,
    close:  close,
    toggle: toggle,
    isOpen: function () { return _isOpen; },
  };

  document.addEventListener('DOMContentLoaded', restoreFromSession);

})();
