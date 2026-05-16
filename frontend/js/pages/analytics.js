checkAuth();

// ── Widget pin management ──

function getPinnedWidgets() {
  try {
    var saved = localStorage.getItem('dashboardWidgets');
    return saved ? JSON.parse(saved) : [];
  } catch (e) { return []; }
}

function setPinnedWidgets(arr) {
  localStorage.setItem('dashboardWidgets', JSON.stringify(arr));
  try {
    var user = JSON.parse(localStorage.getItem('currentUser') || 'null');
    if (user && user.id) syncPreferencesToDb(user.id);
  } catch (e) {}
}

function togglePinnedWidget(id, shouldPin) {
  var pinned = getPinnedWidgets();
  var idx = pinned.indexOf(id);
  if (shouldPin && idx === -1) pinned.push(id);
  if (!shouldPin && idx !== -1) pinned.splice(idx, 1);
  setPinnedWidgets(pinned);
}

function initPinToggles() {
  var pinned = getPinnedWidgets();
  document.querySelectorAll('.widget-pin-checkbox').forEach(function (cb) {
    var widgetId = cb.dataset.widget;
    cb.checked = pinned.indexOf(widgetId) !== -1;
    cb.addEventListener('change', function () {
      togglePinnedWidget(widgetId, cb.checked);
    });
  });
}

// ── Date range ──

var currentRange = 'this-month';
var customFrom = null;
var customTo = null;

function todayEnd() {
  var d = new Date();
  d.setHours(23, 59, 59, 999);
  return d;
}

function getDateRange(rangeKey) {
  var now = new Date();
  var start = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  switch (rangeKey) {
    case 'today':
      return { from: start, to: todayEnd() };

    case 'this-week': {
      var weekStart = new Date(start);
      weekStart.setDate(start.getDate() - start.getDay());
      return { from: weekStart, to: todayEnd() };
    }

    case 'this-month':
      return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: todayEnd() };

    case 'last-30': {
      var l30 = new Date(start);
      l30.setDate(start.getDate() - 29);
      return { from: l30, to: todayEnd() };
    }

    case 'custom':
      return { from: customFrom, to: customTo };

    default:
      return { from: null, to: null };
  }
}

// ── KPI display ──

function updateKPIs(kpis) {
  document.getElementById('kpi-revenue').textContent      = formatPeso(kpis.totalRevenue || 0);
  document.getElementById('kpi-transactions').textContent = kpis.transactionCount || 0;
  document.getElementById('kpi-avg-order').textContent    = formatPeso(kpis.avgOrderValue || 0);
  document.getElementById('kpi-units').textContent        = kpis.totalUnits || 0;
}

function updateInventoryKPIs(products) {
  var totalAssets = products.reduce(function (sum, p) { return sum + (p.cost || 0) * (p.stock || 0); }, 0);
  var totalProfit = products.reduce(function (sum, p) { return sum + ((p.price || 0) - (p.cost || 0)) * (p.stock || 0); }, 0);
  var elAssets = document.getElementById('kpi-total-assets');
  var elProfit = document.getElementById('kpi-calc-profit');
  if (elAssets) elAssets.textContent = formatPeso(totalAssets);
  if (elProfit) elProfit.textContent = formatPeso(totalProfit);
}

// ── Chart rendering ──

var chartInstances = {};

function destroyChart(id) {
  if (chartInstances[id]) {
    chartInstances[id].destroy();
    delete chartInstances[id];
  }
}

function isDark() {
  return document.documentElement.getAttribute('data-theme') === 'dark';
}

function chartColors() {
  return {
    primary:      '#5a9e6f',
    primaryFill:  'rgba(90, 158, 111, 0.12)',
    grid:         isDark() ? 'rgba(107,179,128,0.12)' : 'rgba(90,158,111,0.10)',
    text:         isDark() ? '#9ca3af' : '#6b7280',
    tooltip: {
      bg:     isDark() ? '#242b26' : '#ffffff',
      title:  isDark() ? '#e2e8e3' : '#2d3a2e',
      border: 'rgba(90,158,111,0.2)'
    }
  };
}

function baseOptions(extraScales) {
  var c = chartColors();
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 400 },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: c.tooltip.bg,
        titleColor:       c.tooltip.title,
        bodyColor:        c.text,
        borderColor:      c.tooltip.border,
        borderWidth:  1,
        padding:      10,
        cornerRadius: 8,
        callbacks: {}
      }
    },
    scales: Object.assign({
      x: {
        grid:   { color: c.grid, drawBorder: false },
        ticks:  { color: c.text, font: { family: "'DM Sans', sans-serif", size: 12 } },
        border: { display: false }
      },
      y: {
        grid:   { color: c.grid, drawBorder: false },
        ticks:  { color: c.text, font: { family: "'DM Sans', sans-serif", size: 12 } },
        border: { display: false }
      }
    }, extraScales || {})
  };
}

