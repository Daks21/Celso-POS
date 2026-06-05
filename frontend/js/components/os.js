// frontend/js/components/os.js
//
// Bootstrap for the floating "Os" entry point on every app page.
//
// Mounts a small FAB that toggles the OsWidget panel. The FAB only
// appears if the user has opted in via Account Settings (osEnabled).
// On ai.html (the Full View), the FAB is suppressed because that
// page IS the chat surface — no point opening a panel on top.

(function () {

  function getPrefsKey() {
    var user = JSON.parse(localStorage.getItem('currentUser') || '{}');
    return 'prefs_' + (user.id || 'guest');
  }

  function isOsEnabled() {
    try {
      var prefs = JSON.parse(
        localStorage.getItem(getPrefsKey()) || '{}'
      );
      return prefs.osEnabled === true;
    } catch (_) { return false; }
  }

  function onAiFullView() {
    return window.location.pathname.indexOf('ai.html') !== -1;
  }

  // ── Lazy bundle loader ──────────────────────────────────────────
  // The chat client + docked widget (~23 KB) are NOT on the page at load.
  // They're fetched on demand — on first FAB click, or to restore a panel
  // left open across navigation — so they stay off initial load for the
  // majority of users who never open Os. Idempotent (the promise is shared).
  // loadScript / assetVersion are the shared helpers from core/utils.js
  // (loaded before this runs at click / DOMContentLoaded time).

  var _osLoad = null;
  function ensureOsWidget() {
    if (window.OsWidget) return Promise.resolve(window.OsWidget);
    if (_osLoad) return _osLoad;
    // Shared helpers live in core/utils.js. Resolve them off window explicitly
    // (not bare globals) and bail gracefully if utils.js somehow didn't load —
    // the FAB just won't open rather than throwing a ReferenceError.
    var loadScript = window.loadScript;
    if (!loadScript) return Promise.reject(new Error('loadScript unavailable'));
    var ver  = window.assetVersion ? window.assetVersion() : '';
    // os.widget depends on os.client; load the client first unless it's
    // already present (ai.html keeps os.client.js eager).
    var step = window.OsClient
      ? Promise.resolve()
      : loadScript('../js/components/os.client.js' + ver);
    _osLoad = step
      .then(function () { return loadScript('../js/components/os.widget.js' + ver); })
      .then(function () { return window.OsWidget; })
      .catch(function (e) { _osLoad = null; throw e; });
    return _osLoad;
  }

  // Restore a panel the user left open before navigating. os.widget's own
  // DOMContentLoaded restore can't fire (it's loaded late), so replicate it:
  // yield a tick to any onboarding overlay first, then reopen.
  function maybeRestorePanel() {
    try { if (sessionStorage.getItem('osPanelOpen') !== '1') return; } catch (_) { return; }
    ensureOsWidget().then(function (w) {
      setTimeout(function () {
        if (document.querySelector('.onb-welcome-modal') ||
            document.querySelector('.onb-tour-overlay')) return;
        if (w && typeof w.open === 'function' && !w.isOpen()) w.open();
      }, 0);
    }).catch(function () {});
  }

  // ── FAB ─────────────────────────────────────────────────────────

  function mountFab() {
    if (document.getElementById('os-float-btn')) return;

    var btn       = document.createElement('button');
    btn.id        = 'os-float-btn';
    btn.type      = 'button';
    btn.title     = 'Ask Os';
    btn.setAttribute('aria-label', 'Open Os AI');
    btn.innerHTML = 'Os';

    btn.addEventListener('click', function () {
      ensureOsWidget().then(function (w) {
        if (w && typeof w.toggle === 'function') w.toggle();
      });
    });

    document.body.appendChild(btn);
  }

  function unmountFab() {
    var btn = document.getElementById('os-float-btn');
    if (btn && btn.parentNode) btn.parentNode.removeChild(btn);
  }

  // ── Init ───────────────────────────────────────────────────────

  // The plan must include AI (Pro). Fails open if the helper isn't loaded yet —
  // the API still enforces, so a stray FAB would just surface a 402 in the panel.
  function entitledToAi() {
    try { return typeof hasEntitlement !== 'function' || hasEntitlement('ai'); }
    catch (_) { return true; }
  }

  function init() {
    if (onAiFullView()) {
      // Full View page IS the chat — don't show a FAB on top of itself.
      unmountFab();
      return;
    }

    if (isOsEnabled() && entitledToAi()) {
      mountFab();
      maybeRestorePanel();
    } else {
      unmountFab();
    }
  }

  // Public surface kept for back-compat with account.js (toggling
  // the osEnabled preference live mounts/unmounts the FAB).
  window.OsFloat = { mount: mountFab, unmount: unmountFab };

  document.addEventListener('DOMContentLoaded', init);

})();
