// frontend/js/components/os.client.js
//
// Pure chat client — no DOM. Owns history + streaming + cancellation.
// Consumed by both the widget (os.widget.js) and the full-page view
// (pages/ai.js), so streaming logic exists in exactly one place.
//
// Public API on window.OsClient:
//   sendMessage(text, callbacks)   → starts a streamed reply
//   cancel()                       → aborts the active stream (if any)
//   getHistory() / clearHistory()  → conversation persistence
//   isStreaming()                  → boolean
//
// History is persisted to sessionStorage so closing the panel (or
// navigating between pages) keeps the conversation alive within
// the same browser tab session.

(function () {

  var STORAGE_KEY     = 'osHistory';
  var MAX_HISTORY     = 10;   // turns sent to server — matches prior cap
  var STREAM_ENDPOINT = '/ai/chat/stream';

  var _history     = loadHistory();
  var _controller  = null;    // AbortController for the in-flight request

  // ── Persistence ─────────────────────────────────────────────────

  function loadHistory() {
    try {
      var raw = sessionStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (_) { return []; }
  }

  function saveHistory() {
    try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(_history)); }
    catch (_) { /* sessionStorage full or unavailable — chat still works */ }
  }

  function getHistory()   { return _history.slice(); }
  function clearHistory() {
    _history = [];
    try { sessionStorage.removeItem(STORAGE_KEY); } catch (_) {}
  }

  // ── Language detection (Auto-mode heuristic) ────────────────────
  //
  // When the widget's pill is on "Auto", we detect Tagalog vs English
  // from the user's message and resolve to a concrete 'tl' / 'en'
  // before sending — so the backend always gets an informative directive.
  // Heuristic is intentionally simple: count common Tagalog stopwords
  // with word-boundary matching, plus a short-message safety net for
  // single-marker greetings like "po" or "kumusta".

  var TAGALOG_MARKERS = [
    // Particles / stopwords
    'mga','ng','ang','ay','din','rin','ba','pa','na','pero','kahit','dahil',
    'tapos','sige','para','lang','lamang','kasi','naman',
    // Pronouns & possessives
    'ako','ka','ko','mo','ikaw','siya','niya','natin','namin','tayo',
    'kami','kayo','sila','akin','iyo','kanya','niyo','ninyo',
    // Demonstratives / interrogatives (incl. common contractions)
    'yung','iyong','yan','iyan','ito','ano','anong','sino','sinong',
    'kanino','kailan','paano','paanong',
    // Polite particles & affirmatives
    'po','opo','oo','hindi','wala','walang','mayroon','meron',
    // Common verbs / nouns frequently used in casual queries
    'kumusta','gusto','kailangan','dapat','pwede','magkano','mahal','mura',
    'utang','kuha','bayad','tindahan','salamat',
  ];
  var _markerSet = (function () {
    var s = {};
    for (var i = 0; i < TAGALOG_MARKERS.length; i++) s[TAGALOG_MARKERS[i]] = 1;
    return s;
  })();

  function detectLang(text) {
    if (!text) return null;
    var tokens = (text.toLowerCase().match(/\b[\w'-]+\b/g)) || [];
    if (!tokens.length) return null;
    var hits = 0;
    for (var i = 0; i < tokens.length; i++) {
      if (_markerSet[tokens[i]]) hits++;
    }
    // Confident TL: 2+ hits, OR 1 hit in a short message (greetings, "po" alone)
    if (hits >= 2)                       return 'tl';
    if (hits >= 1 && tokens.length < 6)  return 'tl';
    // Confident EN: zero markers and the message is long enough to judge
    if (hits === 0 && tokens.length >= 3) return 'en';
    return null;   // not confident — let backend mirror
  }

  // ── Streaming ───────────────────────────────────────────────────

  function isStreaming() { return _controller !== null; }

  function cancel() {
    if (_controller) {
      try { _controller.abort(); } catch (_) {}
      _controller = null;
    }
  }

  // sendMessage(text, { onChunk, onDone, onError }, opts)
  //   opts.lang — 'en' | 'tl' | 'auto' (forwarded to backend so the
  //               language pill can lock the reply language)
  async function sendMessage(text, cb, opts) {
    cb   = cb   || {};
    opts = opts || {};
    var onChunk = cb.onChunk || function () {};
    var onDone  = cb.onDone  || function () {};
    var onError = cb.onError || function () {};

    if (!text || !text.trim()) { onError('Empty message.'); return; }
    if (isStreaming())         { onError('A reply is still streaming.'); return; }

    var token = localStorage.getItem('token');
    if (!token) { onError('Not authenticated.'); return; }

    // Send last MAX_HISTORY turns to keep token budget predictable.
    var safeHistory = _history.slice(-MAX_HISTORY);
    _controller     = new AbortController();
    var fullText    = '';
    // Resolve language: if caller asked for Auto, try the heuristic.
    // Fall back to 'auto' when detection isn't confident — backend's
    // mirror rule in the system prompt will still do the right thing.
    var lang        = opts.lang || 'auto';
    if (lang === 'auto') lang = detectLang(text) || 'auto';

    try {
      var response = await fetch(BASE_URL + STREAM_ENDPOINT, {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': 'Bearer ' + token,
        },
        body:   JSON.stringify({ message: text, history: safeHistory, lang: lang }),
        signal: _controller.signal,
      });

      if (!response.ok) {
        _controller = null;
        if (response.status === 429) {
          onError('Os is busy right now (rate limit). Try again in a few minutes.');
        } else if (response.status === 401) {
          onError('Session expired. Please log in again.');
        } else {
          onError('Os is unavailable right now. Please try again.');
        }
        return;
      }

      var reader  = response.body.getReader();
      var decoder = new TextDecoder();

      while (true) {
        var chunk = await reader.read();
        if (chunk.done) break;
        var decoded = decoder.decode(chunk.value, { stream: true });
        var lines   = decoded.split('\n').filter(function (l) {
          return l.indexOf('data: ') === 0;
        });
        for (var i = 0; i < lines.length; i++) {
          var raw = lines[i].slice(6).trim();
          if (raw === '[DONE]') continue;
          try {
            var parsed = JSON.parse(raw);
            if (parsed.text) {
              fullText += parsed.text;
              onChunk(parsed.text);
            }
            if (parsed.done) {
              _history = parsed.history || _history.concat([
                { role: 'user',      content: text },
                { role: 'assistant', content: fullText },
              ]);
              saveHistory();
              _controller = null;
              onDone(fullText, getHistory());
              return;
            }
            if (parsed.error) {
              _controller = null;
              onError('Os encountered an error. Please try again.');
              return;
            }
          } catch (_) { /* skip malformed SSE chunk */ }
        }
      }

      // Stream ended without an explicit {done:true} — treat as success
      // and update history locally so the next turn includes this reply.
      _history.push({ role: 'user',      content: text     });
      _history.push({ role: 'assistant', content: fullText });
      saveHistory();
      _controller = null;
      onDone(fullText, getHistory());

    } catch (err) {
      _controller = null;
      if (err && err.name === 'AbortError') {
        // Caller cancelled — not an error worth surfacing as a bubble.
        return;
      }
      onError('Connection lost. Please check your network and try again.');
    }
  }

  // ── Public surface ──────────────────────────────────────────────

  window.OsClient = {
    sendMessage:  sendMessage,
    cancel:       cancel,
    getHistory:   getHistory,
    clearHistory: clearHistory,
    isStreaming:  isStreaming,
  };

})();