function showChartOrEmpty(canvasId, emptyId, hasData) {
  var canvas = document.getElementById(canvasId);
  var empty  = document.getElementById(emptyId);
  if (canvas) canvas.style.display = hasData ? 'block' : 'none';
  if (empty)  empty.style.display  = hasData ? 'none'  : 'flex';
}

function barColors(count) {
  return Array.from({ length: count }, function (_, i) {
    return 'rgba(90, 158, 111, ' + Math.max(0.28, 1 - i * 0.14) + ')';
  });
}

function renderRevenueChart(d) {
  destroyChart('revenue');
  if (!d || !d.data) { showChartOrEmpty('chart-revenue', 'empty-revenue', false); return; }
  var hasData = d.data.some(function (v) { return v > 0; });
  showChartOrEmpty('chart-revenue', 'empty-revenue', hasData);
  if (!hasData) return;

  var c = chartColors();
  var opts = baseOptions();
  opts.plugins.tooltip.callbacks.label = function (ctx) { return ' ' + formatPeso(ctx.parsed.y); };
  opts.scales.y.ticks.callback = function (v) { return v >= 1000 ? '₱' + (v / 1000).toFixed(1) + 'k' : '₱' + v; };

  chartInstances['revenue'] = new Chart(
    document.getElementById('chart-revenue').getContext('2d'), {
      type: 'line',
      data: {
        labels: d.labels,
        datasets: [{
          data: d.data,
          borderColor: c.primary,
          backgroundColor: c.primaryFill,
          borderWidth: 2,
          pointBackgroundColor: c.primary,
          pointRadius: d.labels.length > 20 ? 2 : 4,
          pointHoverRadius: 6,
          fill: true,
          tension: 0.4
        }]
      },
      options: opts
    }
  );
}

function renderTopRevenueChart(d) {
  destroyChart('top-revenue');
  if (!d || !d.data) { showChartOrEmpty('chart-top-revenue', 'empty-top-revenue', false); return; }
  var hasData = d.data.length > 0;
  showChartOrEmpty('chart-top-revenue', 'empty-top-revenue', hasData);
  if (!hasData) return;

  var opts = baseOptions();
  opts.indexAxis = 'y';
  opts.plugins.tooltip.callbacks.label = function (ctx) { return ' ' + formatPeso(ctx.parsed.x); };
  opts.scales.x.ticks.callback = function (v) { return v >= 1000 ? '₱' + (v / 1000).toFixed(1) + 'k' : '₱' + v; };

  chartInstances['top-revenue'] = new Chart(
    document.getElementById('chart-top-revenue').getContext('2d'), {
      type: 'bar',
      data: {
        labels: d.labels,
        datasets: [{ data: d.data, backgroundColor: barColors(d.data.length), borderRadius: 6, borderSkipped: false }]
      },
      options: opts
    }
  );
}

function renderTopQtyChart(d) {
  destroyChart('top-qty');
  if (!d || !d.data) { showChartOrEmpty('chart-top-qty', 'empty-top-qty', false); return; }
  var hasData = d.data.length > 0;
  showChartOrEmpty('chart-top-qty', 'empty-top-qty', hasData);
  if (!hasData) return;

  var opts = baseOptions();
  opts.indexAxis = 'y';
  opts.plugins.tooltip.callbacks.label = function (ctx) { return ' ' + ctx.parsed.x + ' units'; };
  opts.scales.x.ticks.callback = function (v) { return v + ' units'; };

  chartInstances['top-qty'] = new Chart(
    document.getElementById('chart-top-qty').getContext('2d'), {
      type: 'bar',
      data: {
        labels: d.labels,
        datasets: [{ data: d.data, backgroundColor: barColors(d.data.length), borderRadius: 6, borderSkipped: false }]
      },
      options: opts
    }
  );
}

function renderDayOfWeekChart(d) {
  destroyChart('by-day');
  if (!d || !d.data) { showChartOrEmpty('chart-by-day', 'empty-by-day', false); return; }
  var hasData = d.data.some(function (v) { return v > 0; });
  showChartOrEmpty('chart-by-day', 'empty-by-day', hasData);
  if (!hasData) return;

  var c = chartColors();
  var max = Math.max.apply(null, d.data);
  var opts = baseOptions();
  opts.plugins.tooltip.callbacks.label = function (ctx) { return ' ' + formatPeso(ctx.parsed.y); };
  opts.scales.y.ticks.callback = function (v) { return v >= 1000 ? '₱' + (v / 1000).toFixed(1) + 'k' : '₱' + v; };

  chartInstances['by-day'] = new Chart(
    document.getElementById('chart-by-day').getContext('2d'), {
      type: 'bar',
      data: {
        labels: d.labels,
        datasets: [{
          data: d.data,
          backgroundColor: d.data.map(function (v) { return v === max ? c.primary : 'rgba(90, 158, 111, 0.40)'; }),
          borderRadius: 6,
          borderSkipped: false
        }]
      },
      options: opts
    }
  );
}

