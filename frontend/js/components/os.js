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
      if (window.OsWidget && typeof OsWidget.toggle === 'function') {
        OsWidget.toggle();
      }
    });

    document.body.appendChild(btn);
  }

  function unmountFab() {
    var btn = document.getElementById('os-float-btn');
    if (btn && btn.parentNode) btn.parentNode.removeChild(btn);
  }

  // ── Init ───────────────────────────────────────────────────────

  function init() {
    if (onAiFullView()) {
      // Full View page IS the chat — don't show a FAB on top of itself.
      unmountFab();
      return;
    }

    if (isOsEnabled()) {
      mountFab();
    } else {
      unmountFab();
    }
  }

  // Public surface kept for back-compat with account.js (toggling
  // the osEnabled preference live mounts/unmounts the FAB).
  window.OsFloat = { mount: mountFab, unmount: unmountFab };

  document.addEventListener('DOMContentLoaded', init);

})();
