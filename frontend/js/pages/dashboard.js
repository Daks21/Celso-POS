checkAuth();

// ── Analytics widget rendering for Dashboard ──

var _dashCharts     = {};
var _dashApiCharts  = null;
var _dashApiHeatmap = null;

function _destroyDashChart(id) {
  if (_dashCharts[id]) { _dashCharts[id].destroy(); delete _dashCharts[id]; }
}

function _isDark() {
  return document.documentElement.getAttribute('data-theme') === 'dark';
}

function _chartColors() {
  return {
    primary: '#5a9e6f',
    primaryFill: 'rgba(90, 158, 111, 0.12)',
    grid: _isDark() ? 'rgba(107,179,128,0.12)' : 'rgba(90,158,111,0.10)',
    text: _isDark() ? '#9ca3af' : '#6b7280',
    tooltipBg: _isDark() ? '#242b26' : '#ffffff',
    tooltipTitle: _isDark() ? '#e2e8e3' : '#2d3a2e',
    tooltipBorder: 'rgba(90,158,111,0.2)'
  };
}

function _dashBaseOptions(extra) {
  var c = _chartColors();
  return Object.assign({
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 300 },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: c.tooltipBg,
        titleColor: c.tooltipTitle,
        bodyColor: c.text,
        borderColor: c.tooltipBorder,
        borderWidth: 1,
        padding: 8,
        cornerRadius: 8
      }
    },
    scales: {
      x: { grid: { color: c.grid, drawBorder: false }, ticks: { color: c.text, font: { family: "'DM Sans',sans-serif", size: 11 } }, border: { display: false } },
      y: { grid: { color: c.grid, drawBorder: false }, ticks: { color: c.text, font: { family: "'DM Sans',sans-serif", size: 11 } }, border: { display: false } }
    }
  }, extra || {});
}

function _formatPeso(amount) {
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(amount);
}

// Transform API chart data (from /api/analytics/charts) to { labels, data } for Chart.js

function _transformRevenue(revenueByDay) {
  if (!revenueByDay) return { labels: [], data: [] };
  var entries = Object.entries(revenueByDay).sort(function (a, b) { return a[0] < b[0] ? -1 : 1; });
  return {
    labels: entries.map(function (e) {
      var d = new Date(e[0] + 'T00:00:00');
      return d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
    }),
    data: entries.map(function (e) { return e[1]; })
  };
}

function _transformTopRevenue(arr) {
  if (!Array.isArray(arr) || !arr.length) return { labels: [], data: [] };
  return { labels: arr.map(function (e) { return e.name; }), data: arr.map(function (e) { return e.revenue; }) };
}

function _transformTopQty(arr) {
  if (!Array.isArray(arr) || !arr.length) return { labels: [], data: [] };
  return { labels: arr.map(function (e) { return e.name; }), data: arr.map(function (e) { return e.qty; }) };
}

var _DASH_DOW_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
function _transformDayOfWeek(arr) {
  if (!Array.isArray(arr)) return { labels: _DASH_DOW_LABELS, data: [0, 0, 0, 0, 0, 0, 0] };
  return { labels: _DASH_DOW_LABELS, data: arr };
}

var WIDGET_META = {
  'activity-heatmap':     { label: 'Sales Activity',           span: true,  heatmap: true  },
  'revenue-chart':        { label: 'Revenue Over Time',        span: true,  heatmap: false },
  'top-products-revenue': { label: 'Top Products by Revenue',  span: false, heatmap: false },
  'top-products-qty':     { label: 'Top Products by Quantity', span: false, heatmap: false },
  'sales-by-day':         { label: 'Sales by Day of Week',     span: true,  heatmap: false }
};

var DASH_CELL = 10, DASH_GAP = 2;
var DASH_MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

// Phase 6.5: the pinned charts/heatmap are a Plus feature ('dashboard_charts').
// When the plan doesn't include them, show an upsell in the Analytics Overview
// slot instead of fetching (which would 402). The Free dashboard keeps its
// summary cards, recent transactions, and low-stock alerts.
function renderChartsUpsell() {
  var container  = document.getElementById('dashboard-analytics-widgets');
  var emptyState = document.getElementById('dashboard-analytics-empty');
  if (emptyState) emptyState.style.display = 'none';
  if (!container) return;
  container.innerHTML =
    '<div class="dashboard-analytics-empty" style="display:block">' +
      '<p>Charts &amp; the sales heatmap are a <strong>Plus</strong> feature.</p>' +
      '<p style="margin-top:4px">Upgrade your plan to pin revenue trends, top products, and activity here.</p>' +
    '</div>';
}