// ── Heatmap ──

var HEATMAP_CELL   = 13;
var HEATMAP_GAP    = 3;
var HEATMAP_MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

var _heatmapMouseMove  = null;
var _heatmapMouseLeave = null;

function renderHeatmap(dayRevenue) {
  var cellsEl  = document.getElementById('heatmap-cells');
  var monthsEl = document.getElementById('heatmap-months');
  var tooltip  = document.getElementById('heatmap-tooltip');
  if (!cellsEl) return;

  if (_heatmapMouseMove)  cellsEl.removeEventListener('mousemove',  _heatmapMouseMove);
  if (_heatmapMouseLeave) cellsEl.removeEventListener('mouseleave', _heatmapMouseLeave);

  dayRevenue = dayRevenue || {};

  var nonZero = Object.values(dayRevenue)
    .filter(function (v) { return v > 0; })
    .sort(function (a, b) { return a - b; });
  var q1 = nonZero[Math.floor(nonZero.length * 0.25)] || 1;
  var q2 = nonZero[Math.floor(nonZero.length * 0.50)] || 2;
  var q3 = nonZero[Math.floor(nonZero.length * 0.75)] || 3;

  function level(v) {
    if (!v) return 0;
    if (v <= q1) return 1;
    if (v <= q2) return 2;
    if (v <= q3) return 3;
    return 4;
  }

  var today     = new Date();
  var todayEnd  = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59);
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
        monthLabels.push({ label: HEATMAP_MONTHS[m], weekIndex: weeks.length });
        lastMonth = m;
      }
      var rev = dayRevenue[key] || 0;
      week.push({ date: new Date(cur), key: key, revenue: rev, level: level(rev) });
      cur.setDate(cur.getDate() + 1);
    }
    weeks.push(week);
  }

  if (monthsEl) {
    monthsEl.innerHTML = '';
    monthLabels.forEach(function (ml, i) {
      var nextIdx = i + 1 < monthLabels.length ? monthLabels[i + 1].weekIndex : weeks.length;
      var width   = (nextIdx - ml.weekIndex) * (HEATMAP_CELL + HEATMAP_GAP);
      var span    = document.createElement('span');
      span.textContent  = ml.label;
      span.style.cssText =
        'display:inline-block;min-width:' + width + 'px;' +
        'font-size:11px;color:var(--color-text-muted);overflow:hidden;flex-shrink:0;';
      monthsEl.appendChild(span);
    });
  }

  cellsEl.innerHTML = '';
  weeks.forEach(function (week) {
    var weekEl = document.createElement('div');
    weekEl.className = 'heatmap-week';
    week.forEach(function (day) {
      var cell = document.createElement('div');
      cell.className = 'heatmap-cell';
      cell.setAttribute('data-level', day.level === -1 ? 'empty' : day.level);
      if (day.date && day.level !== -1) {
        cell.dataset.date    = day.key;
        cell.dataset.revenue = day.revenue;
        var d2      = new Date(day.key + 'T00:00:00');
        var dStr    = d2.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
        var revStr  = day.revenue > 0 ? formatPeso(day.revenue) + ' in sales' : 'No sales';
        cell.setAttribute('aria-label', dStr + ': ' + revStr);
        cell.setAttribute('role', 'gridcell');
        cell.setAttribute('tabindex', '0');
      }
      weekEl.appendChild(cell);
    });
    cellsEl.appendChild(weekEl);
  });

  if (tooltip) {
    _heatmapMouseMove = function (e) {
      var cell = e.target.closest('.heatmap-cell');
      if (!cell || !cell.dataset.date) { tooltip.style.display = 'none'; return; }
      var d2      = new Date(cell.dataset.date + 'T00:00:00');
      var dateStr = d2.toLocaleDateString('en-PH', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' });
      var rev     = parseFloat(cell.dataset.revenue) || 0;

      tooltip.querySelector('.heatmap-tooltip-date').textContent  = dateStr;
      tooltip.querySelector('.heatmap-tooltip-value').textContent =
        rev > 0 ? formatPeso(rev) + ' in sales' : 'No sales';
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
    };

    _heatmapMouseLeave = function () { tooltip.style.display = 'none'; };

    cellsEl.addEventListener('mousemove',  _heatmapMouseMove);
    cellsEl.addEventListener('mouseleave', _heatmapMouseLeave);
  }

  var scrollArea = cellsEl.closest('.heatmap-scroll-area');
  if (scrollArea) scrollArea.scrollLeft = scrollArea.scrollWidth;
}

