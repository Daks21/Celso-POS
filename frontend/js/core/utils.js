(function injectStyles() {
  if (document.getElementById('api-utils-css')) return;
  var s = document.createElement('style');
  s.id = 'api-utils-css';
  s.textContent =
    '.api-spinner{display:inline-block;width:18px;height:18px;border:2px solid rgba(90,158,111,0.25);border-top-color:var(--color-primary,#5a9e6f);border-radius:50%;animation:api-spin 0.7s linear infinite;vertical-align:middle;margin-right:8px}' +
    '@keyframes api-spin{to{transform:rotate(360deg)}}' +
    '.api-loading-row td{text-align:center;padding:40px;color:var(--color-text-muted,#6b7280);font-size:14px}' +
    '.api-loading-cell{display:flex;align-items:center;justify-content:center;padding:40px;color:var(--color-text-muted,#6b7280);font-size:14px}' +
    '#api-toast-container{position:fixed;bottom:24px;right:24px;z-index:9999;display:flex;flex-direction:column;gap:10px;pointer-events:none}' +
    '.api-toast{display:flex;align-items:center;gap:10px;padding:12px 16px;border-radius:8px;font-size:14px;font-family:"DM Sans",sans-serif;max-width:360px;box-shadow:0 4px 16px rgba(0,0,0,0.14);opacity:0;transform:translateY(12px);transition:opacity 0.25s ease,transform 0.25s ease;pointer-events:all;color:#fff}' +
    '.api-toast.is-visible{opacity:1;transform:translateY(0)}' +
    '.api-toast--error{background:#e53e3e}' +
    '.api-toast--success{background:#38a169}' +
    '.api-toast span{flex:1}' +
    '.api-toast-content{flex:1;display:flex;align-items:center;flex-wrap:wrap;gap:6px}' +
    '.api-toast-content span{flex:0 1 auto}' +
    '.api-toast-sep{color:rgba(255,255,255,0.6)}' +
    '.api-toast-action{background:none;border:none;padding:0;margin:0;color:#fff;font-weight:600;font-family:inherit;font-size:14px;cursor:pointer;text-decoration:underline;text-underline-offset:2px}' +
    '.api-toast-action:hover{opacity:0.85}' +
    '.api-toast-close{background:none;border:none;color:rgba(255,255,255,0.8);cursor:pointer;font-size:20px;padding:0 2px;line-height:1;flex-shrink:0}' +
    '.api-toast-close:hover{color:#fff}';
  document.head.appendChild(s);
})();

function showLoading(selector) {
  var el = document.querySelector(selector);
  if (!el) return;
  if (el.tagName === 'TBODY') {
    el.innerHTML =
      '<tr class="api-loading-row">' +
        '<td colspan="99"><span class="api-spinner"></span>Loading...</td>' +
      '</tr>';
  } else {
    el.innerHTML = '<div class="api-loading-cell"><span class="api-spinner"></span>Loading...</div>';
  }
}

function hideLoading(selector) {
  var el = document.querySelector(selector);
  if (!el) return;
  var node = el.querySelector('.api-loading-row, .api-loading-cell');
  if (node) node.remove();
}

function showApiError(message) {
  _showToast(message || 'Something went wrong.', 'error');
}

function showApiSuccess(message) {
  _showToast(message || 'Done.', 'success');
}

// Success toast with a single inline action link (e.g. "Add stock now ->").
// Non-blocking: it still auto-dismisses; the action fires onClick if tapped.
function showActionToast(message, actionLabel, onAction, type) {
  _showToast(message || 'Done.', type || 'success', { label: actionLabel, onClick: onAction });
}

function _showToast(message, type, action) {
  var container = document.getElementById('api-toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'api-toast-container';
    document.body.appendChild(container);
  }

  var toast = document.createElement('div');
  toast.className = 'api-toast api-toast--' + type;

  if (action && action.label) {
    var content = document.createElement('div');
    content.className = 'api-toast-content';

    var msgSpan = document.createElement('span');
    msgSpan.textContent = message;
    content.appendChild(msgSpan);

    var sep = document.createElement('span');
    sep.className = 'api-toast-sep';
    sep.setAttribute('aria-hidden', 'true');
    sep.textContent = '·';
    content.appendChild(sep);

    var actionBtn = document.createElement('button');
    actionBtn.type = 'button';
    actionBtn.className = 'api-toast-action';
    actionBtn.textContent = action.label;
    actionBtn.addEventListener('click', function () {
      _dismissToast(toast);
      if (typeof action.onClick === 'function') action.onClick();
    });
    content.appendChild(actionBtn);

    toast.appendChild(content);
    // No close (×) button: action toasts stay minimal and auto-dismiss.
  } else {
    var msgSpan = document.createElement('span');
    msgSpan.textContent = message;
    toast.appendChild(msgSpan);

    var closeBtn = document.createElement('button');
    closeBtn.className = 'api-toast-close';
    closeBtn.innerHTML = '&times;';
    closeBtn.addEventListener('click', function () { _dismissToast(toast); });
    toast.appendChild(closeBtn);
  }

  container.appendChild(toast);
  requestAnimationFrame(function () { toast.classList.add('is-visible'); });
  setTimeout(function () { _dismissToast(toast); }, 4500);
}

function _dismissToast(toast) {
  toast.classList.remove('is-visible');
  setTimeout(function () { if (toast.parentNode) toast.remove(); }, 300);
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
