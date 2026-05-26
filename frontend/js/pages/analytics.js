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

    case 'last-month': {
      // Previous calendar month: 1st of last month → last day of last month.
      // More useful to MSME owners than a rolling 30-day window because it
      // matches monthly rent / payroll / capital cycles.
      var lmStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      var lmEnd   = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
      return { from: lmStart, to: lmEnd };
    }

    case 'custom':
      return { from: customFrom, to: customTo };

    default:
      return { from: null, to: null };
  }
}

// ── KPI display ──

// Compute % delta between current and previous, with sane handling of zero base.
function pctDelta(current, previous) {
  current  = Number(current)  || 0;
  previous = Number(previous) || 0;
  if (previous === 0) {
    if (current === 0) return { pct: 0,         dir: 'flat', noBaseline: true };
    return                     { pct: null,      dir: 'up',   noBaseline: true };
  }
  var pct = ((current - previous) / previous) * 100;
  var dir = pct > 0.5 ? 'up' : pct < -0.5 ? 'down' : 'flat';
  return { pct: pct, dir: dir, noBaseline: false };
}

// Renders the delta chip on a KPI card. `inverted = true` means "down is good"
// (used for things like cost ratios; we don't have any yet but kept for clarity).
function setDelta(elementId, delta, opts) {
  var el = document.getElementById(elementId);
  if (!el) return;
  opts = opts || {};
  var dir = delta.dir;
  var label;

  if (delta.noBaseline && delta.pct === null) {
    label = 'new vs previous period';
    dir   = 'up';
  } else if (delta.noBaseline) {
    label = 'no prior data';
    dir   = 'flat';
  } else if (Math.abs(delta.pct) < 0.5) {
    label = 'flat vs previous period';
    dir   = 'flat';
  } else {
    var arrow = dir === 'up' ? '▲' : '▼';
    label = arrow + ' ' + Math.abs(delta.pct).toFixed(1) + '% vs previous period';
  }

  // Visual semantics flip if `inverted` is true.
  var visualDir = opts.inverted && dir !== 'flat' ? (dir === 'up' ? 'down' : 'up') : dir;
  el.dataset.dir = visualDir;
  el.textContent = label;
}

function updateKPIs(kpis) {
  document.getElementById('kpi-revenue').textContent      = formatPeso(kpis.totalRevenue || 0);
  document.getElementById('kpi-transactions').textContent = kpis.transactionCount || 0;
  document.getElementById('kpi-avg-order').textContent    = formatPeso(kpis.avgOrderValue || 0);
  document.getElementById('kpi-units').textContent        = kpis.totalUnits || 0;

  var prev = kpis.previous || {};
  setDelta('kpi-revenue-delta',      pctDelta(kpis.totalRevenue,     prev.totalRevenue));
  setDelta('kpi-transactions-delta', pctDelta(kpis.transactionCount, prev.transactionCount));
  setDelta('kpi-avg-order-delta',    pctDelta(kpis.avgOrderValue,    prev.avgOrderValue));
  setDelta('kpi-units-delta',        pctDelta(kpis.totalUnits,       prev.totalUnits));
}

function updateProfitKPIs(profit) {
  var gpEl     = document.getElementById('kpi-gross-profit');
  var marginEl = document.getElementById('kpi-margin');
  if (gpEl)     gpEl.textContent     = formatPeso(profit.grossProfit || 0);
  if (marginEl) marginEl.textContent = ((profit.margin || 0).toFixed(1)) + '%';

  var prev = profit.previous || {};
  setDelta('kpi-gross-profit-delta', pctDelta(profit.grossProfit, prev.grossProfit));
  // Margin is a percentage already — show its absolute change in points.
  var marginPts = (profit.margin || 0) - (prev.margin || 0);
  var marginEl2 = document.getElementById('kpi-margin-delta');
  if (marginEl2) {
    if ((prev.margin == null || (prev.margin === 0 && (profit.margin || 0) === 0))) {
      marginEl2.dataset.dir = 'flat';
      marginEl2.textContent = 'no prior data';
    } else if (Math.abs(marginPts) < 0.1) {
      marginEl2.dataset.dir = 'flat';
      marginEl2.textContent = 'flat vs previous period';
    } else {
      marginEl2.dataset.dir = marginPts > 0 ? 'up' : 'down';
      marginEl2.textContent = (marginPts > 0 ? '▲ +' : '▼ ') + marginPts.toFixed(1) + ' pts vs previous period';
    }
  }
}

