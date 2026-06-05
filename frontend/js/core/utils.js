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
  // Suppress the red toast cascade when a feature-gate overlay is up: a locked
  // page's in-flight data calls all 402, and the lock card already explains why.
  if (typeof LockedOverlay !== 'undefined' && LockedOverlay.isActive()) return;
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

// Lazily fetch Chart.js (~205 KB) only when a chart is actually about to be
// drawn (dashboard + analytics). Loading it on demand — instead of a <head>
// <script> — keeps it off the critical path AND off the DOMContentLoaded
// gate, so the page is interactive immediately on low-end / slow connections;
// charts simply pop in once the lib arrives. Returns a Promise<Chart>.
// Idempotent: the script is injected at most once and the promise is shared.
var _chartLoad = null;
function ensureChart() {
  if (typeof Chart !== 'undefined') return Promise.resolve(Chart);
  if (_chartLoad) return _chartLoad;
  _chartLoad = new Promise(function (resolve, reject) {
    // Reuse the ?v= cache stamp from an already-loaded vendor script (e.g.
    // icons.js) so this stays in lockstep with scripts/bust-cache.js.
    var ref = document.querySelector('script[src*="assets/vendor/"]');
    var ver = ref && ref.getAttribute('src').match(/\?v=[^"&]*/);
    var s = document.createElement('script');
    s.src = '../assets/vendor/chart.umd.min.js' + (ver ? ver[0] : '');
    s.onload = function () {
      if (typeof Chart !== 'undefined') { resolve(Chart); return; }
      // Loaded but the global never appeared (truncated/blocked file). Reset so
      // a later call can retry — and drop this node so the retry doesn't stack a
      // second identical <script>.
      _chartLoad = null;
      s.remove();
      reject(new Error('Chart.js loaded but Chart is undefined'));
    };
    s.onerror = function () {
      _chartLoad = null;
      s.remove();
      reject(new Error('Chart.js failed to load'));
    };
    document.head.appendChild(s);
  });
  return _chartLoad;
}
window.ensureChart = ensureChart;

// Lite Mode stand-in for a chart: hide the <canvas> and drop a compact
// 2-column table in its place, built from the SAME data the chart would use.
// Lets low-end devices skip Chart.js entirely while still showing the numbers.
// rows: [{ label, value }]; opts: { headers:[colA,colB], format:fn(value) }.
function renderLiteChartTable(canvas, rows, opts) {
  if (!canvas) return;
  opts = opts || {};
  canvas.style.display = 'none';
  // Replace any prior table for this canvas (e.g. on a date-range re-render).
  var sib = canvas.nextElementSibling;
  if (sib && sib.classList && sib.classList.contains('lite-chart-table')) sib.remove();
  if (!rows || !rows.length) return;
  var fmt = opts.format || function (v) { return v; };
  var head = opts.headers
    ? '<thead><tr><th>' + escapeHtml(opts.headers[0]) + '</th>' +
      '<th>' + escapeHtml(opts.headers[1]) + '</th></tr></thead>'
    : '';
  var body = rows.map(function (r) {
    return '<tr><td>' + escapeHtml(String(r.label)) + '</td>' +
           '<td class="lite-chart-val">' + escapeHtml(String(fmt(r.value))) + '</td></tr>';
  }).join('');
  canvas.insertAdjacentHTML('afterend',
    '<table class="lite-chart-table">' + head + '<tbody>' + body + '</tbody></table>');
}
window.renderLiteChartTable = renderLiteChartTable;
