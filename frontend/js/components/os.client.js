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
    var lang        = opts.lang || 'auto';

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