function renderDashboardWidgets() {
  var container = document.getElementById('dashboard-analytics-widgets');
  var emptyState = document.getElementById('dashboard-analytics-empty');
  if (!container) return;

  var pinned = [];
  try { pinned = JSON.parse(localStorage.getItem('dashboardWidgets') || '[]'); } catch (e) { pinned = []; }

  Object.keys(_dashCharts).forEach(function (id) { _destroyDashChart(id); });
  container.innerHTML = '';

  if (pinned.length === 0) {
    if (emptyState) emptyState.style.display = 'block';
    if (typeof lucide !== 'undefined') lucide.createIcons();
    return;
  }

  if (emptyState) emptyState.style.display = 'none';

  var apiCharts = _dashApiCharts || {};
  var grid = document.createElement('div');
  grid.className = 'dashboard-charts-grid';
  container.appendChild(grid);

  pinned.forEach(function (widgetId) {
    var meta = WIDGET_META[widgetId];
    if (!meta) return;

    var card = document.createElement('div');
    card.className = 'dashboard-chart-card' + (meta.span ? ' span-2' : '');

    if (meta.heatmap) {
      card.innerHTML =
        '<p class="dashboard-chart-title">' + meta.label + '</p>' +
        '<div class="dash-hm-outer">' +
          '<div class="dash-hm-main">' +
            '<div class="dash-hm-day-labels">' +
              '<span></span>' +
              '<span>Mon</span>' +
              '<span></span>' +
              '<span>Wed</span>' +
              '<span></span>' +
              '<span>Fri</span>' +
              '<span></span>' +
            '</div>' +
            '<div class="dash-hm-scroll-area">' +
              '<div class="dash-hm-months" id="dash-hm-months"></div>' +
              '<div class="dash-heatmap-cells" id="dash-heatmap-cells"></div>' +
            '</div>' +
          '</div>' +
          '<div class="dash-heatmap-legend">' +
            '<span class="heatmap-legend-label">Less</span>' +
            '<span class="dash-heatmap-cell" data-level="0"></span>' +
            '<span class="dash-heatmap-cell" data-level="1"></span>' +
            '<span class="dash-heatmap-cell" data-level="2"></span>' +
            '<span class="dash-heatmap-cell" data-level="3"></span>' +
            '<span class="dash-heatmap-cell" data-level="4"></span>' +
            '<span class="heatmap-legend-label">More</span>' +
          '</div>' +
        '</div>';
      grid.appendChild(card);

      setTimeout(function () {
        var cellsEl  = document.getElementById('dash-heatmap-cells');
        var monthsEl = document.getElementById('dash-hm-months');
        var tooltip  = document.getElementById('heatmap-tooltip');
        if (!cellsEl) return;

        var dayRevenue = _dashApiHeatmap || {};

        var nonZero = Object.values(dayRevenue).filter(function (v) { return v > 0; }).sort(function (a, b) { return a - b; });
        var q1 = nonZero[Math.floor(nonZero.length * 0.25)] || 1;
        var q2 = nonZero[Math.floor(nonZero.length * 0.50)] || 2;
        var q3 = nonZero[Math.floor(nonZero.length * 0.75)] || 3;

        function hlevel(v) {
          if (!v) return 0;
          if (v <= q1) return 1;
          if (v <= q2) return 2;
          if (v <= q3) return 3;
          return 4;
        }

        // Build the grid entirely in store-local date space so the "today"
        // boundary, weekday alignment, and month labels match how the backend
        // buckets sales — even when the viewer's device is in a different
        // timezone (e.g. an owner checking in from abroad). We walk YYYY-MM-DD
        // strings anchored at noon UTC (DST-proof) and read weekday/month off
        // the anchor's UTC getters; the keys index dayRevenue directly.
        var todayStr = todayStrTz();
        function _anchor(ds) { return new Date(ds + 'T12:00:00Z'); }
        function _addDays(ds, n) {
          var a = _anchor(ds);
          a.setUTCDate(a.getUTCDate() + n);
          return a.toISOString().slice(0, 10);
        }

        var todayDow = _anchor(todayStr).getUTCDay();          // 0=Sun … 6=Sat
        var curStr   = _addDays(todayStr, -(52 * 7) - todayDow); // align to a Sunday

        var weeks       = [];
        var monthLabels = [];
        var lastMonth   = -1;
        var done        = false;

        while (!done) {
          var week = [];
          for (var d = 0; d < 7; d++) {
            if (curStr > todayStr) {
              week.push({ date: null, key: null, revenue: 0, level: -1 });
              continue;
            }
            var anchor = _anchor(curStr);
            var m      = anchor.getUTCMonth();
            if (d === 0 && m !== lastMonth) {
              monthLabels.push({ label: DASH_MONTHS[m], weekIndex: weeks.length });
              lastMonth = m;
            }
            var rev = dayRevenue[curStr] || 0;
            week.push({ date: anchor, key: curStr, revenue: rev, level: hlevel(rev) });
            curStr = _addDays(curStr, 1);
          }
          weeks.push(week);
          if (curStr > todayStr) done = true;
        }

        if (monthsEl) {
          monthsEl.innerHTML = '';
          monthLabels.forEach(function (ml, i) {
            var nextIdx = i + 1 < monthLabels.length ? monthLabels[i + 1].weekIndex : weeks.length;
            var width   = (nextIdx - ml.weekIndex) * (DASH_CELL + DASH_GAP);
            var span    = document.createElement('span');
            span.textContent  = ml.label;
            span.style.cssText =
              'display:inline-block;min-width:' + width + 'px;' +
              'font-size:10px;color:var(--color-text-muted);overflow:hidden;flex-shrink:0;';
            monthsEl.appendChild(span);
          });
        }

        cellsEl.innerHTML = '';
        weeks.forEach(function (week) {
          var weekEl = document.createElement('div');
          weekEl.className = 'dash-heatmap-week';
          week.forEach(function (day) {
            var cell = document.createElement('div');
            cell.className = 'dash-heatmap-cell';
            cell.setAttribute('data-level', day.level === -1 ? 'empty' : day.level);
            if (day.date && day.level !== -1) {
              cell.dataset.date    = day.key;
              cell.dataset.revenue = day.revenue;
              var dStr   = new Date(day.key + 'T00:00:00').toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
              var revStr = day.revenue > 0 ? _formatPeso(day.revenue) + ' in sales' : 'No sales';
              cell.setAttribute('aria-label', dStr + ': ' + revStr);
              cell.setAttribute('role', 'gridcell');
              cell.setAttribute('tabindex', '0');
            }
            weekEl.appendChild(cell);
          });
          cellsEl.appendChild(weekEl);
        });

        if (tooltip) {
          cellsEl.addEventListener('mousemove', function (e) {
            var cell = e.target.closest('.dash-heatmap-cell');
            if (!cell || !cell.dataset.date) { tooltip.style.display = 'none'; return; }
            var d2      = new Date(cell.dataset.date + 'T00:00:00');
            var dateStr = d2.toLocaleDateString('en-PH', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' });
            var rev     = parseFloat(cell.dataset.revenue) || 0;
            tooltip.querySelector('.heatmap-tooltip-date').textContent  = dateStr;
            tooltip.querySelector('.heatmap-tooltip-value').textContent =
              rev > 0 ? _formatPeso(rev) + ' in sales' : 'No sales';
            tooltip.style.display = 'block';
            var tw = tooltip.offsetWidth  || 170;
            var th = tooltip.offsetHeight || 50;
            var tx = e.clientX + 14;
            var ty = e.clientY - th - 10;
            if (tx + tw > window.innerWidth)  tx = e.clientX - tw - 10;
            if (tx < 8)                       tx = 8;
            if (ty < 8)                       ty = e.clientY + 14;
            if (ty + th > window.innerHeight) ty = e.clientY - th - 10;
            tooltip.style.left = tx + 'px';
            tooltip.style.top  = ty + 'px';
          });
          cellsEl.addEventListener('mouseleave', function () {
            tooltip.style.display = 'none';
          });
        }

        var scrollArea = cellsEl.closest('.dash-hm-scroll-area');
        if (scrollArea) scrollArea.scrollLeft = scrollArea.scrollWidth;
      }, 0);

    } else {
      var canvasId = 'dash-chart-' + widgetId;
      var emptyId  = 'dash-empty-' + widgetId;
      card.innerHTML =
        '<p class="dashboard-chart-title">' + meta.label + '</p>' +
        '<div class="dashboard-chart-canvas-wrapper">' +
          '<canvas id="' + canvasId + '"></canvas>' +
          '<div class="chart-empty-state" id="' + emptyId + '">' +
            '<p>No sales data for this period</p>' +
          '</div>' +
        '</div>';
      grid.appendChild(card);

      setTimeout(function renderWidgetChart() {
        var ctx     = document.getElementById(canvasId);
        var emptyEl = document.getElementById(emptyId);
        if (!ctx) return;
        var c = _chartColors();

        function showOrHide(hasData) {
          ctx.style.display = hasData ? 'block' : 'none';
          if (emptyEl) emptyEl.style.display = hasData ? 'none' : 'flex';
        }

        // Lite Mode: render the widget's data as a table and skip Chart.js
        // entirely (same numbers, none of the 205 KB / canvas paint cost).
        if (window.LiteMode && LiteMode.isActive() &&
            typeof renderLiteChartTable === 'function') {
          var lite = {
            'revenue-chart':        { d: _transformRevenue(apiCharts.revenueByDay),    fmt: _formatPeso,                              headers: ['Day', 'Revenue'] },
            'top-products-revenue': { d: _transformTopRevenue(apiCharts.topByRevenue), fmt: _formatPeso,                              headers: ['Product', 'Revenue'] },
            'top-products-qty':     { d: _transformTopQty(apiCharts.topByQty),         fmt: function (v) { return v + ' units'; },    headers: ['Product', 'Units'] },
            'sales-by-day':         { d: _transformDayOfWeek(apiCharts.byDayOfWeek),   fmt: _formatPeso,                              headers: ['Day', 'Revenue'] }
          }[widgetId];
          if (!lite) { showOrHide(false); return; }
          var liteHasData = lite.d.data.some(function (v) { return v > 0; }) && lite.d.labels.length > 0;
          if (!liteHasData) { showOrHide(false); return; }
          if (emptyEl) emptyEl.style.display = 'none';
          var liteRows = lite.d.labels.map(function (lab, i) { return { label: lab, value: lite.d.data[i] }; });
          renderLiteChartTable(ctx, liteRows, { headers: lite.headers, format: lite.fmt });
          return;
        }

        // Chart.js is lazy-loaded (core/utils.js ensureChart). On the first
        // widget it isn't on the page yet, so fetch it then re-run this render.
        // If it can't load (offline / blocked), degrade to the empty state.
        if (typeof Chart === 'undefined') {
          if (window.ensureChart) {
            ensureChart().then(renderWidgetChart).catch(function () { showOrHide(false); });
          } else {
            showOrHide(false);
          }
          return;
        }

        if (widgetId === 'revenue-chart') {
          var d = _transformRevenue(apiCharts.revenueByDay);
          var hasData = d.data.some(function (v) { return v > 0; });
          showOrHide(hasData);
          if (!hasData) return;
          var opts = _dashBaseOptions();
          opts.plugins.tooltip.callbacks = { label: function (ct) { return ' ' + _formatPeso(ct.parsed.y); } };
          opts.scales.y.ticks.callback = function (v) { return v >= 1000 ? '₱' + (v/1000).toFixed(1)+'k' : '₱'+v; };
          _dashCharts[widgetId] = new Chart(ctx.getContext('2d'), {
            type: 'line',
            data: { labels: d.labels, datasets: [{ data: d.data, borderColor: c.primary, backgroundColor: c.primaryFill, borderWidth: 2, pointRadius: 0, pointHoverRadius: 5, fill: true, tension: 0.4 }] },
            options: opts
          });

        } else if (widgetId === 'top-products-revenue') {
          var d = _transformTopRevenue(apiCharts.topByRevenue);
          var hasData = d.data.length > 0;
          showOrHide(hasData);
          if (!hasData) return;
          var opts = _dashBaseOptions();
          opts.indexAxis = 'y';
          opts.plugins.tooltip.callbacks = { label: function (ct) { return ' ' + _formatPeso(ct.parsed.x); } };
          opts.scales.x.ticks.callback = function (v) { return v >= 1000 ? '₱'+(v/1000).toFixed(1)+'k' : '₱'+v; };
          var bColors = d.data.map(function (_, i) { return 'rgba(90,158,111,' + Math.max(0.28, 1 - i * 0.14) + ')'; });
          _dashCharts[widgetId] = new Chart(ctx.getContext('2d'), {
            type: 'bar',
            data: { labels: d.labels, datasets: [{ data: d.data, backgroundColor: bColors, borderRadius: 6, borderSkipped: false }] },
            options: opts
          });

        } else if (widgetId === 'top-products-qty') {
          var d = _transformTopQty(apiCharts.topByQty);
          var hasData = d.data.length > 0;
          showOrHide(hasData);
          if (!hasData) return;
          var opts = _dashBaseOptions();
          opts.indexAxis = 'y';
          opts.plugins.tooltip.callbacks = { label: function (ct) { return ' ' + ct.parsed.x + ' units'; } };
          opts.scales.x.ticks.callback = function (v) { return v + ' units'; };
          var bColors = d.data.map(function (_, i) { return 'rgba(90,158,111,' + Math.max(0.28, 1 - i * 0.14) + ')'; });
          _dashCharts[widgetId] = new Chart(ctx.getContext('2d'), {
            type: 'bar',
            data: { labels: d.labels, datasets: [{ data: d.data, backgroundColor: bColors, borderRadius: 6, borderSkipped: false }] },
            options: opts
          });

        } else if (widgetId === 'sales-by-day') {
          var d = _transformDayOfWeek(apiCharts.byDayOfWeek);
          var hasData = d.data.some(function (v) { return v > 0; });
          showOrHide(hasData);
          if (!hasData) return;
          var max  = Math.max.apply(null, d.data);
          var opts = _dashBaseOptions();
          opts.plugins.tooltip.callbacks = { label: function (ct) { return ' ' + _formatPeso(ct.parsed.y); } };
          opts.scales.y.ticks.callback = function (v) { return v >= 1000 ? '₱'+(v/1000).toFixed(1)+'k' : '₱'+v; };
          _dashCharts[widgetId] = new Chart(ctx.getContext('2d'), {
            type: 'bar',
            data: { labels: d.labels, datasets: [{ data: d.data, backgroundColor: d.data.map(function (v) { return v === max ? c.primary : 'rgba(90,158,111,0.45)'; }), borderRadius: 6, borderSkipped: false }] },
            options: opts
          });
        }
      }, 0);
    }
  });
}

var _themeTimerDash;
var _themeObserverDash = new MutationObserver(function () {
  clearTimeout(_themeTimerDash);
  _themeTimerDash = setTimeout(renderDashboardWidgets, 200);
});
_themeObserverDash.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

// ── Stock Alert pagination ──

var _alertProducts = [];
var _alertPage     = 1;

function _renderStockAlerts(products, page) {
  _alertProducts = products;
  var pageSize   = parseInt(localStorage.getItem('dashboardAlertCount') || '5', 10) || 5;
  var total      = products.length;
  var totalPages = Math.max(1, Math.ceil(total / pageSize));
  _alertPage     = Math.min(Math.max(1, page), totalPages);

  var tbody = document.getElementById('stock-alert-list');
  var pager = document.getElementById('stock-alert-pagination');
  if (!tbody) return;

  if (total === 0) {
    tbody.innerHTML =
      '<tr><td colspan="3" style="text-align:center;padding:24px;color:var(--color-text-muted);">No stock alerts. All products are well stocked.</td></tr>';
    if (pager) pager.style.display = 'none';
    return;
  }

  var start = (_alertPage - 1) * pageSize;
  var slice = products.slice(start, start + pageSize);
  var html  = '';
  slice.forEach(function (p) {
    var status   = getStockStatus(p.stock);
    var stockStr = p.stock + ' ' + (p.unit || 'pc') + (p.stock !== 1 ? 's' : '');
    html +=
      '<tr>' +
        '<td><strong>' + escapeHtml(p.name) + '</strong></td>' +
        '<td class="low-stock-qty">' + stockStr + '</td>' +
        '<td>' +
          '<span class="stock-status-inline">' +
            '<span class="stock-dot ' + status.dotCls + '"></span>' +
            '<span style="color:var(--stock-color-' + status.key + ')">' + status.label + '</span>' +
          '</span>' +
        '</td>' +
      '</tr>';
  });
  for (var i = slice.length; i < pageSize; i++) {
    html += '<tr class="pager-placeholder"><td>&nbsp;</td><td></td><td></td></tr>';
  }
  tbody.innerHTML = html;

  if (pager) {
    if (totalPages <= 1) {
      pager.style.display = 'none';
    } else {
      pager.style.display = 'flex';
      var prevDisabled = _alertPage <= 1          ? ' disabled' : '';
      var nextDisabled = _alertPage >= totalPages ? ' disabled' : '';
      pager.innerHTML =
        '<button class="pager-btn" id="alert-prev"' + prevDisabled + '>' +
          '<i data-lucide="chevron-left"></i>' +
        '</button>' +
        '<span class="pager-info">' + _alertPage + ' / ' + totalPages + '</span>' +
        '<button class="pager-btn" id="alert-next"' + nextDisabled + '>' +
          '<i data-lucide="chevron-right"></i>' +
        '</button>';

      var prevBtn = document.getElementById('alert-prev');
      var nextBtn = document.getElementById('alert-next');
      if (prevBtn) prevBtn.addEventListener('click', function () { _renderStockAlerts(_alertProducts, _alertPage - 1); });
      if (nextBtn) nextBtn.addEventListener('click', function () { _renderStockAlerts(_alertProducts, _alertPage + 1); });
      if (window.lucide) lucide.createIcons();
    }
  }
}

// ── Recent Transactions pagination ──

var _txSales = [];
var _txPage  = 1;

function _renderTransactions(sales, page) {
  var _pop = document.getElementById('items-popover');
  if (_pop) _pop.classList.remove('is-visible');
  _txSales = sales;
  var pageSize   = parseInt(localStorage.getItem('dashboardRecentCount') || '5', 10) || 5;
  var total      = sales.length;
  var totalPages = Math.max(1, Math.ceil(total / pageSize));
  _txPage        = Math.min(Math.max(1, page), totalPages);

  var tbody = document.getElementById('recent-transactions-body');
  var pager = document.getElementById('tx-pagination');
  if (!tbody) return;

  if (total === 0) {
    tbody.innerHTML =
      '<tr><td colspan="4" style="text-align:center;padding:24px;color:var(--color-text-muted);">No transactions recorded yet.</td></tr>';
    if (pager) pager.style.display = 'none';
    return;
  }

  var start = (_txPage - 1) * pageSize;
  var slice = sales.slice(start, start + pageSize);
  var html  = '';
  slice.forEach(function (sale) {
    var dateStr        = formatDateTz(sale.timestamp, { month: 'short', day: 'numeric' });
    var timeStr        = formatTimeTz(sale.timestamp, { hour: '2-digit', minute: '2-digit' });
    var itemCount      = sale.items.reduce(function (s, i) { return s + i.quantity; }, 0);
    var totalFmt       = _formatPeso(sale.total);
    var receiptDisplay = sale.receiptNo ? sale.receiptNo.replace(/^RCPT-/, '') : String(sale.id).padStart(6, '0');
    var itemsJson      = encodeURIComponent(JSON.stringify(sale.items));
    html +=
      '<tr>' +
        '<td>' + receiptDisplay + '</td>' +
        '<td>' + dateStr + ' · ' + timeStr + '</td>' +
        '<td class="tx-items-cell" data-items="' + itemsJson + '">' +
          itemCount + ' item' + (itemCount !== 1 ? 's' : '') +
        '</td>' +
        '<td>' + totalFmt + '</td>' +
      '</tr>';
  });
  for (var i = slice.length; i < pageSize; i++) {
    html += '<tr class="pager-placeholder"><td>&nbsp;</td><td></td><td></td><td></td></tr>';
  }
  tbody.innerHTML = html;

  if (pager) {
    if (totalPages <= 1) {
      pager.style.display = 'none';
    } else {
      pager.style.display = 'flex';
      var prevDisabled = _txPage <= 1          ? ' disabled' : '';
      var nextDisabled = _txPage >= totalPages ? ' disabled' : '';
      pager.innerHTML =
        '<button class="pager-btn" id="tx-prev"' + prevDisabled + '>' +
          '<i data-lucide="chevron-left"></i>' +
        '</button>' +
        '<span class="pager-info">' + _txPage + ' / ' + totalPages + '</span>' +
        '<button class="pager-btn" id="tx-next"' + nextDisabled + '>' +
          '<i data-lucide="chevron-right"></i>' +
        '</button>';

      var prevBtn = document.getElementById('tx-prev');
      var nextBtn = document.getElementById('tx-next');
      if (prevBtn) prevBtn.addEventListener('click', function () { _renderTransactions(_txSales, _txPage - 1); });
      if (nextBtn) nextBtn.addEventListener('click', function () { _renderTransactions(_txSales, _txPage + 1); });
      if (window.lucide) lucide.createIcons();
    }
  }
}

// ── DOM references ──

let currentUser = null;
try { currentUser = JSON.parse(localStorage.getItem("currentUser")); } catch (e) { currentUser = null; }
const totalSalesTodayEl   = document.getElementById("total-sales-today");
const totalProductsEl     = document.getElementById("total-products");
const lowStockItemsEl     = document.getElementById("low-stock-items");
const transactionsTodayEl = document.getElementById("transactions-today");
const userName            = document.getElementById("user-name");

if (currentUser && userName) {
  userName.textContent = currentUser.fullName;
}

// ── Billing reminder / upgrade promo card (Phase 6.6; owner only) ──
// At most one card, priority: grace renewal > trial ending (<=3d) > free upsell.
// Grace/trial use a daily snooze (localStorage day-key — fine that it resets on
// the shared-device logout wipe, since those are urgent). The promo uses a 7-day
// SERVER-side cooldown (user preferences) so it survives that wipe. The server
// enforces plans; this is purely a nudge.

var PROMO_BENEFITS = [
  'Track cashflow and profit with Finance.',
  'See your best sellers and trends in Analytics.',
  'Ask Os, your AI assistant, about your store.',
  'Add a cashier so your staff can ring up sales.',
];

function _baTodayKey() { return new Date().toISOString().slice(0, 10); }
function _baPlanLabel(p) { return ({ free: 'Free', basic: 'Basic', plus: 'Plus', pro: 'Pro' })[p] || p; }
function _baDaysLeft(iso) {
  var e = new Date(iso).getTime();
  return isNaN(e) ? 0 : Math.max(0, Math.ceil((e - Date.now()) / 86400000));
}
function _baUserPrefs() {
  try { return JSON.parse(localStorage.getItem('prefs_' + ((currentUser && currentUser.id) || 'guest')) || '{}'); }
  catch (e) { return {}; }
}
function _baSaveUserPref(k, v) {
  try {
    var key = 'prefs_' + ((currentUser && currentUser.id) || 'guest');
    var p = JSON.parse(localStorage.getItem(key) || '{}');
    p[k] = v;
    localStorage.setItem(key, JSON.stringify(p));
    if (currentUser && currentUser.id && typeof syncPreferencesToDb === 'function') {
      syncPreferencesToDb(currentUser.id);   // persist server-side (survives logout)
    }
  } catch (e) {}
}

function _baWire(slot, planHint, onDismiss) {
  var cta = slot.querySelector('#ba-cta');
  var x   = slot.querySelector('#ba-x');
  if (cta) cta.addEventListener('click', function () {
    // Plans are chosen on the Billing page; deep-link to the suggested one.
    window.location.href = planHint ? ('billing.html?plan=' + encodeURIComponent(planHint)) : 'billing.html';
  });
  if (x) x.addEventListener('click', function () {
    try { if (onDismiss) onDismiss(); } catch (e) {}
    slot.innerHTML = '';
  });
}

function _baShow(slot, kind, iconName, html, planHint, ctaLabel, onDismiss) {
  slot.innerHTML = '<div class="ba-card ba-' + kind + '">' +
    '<i data-lucide="' + iconName + '" class="ba-ico"></i>' +
    '<div class="ba-body">' + html + '</div>' +
    '<button type="button" class="ba-cta" id="ba-cta">' + ctaLabel + '</button>' +
    '<button type="button" class="ba-x" id="ba-x" aria-label="Dismiss">&times;</button>' +
    '</div>';
  _baWire(slot, planHint, onDismiss);
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

async function renderBillingCards() {
  var slot = document.getElementById('bill-alert-slot');
  if (!slot) return;
  var role = (currentUser && currentUser.role) ||
             (typeof getEntitlements === 'function' && getEntitlements() && getEntitlements().role);
  if (role !== 'admin') return;   // owner-only (cashiers have no dashboard anyway)

  var res;
  try { res = await getBillingState(); } catch (e) { return; }
  if (!res || !res.success) return;
  var d = res.data;

  // 1) Grace renewal reminder (daily snooze).
  if (d.state === 'grace') {
    if (localStorage.getItem('celso_bill_snooze') === _baTodayKey()) return;
    var gd = _baDaysLeft(d.graceEndsAt);
    _baShow(slot, 'warn', 'alert-triangle',
      '<b>Payment due.</b> Your ' + _baPlanLabel(d.plan) + ' plan is past due — ' +
      gd + ' day' + (gd === 1 ? '' : 's') + ' left before paid features pause.',
      d.plan, 'Renew now', function () { localStorage.setItem('celso_bill_snooze', _baTodayKey()); });
    return;
  }

  // 2) Trial ending soon (<=3 days; daily snooze, shared key).
  if (d.state === 'trial' && d.trialEndsAt) {
    var td = _baDaysLeft(d.trialEndsAt);
    if (td > 3) return;
    if (localStorage.getItem('celso_bill_snooze') === _baTodayKey()) return;
    _baShow(slot, 'warn', 'clock',
      '<b>Your free trial ends in ' + td + ' day' + (td === 1 ? '' : 's') + '.</b> ' +
      'Subscribe to keep Finance and Analytics.',
      'basic', 'See plans', function () { localStorage.setItem('celso_bill_snooze', _baTodayKey()); });
    return;
  }

  // 3) Free upsell promo (free plan only; 7-day server-side cooldown).
  if (d.plan === 'free' && d.state === 'free') {
    var until = _baUserPrefs().promoDismissedUntil;
    if (until && new Date(until).getTime() > Date.now()) return;
    var benefit = PROMO_BENEFITS[Math.floor(Date.now() / (7 * 86400000)) % PROMO_BENEFITS.length];
    _baShow(slot, 'promo', 'sparkles',
      '<b>Do more with a paid plan.</b> ' + benefit,
      'basic', 'See plans', function () {
        _baSaveUserPref('promoDismissedUntil', new Date(Date.now() + 7 * 86400000).toISOString());
      });
    return;
  }
}

// ── Init ──

async function initDashboard() {
  renderBillingCards();   // 6.6 — grace reminder / upgrade promo (owner only; async, non-blocking)
  // Summary cards + stock alerts
  let summary = {};
  try {
    const summaryResult = await getAnalyticsSummary(null, getLowStockThreshold());
    if (summaryResult && summaryResult.success) {
      summary = summaryResult.data;
    } else {
      showApiError(summaryResult ? summaryResult.message : 'Failed to load dashboard summary.');
    }
  } catch (err) {
    showApiError('Network error. Is the server running?');
  }

  if (totalProductsEl)     totalProductsEl.textContent     = summary.totalProducts    || 0;
  if (lowStockItemsEl)     lowStockItemsEl.textContent     = (summary.lowStockCount || 0) + (summary.outOfStockCount || 0);
  if (totalSalesTodayEl)   totalSalesTodayEl.textContent   = _formatPeso(summary.todayRevenue    || 0);
  if (transactionsTodayEl) transactionsTodayEl.textContent = summary.todayTransactions || 0;

  // Stock alert list — filter to only low/out items using the frontend threshold as authority
  var alertItems = (summary.lowStockItems || []).filter(function (p) { return getStockStatus(p.stock).key !== 'ok'; });
  _renderStockAlerts(alertItems, 1);

  // Recent transactions — fetch last 90 days to avoid loading full history
  var txSalesResult;
  try {
    var _txFrom = new Intl.DateTimeFormat('en-CA', { timeZone: getStoreTz() }).format(
      new Date(Date.now() - 90 * 86400000)
    );
    txSalesResult = await getSales({ from: _txFrom });
  } catch (err) {
    showApiError('Network error. Is the server running?');
    txSalesResult = { data: [] };
  }
  var allSales = (txSalesResult && txSalesResult.data ? txSalesResult.data : [])
    .sort(function (a, b) { return new Date(b.timestamp) - new Date(a.timestamp); });
  _renderTransactions(allSales, 1);

  // Pinned analytics widgets — gated behind the Plus 'dashboard_charts' feature.
  if (typeof hasEntitlement === 'function' && !hasEntitlement('dashboard_charts')) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', renderChartsUpsell);
    } else {
      renderChartsUpsell();
    }
  } else {
    // Fetch chart + heatmap data for pinned widgets
    try {
      var _now = new Date();
      var _from30 = new Date(_now.getFullYear(), _now.getMonth(), _now.getDate() - 29);
      var _mFmt = new Intl.DateTimeFormat('en-CA', { timeZone: getStoreTz() });
      var _chartsRes  = await getCharts(_mFmt.format(_from30), _mFmt.format(_now));
      var _heatmapRes = await getHeatmap();
      if (_chartsRes  && _chartsRes.success)  _dashApiCharts  = _chartsRes.data;
      if (_heatmapRes && _heatmapRes.success)  _dashApiHeatmap = _heatmapRes.data;
    } catch (e) { /* server may not be running — widgets will show empty state */ }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', renderDashboardWidgets);
    } else {
      renderDashboardWidgets();
    }
  }

  // ── Onboarding hooks ──
  // init() returns true if it rendered the modal; if so, checklist + sidebar
  // are deferred to welcome.close() to avoid showing them behind the overlay.
  var _welcomeShowing = typeof OnboardingWelcome !== 'undefined' && OnboardingWelcome.init();

  if (!_welcomeShowing) {
    if (typeof OnboardingChecklist !== 'undefined') OnboardingChecklist.init();
    if (typeof SidebarProgress     !== 'undefined') SidebarProgress.init();
  }

  if (allSales.length > 0 && typeof OnboardingChecklist !== 'undefined') {
    OnboardingChecklist.complete('viewDashboard');
  }

  // Tour defers automatically via MutationObserver if welcome modal is open
  if (typeof OnboardingTour !== 'undefined' && typeof OnboardingTours !== 'undefined') {
    OnboardingTour.start('dashboard', OnboardingTours.dashboard);
  }
}

