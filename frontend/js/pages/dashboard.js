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

        var today    = new Date();
        var todayEnd = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59);
        var startDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
        startDate.setDate(startDate.getDate() - (52 * 7) - today.getDay());

        var weeks       = [];
        var monthLabels = [];
        var cur         = new Date(startDate);
        var lastMonth   = -1;

        while (cur <= todayEnd) {
          var week = [];
          for (var d = 0; d < 7; d++) {
            if (cur > todayEnd) {
              week.push({ date: null, key: null, revenue: 0, level: -1 });
              cur.setDate(cur.getDate() + 1);
              continue;
            }
            var key = cur.toISOString().slice(0, 10);
            var m   = cur.getMonth();
            if (d === 0 && m !== lastMonth) {
              monthLabels.push({ label: DASH_MONTHS[m], weekIndex: weeks.length });
              lastMonth = m;
            }
            var rev = dayRevenue[key] || 0;
            week.push({ date: new Date(cur), key: key, revenue: rev, level: hlevel(rev) });
            cur.setDate(cur.getDate() + 1);
          }
          weeks.push(week);
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

      setTimeout(function () {
        var ctx     = document.getElementById(canvasId);
        var emptyEl = document.getElementById(emptyId);
        if (!ctx) return;
        var c = _chartColors();

        function showOrHide(hasData) {
          ctx.style.display = hasData ? 'block' : 'none';
          if (emptyEl) emptyEl.style.display = hasData ? 'none' : 'flex';
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

// ── DOM references ──

const currentUser         = JSON.parse(localStorage.getItem("currentUser"));
const totalSalesTodayEl   = document.getElementById("total-sales-today");
const totalProductsEl     = document.getElementById("total-products");
const lowStockItemsEl     = document.getElementById("low-stock-items");
const transactionsTodayEl = document.getElementById("transactions-today");
const userName            = document.getElementById("user-name");
const stockAlertList      = document.getElementById("stock-alert-list");

if (currentUser && userName) {
  userName.textContent = currentUser.fullName;
}

// ── Init ──

async function initDashboard() {
  // Summary cards + stock alerts
  let summary = {};
  try {
    const summaryResult = await getAnalyticsSummary();
    if (summaryResult && summaryResult.success) {
      summary = summaryResult.data;
    } else {
      showApiError(summaryResult ? summaryResult.message : 'Failed to load dashboard summary.');
    }
  } catch (err) {
    showApiError('Network error. Is the server running?');
  }

  if (totalProductsEl)     totalProductsEl.textContent     = summary.totalProducts    || 0;
  if (lowStockItemsEl)     lowStockItemsEl.textContent     = summary.lowStockCount    || 0;
  if (totalSalesTodayEl)   totalSalesTodayEl.textContent   = _formatPeso(summary.todayRevenue    || 0);
  if (transactionsTodayEl) transactionsTodayEl.textContent = summary.todayTransactions || 0;

  // Stock alert list
  if (stockAlertList) {
    var alertProducts = summary.lowStockItems || [];

    if (alertProducts.length === 0) {
      stockAlertList.innerHTML =
        '<p style="text-align:center;padding:24px;color:var(--color-text-muted);font-size:14px;">No stock alerts. All products are well stocked.</p>';
    } else {
      var html = '';
      alertProducts.forEach(function (p) {
        var isOut   = p.stock === 0;
        var dotCls  = isOut ? 'status-critical' : 'status-low';
        var lblCls  = isOut ? 'critical-label'  : 'low-label';
        var lblText = isOut ? 'Out of Stock'     : 'Low Stock';
        var stock   = p.stock + ' ' + (p.unit || 'pc') + (p.stock !== 1 ? 's' : '');

        html +=
          '<div class="stock-alert-item">' +
            '<div class="stock-info">' +
              '<span class="status-dot ' + dotCls + '"></span>' +
              '<div>' +
                '<h3>' + p.name + '</h3>' +
                '<p>Current stock: ' + stock + '</p>' +
              '</div>' +
            '</div>' +
            '<span class="stock-label ' + lblCls + '">' + lblText + '</span>' +
          '</div>';
      });
      stockAlertList.innerHTML = html;
    }
  }

  // Recent transactions — today only
  var recentTxBody = document.getElementById('recent-transactions-body');
  if (recentTxBody) {
    var todayStr = new Date().toISOString().slice(0, 10);
    let salesResult;
    try {
      salesResult = await getSales({ from: todayStr, to: todayStr });
    } catch (err) {
      showApiError('Network error. Is the server running?');
      salesResult = { data: [] };
    }
    var recentCount = parseInt(localStorage.getItem('dashboardRecentCount') || '5', 10);
    const recentSales = (salesResult && salesResult.data ? salesResult.data : [])
      .sort(function (a, b) { return new Date(b.timestamp) - new Date(a.timestamp); })
      .slice(0, recentCount);

    if (recentSales.length === 0) {
      recentTxBody.innerHTML =
        '<tr><td colspan="4" style="text-align:center;padding:24px;color:var(--color-text-muted);">No transactions recorded today.</td></tr>';
    } else {
      var txHtml = '';
      recentSales.forEach(function (sale) {
        var d         = new Date(sale.timestamp);
        var dateStr   = d.toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' });
        var timeStr   = d.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' });
        var itemCount = sale.items.reduce(function (s, i) { return s + i.quantity; }, 0);
        var totalFmt  = _formatPeso(sale.total);
        var receiptDisplay = sale.receiptNo ? sale.receiptNo.replace(/^RCPT-/, '') : String(sale.id).padStart(6, '0');

        txHtml +=
          '<tr>' +
            '<td>' + receiptDisplay + '</td>' +
            '<td>' + dateStr + ' - ' + timeStr + '</td>' +
            '<td>' + itemCount + ' item' + (itemCount !== 1 ? 's' : '') + '</td>' +
            '<td>' + totalFmt + '</td>' +
          '</tr>';
      });
      recentTxBody.innerHTML = txHtml;
    }
  }

  // Fetch chart + heatmap data for pinned widgets
  try {
    var _now = new Date();
    var _from30 = new Date(_now.getFullYear(), _now.getMonth(), _now.getDate() - 29);
    var _chartsRes  = await getCharts(_from30.toISOString().slice(0, 10), _now.toISOString().slice(0, 10));
    var _heatmapRes = await getHeatmap();
    if (_chartsRes  && _chartsRes.success)  _dashApiCharts  = _chartsRes.data;
    if (_heatmapRes && _heatmapRes.success)  _dashApiHeatmap = _heatmapRes.data;
  } catch (e) { /* server may not be running — widgets will show empty state */ }

  // Pinned analytics widgets
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', renderDashboardWidgets);
  } else {
    renderDashboardWidgets();
  }
}

initDashboard();