// ── Chart data transformers (API → { labels, data }) ──

function _toRevenueChart(revenueByDay) {
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

function _toTopRevenue(arr) {
  if (!Array.isArray(arr) || !arr.length) return { labels: [], data: [] };
  return { labels: arr.map(function (e) { return e.name; }), data: arr.map(function (e) { return e.revenue; }) };
}

function _toTopQty(arr) {
  if (!Array.isArray(arr) || !arr.length) return { labels: [], data: [] };
  return { labels: arr.map(function (e) { return e.name; }), data: arr.map(function (e) { return e.qty; }) };
}

var _DOW_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
function _toDayOfWeek(arr) {
  if (!Array.isArray(arr)) return { labels: _DOW_LABELS, data: [0, 0, 0, 0, 0, 0, 0] };
  return { labels: _DOW_LABELS, data: arr };
}

// ── Main render ──

async function renderAll() {
  var range   = getDateRange(currentRange);
  // Backend _parseFrom/_parseTo expect YYYY-MM-DD, not full ISO strings
  var fromStr = range.from ? range.from.toISOString().slice(0, 10) : null;
  var toStr   = range.to   ? range.to.toISOString().slice(0, 10)   : null;

  try {
    var results = await Promise.all([
      getKPIs(fromStr, toStr),
      getCharts(fromStr, toStr),
      getHeatmap(),
      getProducts()
    ]);

    var kpiResult      = results[0];
    var chartResult    = results[1];
    var heatmapResult  = results[2];
    var productsResult = results[3];

    if (kpiResult && kpiResult.success) {
      updateKPIs(kpiResult.data);
    } else if (kpiResult && !kpiResult.success) {
      showApiError(kpiResult.message || 'Failed to load KPIs.');
    }

    if (heatmapResult && heatmapResult.success) {
      renderHeatmap(heatmapResult.data);
    }

    if (chartResult && chartResult.success) {
      var cd = chartResult.data;
      renderRevenueChart(_toRevenueChart(cd.revenueByDay));
      renderTopRevenueChart(_toTopRevenue(cd.topByRevenue));
      renderTopQtyChart(_toTopQty(cd.topByQty));
      renderDayOfWeekChart(_toDayOfWeek(cd.byDayOfWeek));
    } else if (chartResult && !chartResult.success) {
      showApiError(chartResult.message || 'Failed to load chart data.');
    }

    if (productsResult && productsResult.success) {
      updateInventoryKPIs(productsResult.data || []);
    }
  } catch (err) {
    showApiError('Network error. Is the server running?');
  }

  if (typeof lucide !== 'undefined') lucide.createIcons();
}

// ── Date preset buttons ──

function attachDatePresetEvents() {
  document.querySelectorAll('.date-preset-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      document.querySelectorAll('.date-preset-btn').forEach(function (b) {
        b.classList.remove('is-active');
      });
      btn.classList.add('is-active');

      var range     = btn.dataset.range;
      currentRange  = range;
      var customRow = document.getElementById('custom-date-row');
      if (customRow) customRow.style.display = range === 'custom' ? 'flex' : 'none';
      if (range !== 'custom') renderAll();
    });
  });

  var applyBtn = document.getElementById('apply-custom-range');
  if (applyBtn) {
    applyBtn.addEventListener('click', function () {
      var fromVal = document.getElementById('analytics-from').value;
      var toVal   = document.getElementById('analytics-to').value;
      var errorEl = document.getElementById('custom-date-error');

      if (!fromVal || !toVal) {
        if (errorEl) errorEl.textContent = 'Please select both a start and end date.';
        return;
      }
      if (fromVal > toVal) {
        if (errorEl) errorEl.textContent = 'Start date must be before or equal to end date.';
        return;
      }
      if (errorEl) errorEl.textContent = '';

      customFrom   = new Date(fromVal + 'T00:00:00');
      customTo     = new Date(toVal   + 'T23:59:59');
      currentRange = 'custom';

      document.querySelectorAll('.date-preset-btn').forEach(function (b) {
        b.classList.toggle('is-active', b.dataset.range === 'custom');
      });

      renderAll();
    });
  }
}

// ── Window resize ──

var _resizeTimer;
window.addEventListener('resize', function () {
  clearTimeout(_resizeTimer);
  _resizeTimer = setTimeout(function () {
    Object.keys(chartInstances).forEach(function (id) {
      if (chartInstances[id]) chartInstances[id].resize();
    });
  }, 200);
});

// ── Theme change ──

var _themeTimer;
var themeObserver = new MutationObserver(function () {
  clearTimeout(_themeTimer);
  _themeTimer = setTimeout(renderAll, 200);
});
themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

// ── Init ──

document.addEventListener('DOMContentLoaded', function () {
  initPinToggles();
  renderAll();
  attachDatePresetEvents();
});