initDashboard();

// ── Auto-refresh summary cards every 60 seconds ──

async function refreshCards() {
  try {
    var result = await getAnalyticsSummary(null, getLowStockThreshold());
    if (result && result.success) {
      var s = result.data;
      if (totalProductsEl)     totalProductsEl.textContent     = s.totalProducts    || 0;
      if (lowStockItemsEl)     lowStockItemsEl.textContent     = (s.lowStockCount || 0) + (s.outOfStockCount || 0);
      if (totalSalesTodayEl)   totalSalesTodayEl.textContent   = _formatPeso(s.todayRevenue    || 0);
      if (transactionsTodayEl) transactionsTodayEl.textContent = s.todayTransactions || 0;
    }
  } catch (e) { /* silent — cards retain their last known value */ }
}

setInterval(refreshCards, 60000);

// ── Items popover ──

(function () {
  if (localStorage.getItem('dashboardItemsPopover') === 'false') return;

  var popover    = document.getElementById('items-popover');
  var isMobile   = window.matchMedia('(hover: none) and (pointer: coarse)').matches;
  var activeCell = null;

  function buildPopover(items) {
    var html = '';
    items.forEach(function (item) {
      var lineFmt  = _formatPeso(item.lineTotal || (item.price * item.quantity));
      var safeName = escapeHtml(item.name);
      html +=
        '<div class="items-popover-row">' +
          '<span class="items-popover-name" title="' + safeName + '">' + safeName + '</span>' +
          '<span class="items-popover-qty">&times;' + item.quantity + '&nbsp;&nbsp;' + lineFmt + '</span>' +
        '</div>';
    });
    var grandTotal = items.reduce(function (s, i) {
      return s + (i.lineTotal || i.price * i.quantity);
    }, 0);
    html +=
      '<hr class="items-popover-divider">' +
      '<div class="items-popover-total">' +
        '<span>Total</span><span>' + _formatPeso(grandTotal) + '</span>' +
      '</div>';
    popover.innerHTML = html;
  }

  // position: fixed — all coordinates are viewport-relative, no scrollY needed
  function positionPopover(cell) {
    var rect  = cell.getBoundingClientRect();
    var gap   = 6;

    // measure popover height off-screen
    popover.style.visibility = 'hidden';
    popover.style.opacity    = '0';
    popover.style.display    = 'block';
    var ph = popover.offsetHeight;
    var pw = popover.offsetWidth || 220;
    popover.style.display    = '';
    popover.style.visibility = '';
    popover.style.opacity    = '';

    // vertical: prefer below, flip above if not enough room
    var top = (window.innerHeight - rect.bottom >= ph + gap)
      ? rect.bottom + gap
      : rect.top - ph - gap;
    popover.style.top = Math.max(8, top) + 'px';

    // horizontal: align to cell left, clamp to right edge
    var left = Math.min(rect.left, window.innerWidth - pw - 8);
    popover.style.left = Math.max(8, left) + 'px';
  }

  function showPopover(cell) {
    if (activeCell === cell && popover.classList.contains('is-visible')) return;
    var items = [];
    try { items = JSON.parse(decodeURIComponent(cell.dataset.items || '[]')); } catch (e) {}
    if (!items.length) return;
    activeCell = cell;
    buildPopover(items);
    positionPopover(cell);
    popover.classList.add('is-visible');
  }

  function hidePopover() {
    popover.classList.remove('is-visible');
    activeCell = null;
  }

  // Hide on scroll — cell moves but fixed popover stays put
  window.addEventListener('scroll', hidePopover, { passive: true });

  // Desktop — hover only
  if (!isMobile) {
    document.addEventListener('mouseover', function (e) {
      var cell = e.target.closest('.tx-items-cell');
      if (cell) { showPopover(cell); return; }
      if (!popover.contains(e.target)) hidePopover();
    });
    popover.addEventListener('mouseleave', hidePopover);
  }

  // Mobile — single tap to open, tap anywhere else to close
  if (isMobile) {
    document.addEventListener('click', function (e) {
      var cell = e.target.closest('.tx-items-cell');
      if (cell) {
        e.stopPropagation();
        if (activeCell === cell) { hidePopover(); return; }
        showPopover(cell);
        return;
      }
      if (!popover.contains(e.target)) hidePopover();
    });
  }
})();
