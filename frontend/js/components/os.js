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

  function mount() {
    if (window.location.pathname.includes('ai.html')) return;
    if (document.getElementById('os-float-btn')) return;
    var btn = document.createElement('button');
    btn.id        = 'os-float-btn';
    btn.title     = 'Ask Os';
    btn.innerHTML = 'Os';
    btn.addEventListener('click', function () {
      window.location.href = getAiPath();
    });
    document.body.appendChild(btn);
  }

  function unmount() {
    var btn = document.getElementById('os-float-btn');
    if (btn) btn.parentNode.removeChild(btn);
  }

  function init() {
    if (isOsEnabled()) mount();
  }

  window.OsFloat = { mount: mount, unmount: unmount };

  document.addEventListener('DOMContentLoaded', init);
})();