function updateInventoryKPIs(products) {
  var totalAssets = products.reduce(function (sum, p) { return sum + (p.cost || 0) * (p.stock || 0); }, 0);
  // Potential margin if all current inventory were sold at current price
  var inventoryMargin = products.reduce(function (sum, p) { return sum + ((p.price || 0) - (p.cost || 0)) * (p.stock || 0); }, 0);
  var elAssets = document.getElementById('kpi-total-assets');
  var elProfit = document.getElementById('kpi-calc-profit');
  if (elAssets) elAssets.textContent = formatPeso(totalAssets);
  if (elProfit) elProfit.textContent = formatPeso(inventoryMargin);
}

// ── Health Badge ──
// Plain-English health summary computed from the period deltas + margin trend.
// Tiers: healthy / steady / watch / warning — picked by a simple rules engine.

function renderHealthBadge(kpis, profit) {
  var badge   = document.getElementById('health-badge');
  var titleEl = document.getElementById('health-badge-title');
  var detailEl = document.getElementById('health-badge-detail');
  if (!badge || !titleEl || !detailEl) return;

  var prevK = kpis.previous || {};
  var prevP = profit && profit.previous ? profit.previous : {};

  var revenueDelta = pctDelta(kpis.totalRevenue, prevK.totalRevenue);
  var profitDelta  = profit ? pctDelta(profit.grossProfit, prevP.grossProfit) : { dir: 'flat' };
  var marginPts    = profit ? (profit.margin || 0) - (prevP.margin || 0) : 0;

  // No data yet for this period
  if (!kpis.totalRevenue && !prevK.totalRevenue) {
    badge.dataset.state = 'idle';
    titleEl.textContent  = 'No sales yet in this period';
    detailEl.textContent = 'Once you record sales, you\'ll see a quick health summary here.';
    badge.hidden = false;
    return;
  }

  var state, title, detail;

  // Warning: revenue down >10% OR margin dropped >3 points
  if ((!revenueDelta.noBaseline && revenueDelta.pct !== null && revenueDelta.pct <= -10)
       || marginPts <= -3) {
    state  = 'warning';
    title  = 'Needs attention';
    var reasons = [];
    if (revenueDelta.pct !== null && revenueDelta.pct <= -10) reasons.push('sales down ' + Math.abs(revenueDelta.pct).toFixed(0) + '%');
    if (marginPts <= -3) reasons.push('profit margin dropped ' + Math.abs(marginPts).toFixed(1) + ' pts');
    detail = reasons.join(' and ') + ' vs previous period.';
  }
  // Watch: revenue down 3–10% OR margin down 1–3 points OR mixed signals
  else if ((!revenueDelta.noBaseline && revenueDelta.pct !== null && revenueDelta.pct <= -3)
            || marginPts <= -1
            || (revenueDelta.dir === 'up' && profitDelta.dir === 'down')) {
    state  = 'watch';
    title  = 'Worth a look';
    if (revenueDelta.dir === 'up' && profitDelta.dir === 'down') {
      detail = 'Sales are up but profit isn\'t — costs or product mix may have shifted.';
    } else if (marginPts <= -1) {
      detail = 'Profit margin is slightly down (' + marginPts.toFixed(1) + ' pts vs previous period).';
    } else {
      detail = 'Sales are down ' + Math.abs(revenueDelta.pct).toFixed(0) + '% vs previous period.';
    }
  }
  // Healthy: revenue up >5% AND profit not down
  else if (!revenueDelta.noBaseline && revenueDelta.pct !== null && revenueDelta.pct >= 5
            && profitDelta.dir !== 'down') {
    state  = 'healthy';
    title  = 'Healthy';
    detail = 'Sales up ' + revenueDelta.pct.toFixed(0) + '%'
           + (profit && profit.margin ? ', profit margin at ' + profit.margin.toFixed(1) + '%' : '')
           + ' vs previous period.';
  }
  // Steady: everything close to flat
  else {
    state  = 'steady';
    title  = 'Steady';
    if (revenueDelta.noBaseline) {
      detail = 'First period of data — keep recording sales to see trend comparisons.';
    } else {
      detail = 'Performance is roughly in line with the previous period.';
    }
  }

  badge.dataset.state  = state;
  titleEl.textContent  = title;
  detailEl.textContent = detail;
  badge.hidden = false;
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
      var key = toManilaDate(cur);
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

// ── Helpers ──

var _manilaFmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' });
function toManilaDate(d) { return _manilaFmt.format(d); }

// ── Main render ──

// Range-key label for the Cashflow card pill — keeps the user oriented
// when they change the date filter.
function cashflowWindowLabel(rangeKey) {
  switch (rangeKey) {
    case 'today':       return 'Today';
    case 'this-week':   return 'This week';
    case 'this-month':  return 'This month';
    case 'last-month':  return 'Last month';
    case 'custom':      return 'Custom range';
    default:            return 'Selected period';
  }
}

async function renderAll() {
  var range   = getDateRange(currentRange);
  // Convert to Manila local date strings (YYYY-MM-DD) — never toISOString() which is UTC
  var fromStr = range.from ? toManilaDate(range.from) : null;
  var toStr   = range.to   ? toManilaDate(range.to)   : null;

  var advancedOn = isAdvancedEnabled();

  // Show skeletons for Tier 2 widgets while their data is in flight.
  if (advancedOn) {
    setCashflowState('loading');
    setInventoryHealthState('loading');
    setGoalState('loading');
  }

  // Update the cashflow window pill to match the current selection.
  var cfPill = document.getElementById('cf-window-pill');
  if (cfPill) cfPill.textContent = cashflowWindowLabel(currentRange);

  try {
    var calls = [
      getKPIs(fromStr, toStr),
      getCharts(fromStr, toStr),
      getHeatmap(),
      getProducts(),
      getProfit(fromStr, toStr),
    ];
    if (advancedOn) {
      calls.push(getFinanceSummary({ from: fromStr, to: toStr }));
      calls.push(getInventoryHealth());
      calls.push(getGoalProjection());
    }

    var results = await Promise.all(calls);
    var kpiResult        = results[0];
    var chartResult      = results[1];
    var heatmapResult    = results[2];
    var productsResult   = results[3];
    var profitResult     = results[4];
    var financeResult    = advancedOn ? results[5] : null;
    var inventoryResult  = advancedOn ? results[6] : null;
    var projectionResult = advancedOn ? results[7] : null;

    if (kpiResult && kpiResult.success) {
      updateKPIs(kpiResult.data);
    } else if (kpiResult && !kpiResult.success) {
      showApiError(kpiResult.message || 'Failed to load KPIs.');
    }

    if (profitResult && profitResult.success) {
      updateProfitKPIs(profitResult.data);
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

    // Health badge needs both KPIs and profit
    if (kpiResult && kpiResult.success) {
      renderHealthBadge(
        kpiResult.data,
        profitResult && profitResult.success ? profitResult.data : null
      );
    }

    if (advancedOn) {
      // Cashflow
      if (financeResult && financeResult.success) {
        renderCashflowPanel(financeResult.data);
        setCashflowState('ready');
      } else {
        setCashflowState('error');
      }
      // Inventory Health
      if (inventoryResult && inventoryResult.success) {
        renderInventoryHealth(inventoryResult.data);
        setInventoryHealthState('ready');
      } else {
        setInventoryHealthState('error');
      }
      // Goal projection
      if (projectionResult && projectionResult.success) {
        renderGoalProgress(projectionResult.data);
        setGoalState('ready');
      } else {
        setGoalState('error');
      }
    }
  } catch (err) {
    showApiError('Network error. Is the server running?');
    if (advancedOn) {
      setCashflowState('error');
      setInventoryHealthState('error');
      setGoalState('error');
    }
  }

  if (typeof lucide !== 'undefined') lucide.createIcons();
}

// ── Tier 2 loading / error state helpers ──
// Each widget has three visible regions: skeleton, body, error.
// The state setter flips the right region on, the rest off.

function setCashflowState(state) {
  var body  = document.getElementById('cashflow-body');
  var skel  = document.getElementById('cashflow-skeleton');
  var err   = document.getElementById('cashflow-error');
  if (!body || !skel || !err) return;
  body.hidden = state !== 'ready';
  skel.hidden = state !== 'loading';
  err.hidden  = state !== 'error';
}

function setInventoryHealthState(state) {
  var content = document.getElementById('ih-content');
  var headline = document.getElementById('ih-headline');
  var skel    = document.getElementById('ih-skeleton');
  var err     = document.getElementById('ih-error');
  var tabs    = document.getElementById('ih-tabs');
  if (!content || !skel || !err) return;
  content.hidden  = state !== 'ready';
  if (headline) headline.hidden = state !== 'ready';
  skel.hidden     = state !== 'loading';
  err.hidden      = state !== 'error';
  if (tabs) tabs.hidden = state === 'error';
}

function setGoalState(state) {
  var skel    = document.getElementById('goal-skeleton');
  var empty   = document.getElementById('goal-empty');
  var wrap    = document.getElementById('goal-progress-wrap');
  var err     = document.getElementById('goal-error');
  if (!skel || !err) return;

  if (state === 'loading') {
    skel.hidden  = false;
    if (empty) empty.hidden = true;
    if (wrap)  wrap.hidden  = true;
    err.hidden   = true;
  } else if (state === 'error') {
    skel.hidden  = true;
    if (empty) empty.hidden = true;
    if (wrap)  wrap.hidden  = true;
    err.hidden   = false;
  } else {
    // 'ready' — visibility of empty vs wrap is decided by renderGoalProgress
    skel.hidden  = true;
    err.hidden   = true;
  }
}

// ── Date preset buttons ──

function attachDatePresetEvents() {
  // Cap the custom date inputs at today — analytics for future dates
  // makes no sense and would just return empty results.
  var today    = toManilaDate(new Date());
  var fromIn   = document.getElementById('analytics-from');
  var toIn     = document.getElementById('analytics-to');
  if (fromIn) fromIn.max = today;
  if (toIn)   toIn.max   = today;

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

// ── Collapsible heatmap ──

function initCollapsibleHeatmap() {
  var toggle  = document.getElementById('heatmap-toggle');
  var content = document.getElementById('heatmap-content');
  if (!toggle || !content) return;

  // First-visit default: collapsed. Otherwise honor user's last choice.
  var stored = localStorage.getItem('analyticsHeatmapOpen');
  var open   = stored === 'true'; // default false (collapsed) for new users
  applyHeatmapState(open);

  toggle.addEventListener('click', function () {
    open = !open;
    applyHeatmapState(open);
    localStorage.setItem('analyticsHeatmapOpen', String(open));
  });

  function applyHeatmapState(isOpen) {
    toggle.setAttribute('aria-expanded', String(isOpen));
    content.hidden = !isOpen;
    // Rotation is driven by CSS keyed to aria-expanded — see analytics.css.
    // (Inline style would be wiped when lucide.createIcons() replaces the <i> with <svg>.)
  }
}

// ── Advanced Analytics gate ──

function getCurrentUserId() {
  try {
    var u = JSON.parse(localStorage.getItem('currentUser') || 'null');
    return u && u.id ? String(u.id) : null;
  } catch (_) { return null; }
}

function loadUserPrefsLocal() {
  var uid = getCurrentUserId();
  if (!uid) return {};
  try { return JSON.parse(localStorage.getItem('prefs_' + uid) || '{}'); }
  catch (_) { return {}; }
}

function isAdvancedEnabled() {
  return loadUserPrefsLocal().advancedAnalytics === true;
}

function applyAdvancedMode() {
  var on = isAdvancedEnabled();
  document.querySelectorAll('.advanced-only').forEach(function (el) {
    el.hidden = !on;
  });
}

// ── Cashflow Snapshot ──
// Reframed to surface what a non-technical owner actually needs to see:
//   primary line  →  Money Out, Net, Utang Balance
//   secondary     →  Money In (duplicates the Total Revenue KPI most of
//                    the time, so it sits below the headlines, not above)
// A plain-English hint generated from the data tells the owner what to
// do next — that's what turns analytics into a decision tool.

function renderCashflowPanel(summary) {
  var outEl   = document.getElementById('cf-money-out');
  var netEl   = document.getElementById('cf-net');
  var debtEl  = document.getElementById('cf-debt');
  var inEl    = document.getElementById('cf-money-in');
  var barIn   = document.getElementById('cf-bar-in');
  var barOut  = document.getElementById('cf-bar-out');
  var emptyEl = document.getElementById('cashflow-empty');
  var hintEl  = document.getElementById('cashflow-hint');
  if (!outEl || !netEl || !debtEl || !inEl) return;

  var moneyIn  = Number(summary.moneyIn)     || 0;
  var moneyOut = Number(summary.moneyOut)    || 0;
  var net      = Number(summary.net);
  if (isNaN(net)) net = moneyIn - moneyOut;
  var debt     = Number(summary.debtBalance) || 0;

  outEl.textContent  = formatPeso(moneyOut);
  netEl.textContent  = formatPeso(net);
  debtEl.textContent = formatPeso(debt);
  inEl.textContent   = formatPeso(moneyIn);

  // Tag the Net tile by sign so CSS can color the value red/green
  var netParent = netEl.parentElement;
  if (netParent) netParent.dataset.netSign = net >= 0 ? 'positive' : 'negative';

  // Debt-balance tile: only visually emphasize when there's actual utang
  var debtParent = debtEl.parentElement;
  if (debtParent) debtParent.dataset.debtState = debt > 0 ? 'has-debt' : 'clear';

  var total = moneyIn + moneyOut;
  if (barIn && barOut) {
    if (total === 0) {
      barIn.style.width  = '0%';
      barOut.style.width = '0%';
    } else {
      barIn.style.width  = ((moneyIn  / total) * 100).toFixed(2) + '%';
      barOut.style.width = ((moneyOut / total) * 100).toFixed(2) + '%';
    }
  }

  if (emptyEl) emptyEl.hidden = total > 0;

  // ── Plain-English "what this means" ──
  // Priority: warn about negative net first, then debt, then steady state.
  if (hintEl) {
    var hint = '';
    if (total === 0) {
      hint = '';   // empty state already shown above
    } else if (net < 0) {
      var shortBy = Math.abs(net);
      hint = '⚠ You spent ' + formatPeso(shortBy) + ' more than you earned this period. '
           + 'Check the Finance page to see where most of the money went.';
    } else if (debt > 0 && net > 0 && net >= debt * 0.10) {
      // Owner has profit AND outstanding utang ≥ 10x this period's net.
      // Suggest paying down debt while they have headroom.
      hint = 'You have ' + formatPeso(net) + ' net this period and ' + formatPeso(debt)
           + ' in outstanding utang. Setting aside part of your earnings for a debt payment now '
           + 'reduces what you owe.';
    } else if (net > 0) {
      hint = 'Net positive — you earned ' + formatPeso(net) + ' more than you spent this period.';
    } else {
      hint = 'Break-even period — money in matched money out.';
    }
    hintEl.textContent = hint;
    hintEl.hidden      = hint === '';
  }
}

// ── Inventory Health widget ──

var _ihData = null;
var _ihActiveTab = 'slow';

function renderInventoryHealth(data) {
  _ihData = data;
  paintInventoryHealthTab();
}

// Generates the headline insight + suggested action for the active tab.
// Returns { headline, tone } where tone is 'good' | 'warn' | 'info' so the
// banner can be styled appropriately.
function inventoryHealthHeadline(tab, data) {
  if (!data) return null;

  if (tab === 'slow') {
    var slow = data.slowMovers || [];
    if (slow.length === 0) {
      return { headline: 'All your stock is moving steadily. Nothing flagged as slow.', tone: 'good' };
    }
    return {
      headline: '<strong>' + slow.length + (slow.length === 1 ? ' product' : ' products')
              + '</strong> selling less than 1 unit per week. '
              + 'Consider promoting them, bundling with fast movers, or stop reordering.',
      tone: 'info',
    };
  }

  if (tab === 'dead') {
    var dead = data.deadStock || [];
    if (dead.length === 0) {
      return { headline: 'No dead stock — every product made at least one sale in the last 90 days.', tone: 'good' };
    }
    var tied = dead.reduce(function (sum, p) { return sum + (Number(p.tiedUpCapital) || 0); }, 0);
    return {
      headline: '<strong>' + formatPeso(tied) + '</strong> in capital is tied up across '
              + dead.length + (dead.length === 1 ? ' product' : ' products') + ' with no sales. '
              + 'A clearance price often recovers more than holding forever.',
      tone: 'warn',
    };
  }

  // turnover tab — flag urgent restock (days < 7) and overstock (days > 90)
  var turnover = data.turnover || [];
  if (turnover.length === 0) {
    return { headline: 'Not enough sales history yet to estimate days of stock for any product.', tone: 'info' };
  }
  var urgent = turnover.filter(function (p) { return p.daysOfStock != null && p.daysOfStock < 7; });
  var overstock = turnover.filter(function (p) { return p.daysOfStock != null && p.daysOfStock > 90; });
  var parts = [];
  if (urgent.length > 0) {
    parts.push('<strong>' + urgent.length + (urgent.length === 1 ? ' product' : ' products')
             + '</strong> will run out within a week');
  }
  if (overstock.length > 0) {
    parts.push('<strong>' + overstock.length + (overstock.length === 1 ? ' product' : ' products')
             + '</strong> with more than 90 days of stock');
  }
  if (parts.length === 0) {
    return { headline: 'Stock levels look balanced — no urgent restocks, no obvious overstocking.', tone: 'good' };
  }
  return {
    headline: parts.join(' · ') + '. Restock the urgent ones; review whether the overstocked ones are tying up too much capital.',
    tone: urgent.length > 0 ? 'warn' : 'info',
  };
}

function paintInventoryHealthTab() {
  if (!_ihData) return;
  var tbody    = document.getElementById('ih-tbody');
  var emptyEl  = document.getElementById('ih-empty');
  var colMetric = document.getElementById('ih-col-metric');
  var headlineEl = document.getElementById('ih-headline');
  if (!tbody) return;

  var rows = [];
  var metricLabel = 'Per week';
  if (_ihActiveTab === 'slow') {
    rows = _ihData.slowMovers || [];
    metricLabel = 'Per week';
  } else if (_ihActiveTab === 'dead') {
    rows = _ihData.deadStock || [];
    metricLabel = 'Tied-up cash';
  } else if (_ihActiveTab === 'turnover') {
    rows = (_ihData.turnover || []).slice().sort(function (a, b) {
      return (b.daysOfStock || 0) - (a.daysOfStock || 0);
    });
    metricLabel = 'Days of stock';
  }

  if (colMetric) colMetric.textContent = metricLabel;

  // Plain-English insight banner above the table — the "so what?".
  if (headlineEl) {
    var insight = inventoryHealthHeadline(_ihActiveTab, _ihData);
    if (insight) {
      headlineEl.innerHTML        = insight.headline;
      headlineEl.dataset.tone     = insight.tone;
      headlineEl.hidden           = false;
    } else {
      headlineEl.hidden = true;
    }
  }

  if (rows.length === 0) {
    tbody.innerHTML = '';
    if (emptyEl) {
      emptyEl.hidden = false;
      emptyEl.textContent = _ihActiveTab === 'dead'
        ? 'No dead stock — everything is moving.'
        : _ihActiveTab === 'slow'
        ? 'No slow-moving products. Nice.'
        : 'Not enough sales history to estimate days of stock yet.';
    }
    document.getElementById('ih-table').hidden = true;
    return;
  }

  if (emptyEl) emptyEl.hidden = true;
  document.getElementById('ih-table').hidden = false;

  var html = rows.map(function (r) {
    var metricVal;
    if (_ihActiveTab === 'slow') {
      metricVal = (r.weeklyRate || 0).toFixed(1);
    } else if (_ihActiveTab === 'dead') {
      metricVal = formatPeso(r.tiedUpCapital || 0);
    } else {
      metricVal = r.daysOfStock != null ? r.daysOfStock + ' days' : '—';
    }
    return '<tr>'
      + '<td class="ih-name">' + escapeHtml(r.name) + '</td>'
      + '<td class="ih-num">' + metricVal + '</td>'
      + '<td class="ih-num">' + r.stock + ' ' + escapeHtml(r.unit || '') + '</td>'
      + '</tr>';
  }).join('');
  tbody.innerHTML = html;
}

function initInventoryHealthTabs() {
  var tabs = document.querySelectorAll('.ih-tab');
  tabs.forEach(function (tab) {
    tab.addEventListener('click', function () {
      tabs.forEach(function (t) {
        t.classList.remove('is-active');
        t.setAttribute('aria-selected', 'false');
      });
      tab.classList.add('is-active');
      tab.setAttribute('aria-selected', 'true');
      _ihActiveTab = tab.dataset.tab;
      paintInventoryHealthTab();
    });
  });
}

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ── Monthly Revenue Goal ──
// Goal progress + projection now uses /api/analytics/projection so the
// end-of-month estimate is based on a trailing-30-day daily-average
// baseline applied to the days remaining in the calendar month — far
// more honest than the previous "revenue / dayOfMonth × daysInMo" hack.

function getMonthlyGoal() {
  var v = loadUserPrefsLocal().monthlyRevenueGoal;
  v = parseFloat(v);
  return isNaN(v) || v <= 0 ? null : v;
}

function saveMonthlyGoal(amount) {
  var uid = getCurrentUserId();
  if (!uid) return;
  var prefs;
  try { prefs = JSON.parse(localStorage.getItem('prefs_' + uid) || '{}'); }
  catch (_) { prefs = {}; }
  if (amount == null || amount === '') {
    delete prefs.monthlyRevenueGoal;
  } else {
    prefs.monthlyRevenueGoal = amount;
  }
  localStorage.setItem('prefs_' + uid, JSON.stringify(prefs));
  // Best-effort sync to the backend so Account Settings + other devices
  // see the new goal. If the request fails we still have the local cache
  // — the next successful pref read will overwrite it from the server,
  // but until then the user sees their own edits.
  if (typeof savePreferences === 'function') {
    savePreferences(prefs).catch(function () { /* offline-tolerant */ });
  }
}

function renderGoalProgress(projection) {
  var emptyEl      = document.getElementById('goal-empty');
  var progressWrap = document.getElementById('goal-progress-wrap');
  if (!emptyEl || !progressWrap || !projection) return;

  var goal = getMonthlyGoal();
  if (!goal) {
    emptyEl.hidden      = false;
    progressWrap.hidden = true;
    return;
  }

  var revenue       = Number(projection.currentMonth && projection.currentMonth.revenue) || 0;
  var projected     = Number(projection.projection) || 0;
  var limitedData   = projection.limitedData === true;
  var daysRemaining = Number(projection.daysRemaining) || 0;

  var pct     = (revenue   / goal) * 100;
  var projPct = (projected / goal) * 100;

  document.getElementById('goal-achieved').textContent   = formatPeso(revenue);
  document.getElementById('goal-target').textContent     = formatPeso(goal);
  document.getElementById('goal-percent').textContent    = pct.toFixed(0) + '%';
  document.getElementById('goal-projection').textContent = formatPeso(projected);

  var bar = document.getElementById('goal-bar-fill');
  bar.style.width = Math.min(100, Math.max(0, pct)).toFixed(2) + '%';
  bar.dataset.state = pct >= 100 ? 'reached'
                    : projPct >= 100 ? 'ontrack'
                    : projPct >= 70  ? 'close'
                    : 'behind';

  var projMark = document.getElementById('goal-bar-projection');
  if (projected > 0 && projMark) {
    projMark.hidden = false;
    projMark.style.left = Math.min(100, projPct).toFixed(2) + '%';
    projMark.title = 'Projected end-of-month: ' + formatPeso(projected);
  } else if (projMark) {
    projMark.hidden = true;
  }

  var status = document.getElementById('goal-status');
  if (pct >= 100) {
    status.textContent = 'Goal reached! Anything beyond this is extra.';
  } else if (projPct >= 100) {
    status.textContent = 'On track — at your current pace, you\'ll hit your goal by end of month.';
  } else if (projPct >= 70) {
    status.textContent = 'Close — picking up the pace this week would get you across the line.';
  } else if (daysRemaining === 0) {
    status.textContent = 'Final results for the month — projection no longer applies.';
  } else {
    status.textContent = 'Behind pace — at the current rhythm, you\'ll finish at about '
                       + projPct.toFixed(0) + '% of the goal.';
  }

  var caveat = document.getElementById('goal-caveat');
  if (caveat) {
    if (limitedData) {
      caveat.textContent = 'Estimate based on limited sales history (less than 14 days). '
                         + 'The projection will get more accurate as you keep recording sales.';
      caveat.hidden      = false;
    } else {
      caveat.hidden = true;
    }
  }

  emptyEl.hidden      = true;
  progressWrap.hidden = false;
}

// ── Inline Goal Editor ──
// Replaces the previous "Set goal in Account Settings" cross-page nav.
// The same preference is written, so Account Settings and the Analytics
// page stay in sync.

function openGoalEditor() {
  var editor = document.getElementById('goal-editor');
  var input  = document.getElementById('goal-input-inline');
  var clear  = document.getElementById('goal-clear-inline');
  if (!editor || !input) return;

  var current = getMonthlyGoal();
  input.value = current != null ? current : '';

  // The Clear button is only useful when a goal already exists.
  if (clear) clear.hidden = current == null;

  editor.hidden = false;
  // Briefly defer focus so the field is fully painted before tab-trap.
  setTimeout(function () { input.focus(); input.select(); }, 0);
}

function closeGoalEditor() {
  var editor = document.getElementById('goal-editor');
  if (editor) editor.hidden = true;
}

function commitGoalFromEditor() {
  var input = document.getElementById('goal-input-inline');
  if (!input) return;

  var raw = input.value.trim();
  if (raw === '') {
    saveMonthlyGoal(null);
  } else {
    var n = parseFloat(raw);
    if (isNaN(n) || n < 0) { input.focus(); return; }
    saveMonthlyGoal(n);
  }
  closeGoalEditor();

  // Refresh the goal card with the new target — projection data hasn't
  // changed, so we just re-call renderAll to re-fetch projection cheaply.
  // (Re-rendering from a cached projection would also work; renderAll
  // keeps cashflow + IH in sync if the user has been away for a while.)
  renderAll();
}

function initGoalEditor() {
  var openBtn   = document.getElementById('goal-edit-btn');
  var emptyBtn  = document.getElementById('goal-empty-set');
  var saveBtn   = document.getElementById('goal-save-inline');
  var cancelBtn = document.getElementById('goal-cancel-inline');
  var clearBtn  = document.getElementById('goal-clear-inline');
  var retryBtn  = document.getElementById('goal-retry');
  var input     = document.getElementById('goal-input-inline');

  if (openBtn)   openBtn.addEventListener('click',   openGoalEditor);
  if (emptyBtn)  emptyBtn.addEventListener('click',  openGoalEditor);
  if (saveBtn)   saveBtn.addEventListener('click',   commitGoalFromEditor);
  if (cancelBtn) cancelBtn.addEventListener('click', closeGoalEditor);
  if (clearBtn)  clearBtn.addEventListener('click',  function () {
    saveMonthlyGoal(null);
    closeGoalEditor();
    renderAll();
  });
  if (retryBtn)  retryBtn.addEventListener('click',  renderAll);

  if (input) {
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter')   { e.preventDefault(); commitGoalFromEditor(); }
      if (e.key === 'Escape')  { closeGoalEditor(); }
    });
  }
}

// Wire retry buttons on the other Tier 2 cards.
function initTier2Retries() {
  var cfRetry = document.getElementById('cashflow-retry');
  var ihRetry = document.getElementById('ih-retry');
  if (cfRetry) cfRetry.addEventListener('click', renderAll);
  if (ihRetry) ihRetry.addEventListener('click', renderAll);
}

// ── Init ──

document.addEventListener('DOMContentLoaded', function () {
  initPinToggles();
  initCollapsibleHeatmap();
  initInventoryHealthTabs();
  initGoalEditor();
  initTier2Retries();
  applyAdvancedMode();
  renderAll();
  attachDatePresetEvents();
});
