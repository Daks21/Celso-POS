// frontend/js/components/os.js
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

  function getAiPath() {
    var depth = window.location.pathname.split('/').length - 1;
    return (depth >= 3 ? '../../' : depth === 2 ? '../' : '') + 'pages/ai.html';
  }

  function init() {
    // Skip on ai.html itself — the page IS the chat interface
    if (window.location.pathname.includes('ai.html')) return;
    if (!isOsEnabled()) return; // Os disabled — render nothing

    var btn = document.createElement('button');
    btn.id        = 'os-float-btn';
    btn.title     = 'Ask Os';
    btn.innerHTML = 'Os';
    btn.addEventListener('click', function () {
      window.location.href = getAiPath();
    });
    document.body.appendChild(btn);
  }

  document.addEventListener('DOMContentLoaded', init);
})();
