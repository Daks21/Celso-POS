// notifications.js
// Fetches live stock alerts from the backend API and renders a dropdown panel.

(function () {

  // ── Dismissed IDs (lightweight — only IDs stored, not full objects) ──

  function loadDismissedIds() {
    try {
      var raw = localStorage.getItem('notif_dismissed');
      return new Set(raw ? JSON.parse(raw) : []);
    } catch (e) {
      return new Set();
    }
  }

  function saveDismissedIds(ids) {
    localStorage.setItem('notif_dismissed', JSON.stringify(Array.from(ids)));
  }

  // In-memory list — rebuilt on every sync, never persisted in full
  var _notifs = [];

  // ── Sync from backend API ──

  async function syncStockNotifs() {
    var dismissedIds = loadDismissedIds();

    try {
      var result = await getInventorySummary();
      if (!result || !result.success) return;

      var fresh = [];

      // Out-of-stock first (highest priority)
      (result.data.outOfStockItems || []).forEach(function (p) {
        var id = 'notif_out_' + p.id;
        fresh.push({
          id:          id,
          type:        'out',
          productId:   p.id,
          productName: p.name,
          stock:       p.stock,
          unit:        p.unit || 'pc',
          dismissed:   dismissedIds.has(id)
        });
      });

      // Low-stock items
      (result.data.lowStockItems || []).forEach(function (p) {
        var id = 'notif_low_' + p.id;
        fresh.push({
          id:          id,
          type:        'low',
          productId:   p.id,
          productName: p.name,
          stock:       p.stock,
          unit:        p.unit || 'pc',
          dismissed:   dismissedIds.has(id)
        });
      });

      // Prune dismissed IDs for products no longer in alert state
      var currentIds = new Set(fresh.map(function (n) { return n.id; }));
      var pruned = new Set();
      dismissedIds.forEach(function (id) { if (currentIds.has(id)) pruned.add(id); });
      saveDismissedIds(pruned);

      _notifs = fresh;
    } catch (e) {
      // Silently fail — UI stays functional even if notifications can't load
    }

    updateBadge();
  }

  // ── Badge ──

  function updateBadge() {
    var badge = document.getElementById('notif-badge');
    if (!badge) return;
    var count = _notifs.filter(function (n) { return !n.dismissed; }).length;
    if (count > 0) {
      badge.textContent = count > 9 ? '9+' : String(count);
      badge.style.display = 'flex';
    } else {
      badge.style.display = 'none';
    }
  }

  // ── Panel rendering ──

  function renderPanel(panel) {
    var active = _notifs.filter(function (n) { return !n.dismissed; });

    var html = '<div class="notif-panel-header">' +
      '<span class="notif-panel-title">Notifications</span>';

    if (active.length > 0) {
      html += '<button class="notif-clear-btn" id="notif-clear-all">Clear all</button>';
    }
    html += '</div><div class="notif-list" id="notif-list">';

    if (active.length === 0) {
      html += '<div class="notif-empty">' +
        '<i data-lucide="bell-off" class="notif-empty-icon"></i>' +
        '<p>All caught up!</p>' +
        '</div>';
    } else {
      active.forEach(function (n) {
        var icon  = n.type === 'out' ? 'x-circle' : 'alert-triangle';
        var cls   = n.type === 'out' ? 'notif-item--out' : 'notif-item--low';
        var title = n.type === 'out' ? 'Out of Stock' : 'Low Stock';
        var desc  = n.type === 'out'
          ? n.productName + ' — None left'
          : n.productName + ' — ' + n.stock + ' ' + (n.unit || 'pc') + (n.stock !== 1 ? 's' : '') + ' left';

        html += '<div class="notif-item ' + cls + '" data-id="' + n.id + '">' +
          '<div class="notif-item-icon"><i data-lucide="' + icon + '"></i></div>' +
          '<div class="notif-item-body">' +
            '<p class="notif-item-title">' + title + '</p>' +
            '<p class="notif-item-desc">' + desc + '</p>' +
          '</div>' +
          '<button class="notif-dismiss-btn" data-id="' + n.id + '" title="Dismiss">' +
            '<i data-lucide="x"></i>' +
          '</button>' +
        '</div>';
      });
    }

    html += '</div>';
    panel.innerHTML = html;
    lucide.createIcons();
    updateBadge();
  }

  // ── Init ──

  document.addEventListener('DOMContentLoaded', function () {
    var btn = document.getElementById('notif-btn');
    if (!btn) return;

    var wrapper = btn.closest('.notif-wrapper');
    if (!wrapper) return;

    var panel = document.createElement('div');
    panel.className = 'notif-panel';
    panel.id = 'notif-panel';
    wrapper.appendChild(panel);

    // Initial sync + poll every 60 s
    syncStockNotifs();
    setInterval(syncStockNotifs, 60000);

    // Toggle: re-sync for freshest data before opening
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      if (panel.classList.contains('is-open')) {
        panel.classList.remove('is-open');
      } else {
        syncStockNotifs().then(function () {
          renderPanel(panel);
          panel.classList.add('is-open');
        });
      }
    });

    // Dismiss / clear-all
    panel.addEventListener('click', function (e) {
      var dismissBtn = e.target.closest('.notif-dismiss-btn');
      var clearBtn   = e.target.closest('#notif-clear-all');

      if (dismissBtn) {
        var id = dismissBtn.dataset.id;
        var dismissed = loadDismissedIds();
        dismissed.add(id);
        saveDismissedIds(dismissed);
        _notifs.forEach(function (n) { if (n.id === id) n.dismissed = true; });
        renderPanel(panel);
      } else if (clearBtn) {
        var dismissed = loadDismissedIds();
        _notifs.forEach(function (n) { n.dismissed = true; dismissed.add(n.id); });
        saveDismissedIds(dismissed);
        renderPanel(panel);
      }
    });

    // Close on outside click
    document.addEventListener('click', function (e) {
      if (!wrapper.contains(e.target)) {
        panel.classList.remove('is-open');
      }
    });
  });

})();
