checkAuth();

var currentUser = JSON.parse(localStorage.getItem('currentUser'));

var financeSummaryEl   = document.getElementById('finance-summary');
var financeTableBody   = document.getElementById('finance-table-body');
var financeTypeSelect  = document.getElementById('finance-type-select');
var addEntryButton     = document.getElementById('add-entry-button');
var financeActionsCol  = document.getElementById('finance-actions-col');

// Profit-card period selector options. The selector itself is rendered
// inside the Profit card on every renderSummary() pass; this constant is
// the source of truth for the option list.
var PROFIT_PERIOD_OPTIONS = [
  { value: 'all-time',      label: 'All Time'     },
  { value: 'this-month',    label: 'This Month'   },
  { value: 'last-month',    label: 'Last Month'   },
  { value: 'last-3-months', label: 'Last 3 Months' },
  { value: 'this-year',     label: 'This Year'    },
];

// Names the prior comparison window per period for the Profit trend subtitle.
// (The backend compares against the immediately-preceding equal-length window.)
var PROFIT_COMPARE_LABELS = {
  'this-month':    'vs last month',
  'last-month':    'vs the month before',
  'last-3-months': 'vs the prior 3 months',
  'this-year':     'vs last year',
};

var financeModal      = document.getElementById('finance-modal');
var closeFinanceModal = document.getElementById('close-finance-modal');
var financeForm       = document.getElementById('finance-form');
var financeModalTitle = document.getElementById('finance-modal-title');
var financeSubmitBtn  = document.getElementById('finance-submit');
var financeDateInput  = document.getElementById('finance-date');
var financeTypeInput  = document.getElementById('finance-type');
var financeCatInput   = document.getElementById('finance-category');
var financeAmountInput = document.getElementById('finance-amount');
var financeAmountLabel = document.getElementById('finance-amount-label');
var financeAmountHint  = document.getElementById('finance-amount-hint');
var financeNotesInput = document.getElementById('finance-notes');
var loanTermsBlock    = document.getElementById('loan-terms-block');
var financeMonthlyInput = document.getElementById('finance-monthly-due');
var financeTermInput  = document.getElementById('finance-term-months');
var loanTotalReadout  = document.getElementById('loan-total-readout');

var editingId   = null;
var currentPage = 1;
var PAGE_SIZE   = 20;

var _chartResizeObserver = null;
var _chartDrawSeq        = 0;

var TYPE_LABELS = {
  sales_revenue: 'Sales',
  capital_in:    'Capital In',
  capex:         'Capital Expense',
  owner_draw:    'Withdrawal',
  opex:          'Operating Expense',
};

// Matches README category conventions exactly.
// null → free-form (opex/capex: user types any category)
var CATEGORIES = {
  capital_in: [
    { value: 'own',      label: 'Own'      },
    { value: 'borrowed', label: 'Borrowed' },
  ],
  owner_draw: [
    { value: 'personal',     label: 'Personal'          },
    { value: 'debt_payment', label: 'Debt Payment'      },
    { value: 'restock',      label: 'Restock'           },
    { value: 'opex',         label: 'Operating Expense' },
    { value: 'other',        label: 'Other / Iba pa'    },
  ],
};

// Amount-field label hints — borrowed records the cash received (principal),
// not the total to repay; a debt payment records the installment paid.
var AMOUNT_LABELS = {
  'capital_in:borrowed':     'Amount received (₱)',
  'owner_draw:debt_payment': 'Payment amount (₱)',
};

function isAdmin() {
  return currentUser && currentUser.role === 'admin';
}

function formatPeso(amount) {
  return '₱' + Number(amount).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Store-local YYYY-MM-DD for `today` and date arithmetic. Avoids server-TZ
// drift (the same defensive pattern the backend uses in analytics.controller).
function _storeFmt() { return new Intl.DateTimeFormat('en-CA', { timeZone: getStoreTz() }); }
function manilaToday() { return _storeFmt().format(new Date()); }
function manilaFromUTC(d) { return _storeFmt().format(d); }

// Returns { from, to } for the named period. `from` / `to` are YYYY-MM-DD
// strings the backend Profit endpoint accepts. Default is 'all-time' so the
// page opens as a lifetime ledger; per-period comparisons live on Analytics.
function getPeriodRange(value) {
  var today = manilaToday();
  var year  = parseInt(today.slice(0, 4), 10);
  var month = parseInt(today.slice(5, 7), 10);

  if (value === 'this-month') {
    return { from: today.slice(0, 7) + '-01', to: today };
  }
  if (value === 'last-month') {
    var prevY = month === 1 ? year - 1 : year;
    var prevM = month === 1 ? 12       : month - 1;
    var prevFirst = prevY + '-' + String(prevM).padStart(2, '0') + '-01';
    // Last day of previous month = day 0 of current month (UTC noon avoids DST).
    var lastDayDate = new Date(Date.UTC(year, month - 1, 0, 12));
    return { from: prevFirst, to: manilaFromUTC(lastDayDate) };
  }
  if (value === 'last-3-months') {
    // First day of the month 2 months ago, inclusive → 3 calendar months total.
    var startDate = new Date(Date.UTC(year, month - 3, 1, 12));
    return { from: manilaFromUTC(startDate), to: today };
  }
  if (value === 'this-year') {
    return { from: year + '-01-01', to: today };
  }
  // Default: 'all-time'
  return { from: '1970-01-01', to: today };
}

function getActivePeriod() {
  var stored = localStorage.getItem('financePeriod') || 'all-time';
  return Object.assign({}, getPeriodRange(stored), { value: stored });
}


function renderSummary(data, profitData) {
  var net         = Number(data.net);
  var debtBalance = Number(data.debtBalance || 0);
  window._debtOutstanding = debtBalance;   // used to prefill the Record Payment modal
  var showDebt    = localStorage.getItem('financeDebtBalanceVisible') !== 'false';
  var debtClass   = debtBalance > 0 ? 'summary-card--debt summary-card--debt-active' : 'summary-card--debt';
  var debtTrend   = debtBalance > 0 ? 'Outstanding borrowed principal' : 'No outstanding debt';

  // Total Capital Invested — lifetime, broken into Own / Borrowed. Reads the
  // existing byType / byCategory aggregates from /summary; no extra fetch.
  // Own is derived as Total − Borrowed so the breakdown always reconciles to
  // the total: any capital_in not explicitly tagged 'borrowed' (incl.
  // uncategorized entries) counts as the owner's own money. Floored at 0.
  var capitalTotal    = Number((data.byType && data.byType.capital_in) || 0);
  var capitalBorrowed = Number((data.byCategory && data.byCategory.borrowed) || 0);
  var capitalOwn      = Math.max(0, capitalTotal - capitalBorrowed);

  var profitHtml = '';
  if (profitData) {
    var profit      = Number(profitData.profit);
    var prevProfit  = Number(profitData.previous && profitData.previous.profit) || 0;
    var prevRevenue = Number(profitData.previous && profitData.previous.revenue) || 0;
    var revenue     = Number(profitData.revenue) || 0;
    var margin      = Number(profitData.margin) || 0;
    var isAllTime   = profitData._isAllTime === true;
    var periodValue = localStorage.getItem('financePeriod') || 'all-time';
    var profitClass = profit >= 0 ? 'summary-card--profit summary-card--profit-positive'
                                   : 'summary-card--profit summary-card--profit-negative';

    // Subtitle: margin always leads (it's meaningful in every period). For a
    // bounded period whose prior window actually had activity, append a named
    // ↑/↓ trend. Margin is undefined without revenue, so handle no-sales cases.
    var subtitle;
    if (revenue === 0) {
      subtitle = profit === 0 ? 'No transactions in this period' : 'Expenses only — no sales';
    } else {
      subtitle = margin.toFixed(1) + '% margin';
      var priorHasActivity = prevRevenue > 0 || prevProfit !== 0;
      if (!isAllTime && priorHasActivity) {
        var delta     = profit - prevProfit;
        var deltaSign = delta >= 0 ? '↑' : '↓';
        var cmpLabel  = PROFIT_COMPARE_LABELS[periodValue] || 'vs prior period';
        subtitle += ' · ' + deltaSign + ' ' + formatPeso(Math.abs(delta)) + ' ' + cmpLabel;
      }
    }

    var currentPeriodValue = periodValue;
    var periodSelectHtml = '<select class="profit-period-select" id="profit-period-select" aria-label="Profit period">' +
      PROFIT_PERIOD_OPTIONS.map(function (o) {
        return '<option value="' + o.value + '"' + (o.value === currentPeriodValue ? ' selected' : '') + '>' + o.label + '</option>';
      }).join('') +
    '</select>';

    profitHtml =
      '<div class="summary-card ' + profitClass + '">' +
        '<div class="summary-card-header">' +
          '<span class="summary-label">Profit' +
            '<span class="profit-info-trigger" id="profit-info-trigger" tabindex="0" role="button" aria-label="What each period shows">' +
              '<i data-lucide="info"></i>' +
            '</span>' +
          '</span>' +
          periodSelectHtml +
        '</div>' +
        '<p class="summary-value">' + formatPeso(profit) + '</p>' +
        '<p class="summary-trend">' + subtitle + '</p>' +
      '</div>';
  }

  if (showDebt) {
    financeSummaryEl.classList.remove('finance-summary--debt-hidden');
  } else {
    financeSummaryEl.classList.add('finance-summary--debt-hidden');
  }

  financeSummaryEl.innerHTML =
    '<div class="summary-card summary-card--balance">' +
      '<div class="summary-card-header">' +
        '<span class="summary-label">Net Balance</span>' +
        '<div class="summary-icon"><i data-lucide="wallet"></i></div>' +
      '</div>' +
      '<p class="summary-value">' + formatPeso(net) + '</p>' +
      '<p class="summary-trend">Cash on hand · not the same as profit</p>' +
    '</div>' +
    profitHtml +
    (showDebt
      ? '<div class="summary-card ' + debtClass + '">' +
          '<div class="summary-card-header">' +
            '<span class="summary-label">Debt Balance</span>' +
            '<div class="summary-icon"><i data-lucide="landmark"></i></div>' +
          '</div>' +
          '<p class="summary-value">' + formatPeso(debtBalance) + '</p>' +
          '<p class="summary-trend">' + debtTrend + '</p>' +
          (debtBalance > 0 && isAdmin()
            ? '<button type="button" class="debt-pay-btn" id="debt-pay-btn">Pay Debt</button>'
            : '') +
        '</div>'
      : '') +
    '<div class="summary-card summary-card--capital">' +
      '<div class="summary-card-header">' +
        '<span class="summary-label">Total Capital</span>' +
        '<div class="summary-icon"><i data-lucide="piggy-bank"></i></div>' +
      '</div>' +
      '<p class="summary-value">' + formatPeso(capitalTotal) + '</p>' +
      '<p class="summary-trend">Own ' + formatPeso(capitalOwn) + ' · Borrowed ' + formatPeso(capitalBorrowed) + '</p>' +
    '</div>' +
    '<div class="summary-card summary-card--chart" id="cashflow-chart-card">' +
      '<div class="chart-card-header">' +
        '<span class="summary-label">Cumulative Cash Position</span>' +
        '<span class="chart-period-badge" id="chart-period-badge"></span>' +
      '</div>' +
      '<div class="chart-body" id="cashflow-chart-body"></div>' +
    '</div>';
  if (window.lucide) lucide.createIcons();

  // Wire the in-card Profit period selector. innerHTML replaces the prior
  // <select> on every render, so the listener is attached fresh each time.
  var profitPeriodEl = document.getElementById('profit-period-select');
  if (profitPeriodEl) {
    profitPeriodEl.addEventListener('change', function () {
      localStorage.setItem('financePeriod', profitPeriodEl.value);
      loadData();
    });
  }

  // Part A: Debt-card "Record Payment" shortcut → modal prefilled to pay down
  // the outstanding balance. Re-bound on every render alongside the card.
  var payBtn = document.getElementById('debt-pay-btn');
  if (payBtn) {
    payBtn.addEventListener('click', function () {
      openPayDebtModal();
    });
  }

  // The Profit info icon is re-created on every render, so re-bind it here.
  var infoTrigger = document.getElementById('profit-info-trigger');
  if (infoTrigger) wireProfitInfo(infoTrigger);
}

// ── Profit "what do the periods mean?" tooltip ──
// A body-level popover (avoids the summary card's overflow:hidden clipping),
// positioned with fixed coordinates on hover/focus — same approach as the
// dashboard items popover.

var PROFIT_INFO_HTML =
  '<strong class="pinfo-title">Profit by period</strong>' +
  '<p class="pinfo-lead">Sales − stock cost − expenses, for the period you pick.</p>' +
  '<ul class="pinfo-list">' +
    '<li><b>All Time</b> — since you started; includes earlier months, even loss-making ones</li>' +
    '<li><b>This Month</b> — 1st of this month to today</li>' +
    '<li><b>Last Month</b> — the previous full month</li>' +
    '<li><b>Last 3 Months</b> — the last three months</li>' +
    '<li><b>This Year</b> — January 1 to today</li>' +
  '</ul>' +
  '<p class="pinfo-foot">Margin = profit ÷ sales.</p>';

function positionProfitInfo(trigger) {
  var pop = document.getElementById('profit-info-pop');
  if (!pop) return;
  pop.innerHTML = PROFIT_INFO_HTML;
  pop.style.visibility = 'hidden';
  pop.classList.add('is-visible');           // measure with layout applied
  var t = trigger.getBoundingClientRect();
  var p = pop.getBoundingClientRect();
  var gap = 8;
  var top = t.bottom + gap;
  if (top + p.height > window.innerHeight - 8) top = Math.max(8, t.top - gap - p.height);
  var left = t.left;
  if (left + p.width > window.innerWidth - 8) left = window.innerWidth - 8 - p.width;
  if (left < 8) left = 8;
  pop.style.top  = top + 'px';
  pop.style.left = left + 'px';
  pop.style.visibility = '';
}

function showProfitInfo(trigger) { positionProfitInfo(trigger); }

function hideProfitInfo() {
  var pop = document.getElementById('profit-info-pop');
  if (pop) pop.classList.remove('is-visible');
}

function wireProfitInfo(trigger) {
  var isTouch = window.matchMedia('(hover: none) and (pointer: coarse)').matches;
  if (isTouch) {
    trigger.addEventListener('click', function (e) {
      e.stopPropagation();
      var pop = document.getElementById('profit-info-pop');
      if (pop && pop.classList.contains('is-visible')) hideProfitInfo();
      else showProfitInfo(trigger);
    });
  } else {
    trigger.addEventListener('mouseenter', function () { showProfitInfo(trigger); });
    trigger.addEventListener('mouseleave', hideProfitInfo);
    trigger.addEventListener('focus',      function () { showProfitInfo(trigger); });
    trigger.addEventListener('blur',       hideProfitInfo);
  }
}

// ── Cumulative Cash Position Chart ──

var GRANULARITY_LABELS = { daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly', annually: 'Annually' };

function getGranularity(width) {
  if (width > 600) return 'daily';
  if (width > 350) return 'weekly';
  if (width > 200) return 'monthly';
  return 'annually';
}

// Returns { points, keys, markers } where:
//   points  = cumulative cash position after each bucket (the curve)
//   keys    = bucket date label per point (used for the X-axis)
//   markers = [{ index, date }] for buckets containing a capital_in event,
//             rendered on the chart so owners can see "this is where I
//             injected puhunan" without reading the table.
function aggregateByGranularity(sortedEntries, granularity) {
  var buckets        = {};
  var capitalBuckets = {};

  sortedEntries.forEach(function (entry) {
    var date = entry.occurred_at ? String(entry.occurred_at).slice(0, 10) : null;
    if (!date) return;
    var key;
    if (granularity === 'daily') {
      key = date;
    } else if (granularity === 'weekly') {
      var d = new Date(date + 'T00:00:00');
      var dow = d.getDay();
      d.setDate(d.getDate() + (dow === 0 ? -6 : 1 - dow));
      key = d.toISOString().slice(0, 10);
    } else if (granularity === 'monthly') {
      key = date.slice(0, 7);
    } else {
      key = date.slice(0, 4);
    }
    if (!buckets[key]) buckets[key] = 0;
    var isOut = entry.type === 'owner_draw' || entry.type === 'opex' || entry.type === 'capex';
    buckets[key] += isOut ? -Number(entry.amount) : Number(entry.amount);
    if (entry.type === 'capital_in') capitalBuckets[key] = true;
  });

  var keys    = Object.keys(buckets).sort();
  var points  = [];
  var markers = [];
  var running = 0;
  keys.forEach(function (k, i) {
    running += buckets[k];
    points.push(running);
    if (capitalBuckets[k]) markers.push({ index: i, date: k });
  });
  return { points: points, keys: keys, markers: markers };
}

function buildChartSVG(agg, color) {
  var VW = 1000, VH = 100, pad = 8;
  var gradId = 'cf-grad-' + (++_chartDrawSeq);
  var points = agg.points;

  if (points.length === 0) {
    return (
      '<svg viewBox="0 0 ' + VW + ' ' + VH + '" preserveAspectRatio="none" width="100%">' +
        '<line x1="0" y1="' + VH / 2 + '" x2="' + VW + '" y2="' + VH / 2 + '"' +
          ' stroke="' + color + '" stroke-opacity="0.35" stroke-width="2.5" stroke-dasharray="12 8"/>' +
      '</svg>'
    );
  }

  var pts = points.length === 1 ? [points[0], points[0]] : points;
  var min = Math.min.apply(null, pts);
  var max = Math.max.apply(null, pts);
  var range = max === min ? 1 : max - min;

  var coords = pts.map(function (v, i) {
    return {
      x: (i / (pts.length - 1)) * VW,
      y: pad + (1 - (v - min) / range) * (VH - 2 * pad),
    };
  });

  var d = 'M' + coords[0].x.toFixed(1) + ' ' + coords[0].y.toFixed(1);
  for (var i = 1; i < coords.length; i++) {
    var p = coords[i - 1], c = coords[i];
    var cpx = ((p.x + c.x) / 2).toFixed(1);
    d += ' C' + cpx + ' ' + p.y.toFixed(1) +
         ' ' + cpx + ' ' + c.y.toFixed(1) +
         ' ' + c.x.toFixed(1) + ' ' + c.y.toFixed(1);
  }
  var area = d + ' L' + VW + ' ' + VH + ' L0 ' + VH + ' Z';

  // Capital-in markers: small filled circles on the curve at injection points.
  // Skipped when points.length === 1 (degenerate single-bucket case).
  var markersSvg = '';
  if (points.length > 1) {
    agg.markers.forEach(function (m) {
      if (m.index >= 0 && m.index < coords.length) {
        var c = coords[m.index];
        markersSvg +=
          '<circle cx="' + c.x.toFixed(1) + '" cy="' + c.y.toFixed(1) + '" r="6"' +
          ' fill="' + color + '" stroke="var(--color-surface, #fff)" stroke-width="1.5">' +
          '<title>Capital injection · ' + m.date + '</title></circle>';
      }
    });
  }

  return (
    '<svg viewBox="0 0 ' + VW + ' ' + VH + '" preserveAspectRatio="none" width="100%">' +
      '<defs>' +
        '<linearGradient id="' + gradId + '" x1="0" y1="0" x2="0" y2="1">' +
          '<stop offset="0%" stop-color="' + color + '" stop-opacity="0.22"/>' +
          '<stop offset="100%" stop-color="' + color + '" stop-opacity="0"/>' +
        '</linearGradient>' +
      '</defs>' +
      '<path d="' + area + '" fill="url(#' + gradId + ')" stroke="none"/>' +
      '<path d="' + d + '" fill="none" stroke="' + color + '" stroke-width="2.5"' +
        ' stroke-linecap="round" stroke-linejoin="round"/>' +
      markersSvg +
    '</svg>'
  );
}

// Formats the Y-axis bound labels compactly so they fit in the narrow gutter.
function formatAxisPeso(amount) {
  var n = Number(amount);
  var abs = Math.abs(n);
  if (abs >= 1000000) return '₱' + (n / 1000000).toFixed(1) + 'M';
  if (abs >= 1000)    return '₱' + Math.round(n / 1000) + 'K';
  return '₱' + Math.round(n);
}

function drawChart(entries, cardContentWidth) {
  var body  = document.getElementById('cashflow-chart-body');
  var badge = document.getElementById('chart-period-badge');
  if (!body || cardContentWidth < 40) return;

  var granularity = getGranularity(cardContentWidth);
  if (badge) badge.textContent = GRANULARITY_LABELS[granularity];

  var sorted = entries.slice().sort(function (a, b) {
    var da = String(a.occurred_at || ''), db = String(b.occurred_at || '');
    return da < db ? -1 : da > db ? 1 : 0;
  });

  var agg          = aggregateByGranularity(sorted, granularity);
  var finalBalance = agg.points.length > 0 ? agg.points[agg.points.length - 1] : 0;

  var cs    = getComputedStyle(document.documentElement);
  var color = finalBalance >= 0
    ? (cs.getPropertyValue('--color-primary').trim() || '#5a9e6f')
    : (cs.getPropertyValue('--color-danger').trim()  || '#dc2626');

  // Compose: y-axis label gutter | svg + x-axis label row
  var yMaxLabel = '', yMinLabel = '', xStartLabel = '', xEndLabel = '';
  if (agg.points.length > 0) {
    var hi = Math.max.apply(null, agg.points);
    var lo = Math.min.apply(null, agg.points);
    yMaxLabel = formatAxisPeso(hi);
    yMinLabel = formatAxisPeso(lo);
    xStartLabel = agg.keys[0];
    xEndLabel   = agg.keys[agg.keys.length - 1];
  } else {
    yMaxLabel = yMinLabel = '—';
    xStartLabel = xEndLabel = '';
  }

  body.innerHTML =
    '<div class="chart-y-axis">' +
      '<span>' + yMaxLabel + '</span>' +
      '<span>' + yMinLabel + '</span>' +
    '</div>' +
    '<div class="chart-main">' +
      buildChartSVG(agg, color) +
      '<div class="chart-x-axis">' +
        '<span>' + xStartLabel + '</span>' +
        '<span>' + xEndLabel   + '</span>' +
      '</div>' +
    '</div>';
}

function renderCashFlowChart(allEntries) {
  var card = document.getElementById('cashflow-chart-card');
  if (!card) return;

  if (_chartResizeObserver) {
    _chartResizeObserver.disconnect();
    _chartResizeObserver = null;
  }

  _chartResizeObserver = new ResizeObserver(function (observed) {
    drawChart(allEntries, Math.floor(observed[0].contentRect.width));
  });
  _chartResizeObserver.observe(card);
}

var SVG_DOTS = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="5" r="1" fill="currentColor"></circle><circle cx="12" cy="12" r="1" fill="currentColor"></circle><circle cx="12" cy="19" r="1" fill="currentColor"></circle></svg>';

function groupSalesRevenue(list) {
  var grouped = [];
  var salesByDate = {};

  list.forEach(function (entry) {
    if (entry.type !== 'sales_revenue') {
      grouped.push(entry);
      return;
    }
    var date = entry.occurred_at ? String(entry.occurred_at).substring(0, 10) : '—';
    if (!salesByDate[date]) {
      salesByDate[date] = { date: date, total: 0, count: 0 };
    }
    salesByDate[date].total += Number(entry.amount);
    salesByDate[date].count += 1;
  });

  Object.values(salesByDate).forEach(function (s) {
    grouped.push({
      _grouped: true,
      type:        'sales_revenue',
      occurred_at: s.date,
      amount:      s.total,
      count:       s.count,
      category:    null,
      source:      'sale',
    });
  });

  grouped.sort(function (a, b) {
    var da = a.occurred_at || '';
    var db = b.occurred_at || '';
    return da < db ? 1 : da > db ? -1 : 0;
  });

  return grouped;
}

function renderFinancePagination(totalPages) {
  var el = document.getElementById('finance-pagination');
  if (!el) return;

  if (totalPages <= 1) { el.innerHTML = ''; return; }

  el.innerHTML =
    '<button class="page-btn" id="fin-prev-page"' + (currentPage === 1 ? ' disabled' : '') + '>&#8592;</button>' +
    '<span class="page-info">Page ' + currentPage + ' of ' + totalPages + '</span>' +
    '<button class="page-btn" id="fin-next-page"' + (currentPage === totalPages ? ' disabled' : '') + '>&#8594;</button>';

  document.getElementById('fin-prev-page').addEventListener('click', function () {
    if (currentPage > 1) { currentPage--; renderMovements(window._financeEntries); }
  });
  document.getElementById('fin-next-page').addEventListener('click', function () {
    if (currentPage < totalPages) { currentPage++; renderMovements(window._financeEntries); }
  });
}

function renderFilteredEmptyHtml() {
  return '<div class="finance-empty-message">No entries match this filter.</div>';
}

function renderGetStartedHtml() {
  // First-run guidance for owners with zero entries yet. The CTA only
  // renders for admins since cashiers cannot create cashflow entries.
  var adminCta = isAdmin()
    ? '<button type="button" class="submit-button" id="finance-getstarted-add">+ Add Your First Entry</button>'
    : '';
  return (
    '<div class="finance-getstarted-panel">' +
      '<div class="finance-getstarted-icon"><i data-lucide="wallet"></i></div>' +
      '<h3 class="finance-getstarted-title">Welcome to Finance</h3>' +
      '<p class="finance-getstarted-subtitle">Track your store\'s money in three simple steps:</p>' +
      '<ol class="finance-getstarted-steps">' +
        '<li>' +
          '<span class="finance-getstarted-step-num">1</span>' +
          '<div>' +
            '<strong>Add your starting capital</strong>' +
            '<p>The money you put in — your own cash or a loan.</p>' +
          '</div>' +
        '</li>' +
        '<li>' +
          '<span class="finance-getstarted-step-num">2</span>' +
          '<div>' +
            '<strong>Record money going out</strong>' +
            '<p>Expenses like stock purchases, rent, and utilities.</p>' +
          '</div>' +
        '</li>' +
        '<li>' +
          '<span class="finance-getstarted-step-num">3</span>' +
          '<div>' +
            '<strong>Ring up your sales</strong>' +
            '<p>Daily sales totals appear here automatically.</p>' +
          '</div>' +
        '</li>' +
      '</ol>' +
      adminCta +
    '</div>'
  );
}

function renderMovements(list) {
  if (!list || list.length === 0) {
    var filterActive = financeTypeSelect.value !== '';
    financeTableBody.innerHTML = '<tr><td colspan="5" class="finance-empty-cell">' +
      (filterActive ? renderFilteredEmptyHtml() : renderGetStartedHtml()) +
    '</td></tr>';
    var pager = document.getElementById('finance-pagination');
    if (pager) pager.innerHTML = '';
    if (window.lucide) lucide.createIcons();
    // Wire the Get Started panel's CTA to the same Add-Entry modal flow.
    var startedBtn = document.getElementById('finance-getstarted-add');
    if (startedBtn) startedBtn.addEventListener('click', openAddModal);
    return;
  }

  var display = financeTypeSelect.value === 'sales_revenue'
    ? groupSalesRevenue(list).filter(function (e) { return e.type === 'sales_revenue'; })
    : groupSalesRevenue(list);

  window._financeDisplay = display;

  var totalPages = Math.max(1, Math.ceil(display.length / PAGE_SIZE));
  if (currentPage > totalPages) currentPage = totalPages;
  var start = (currentPage - 1) * PAGE_SIZE;
  var pageSlice = display.slice(start, start + PAGE_SIZE);

  financeTableBody.innerHTML = pageSlice.map(function (entry) {
    var isOut     = ['owner_draw', 'opex', 'capex'].includes(entry.type);
    var amountCls = 'finance-amount';
    var sign      = isOut ? '−' : '+';
    var dateStr   = entry.occurred_at ? String(entry.occurred_at).substring(0, 10) : '—';

    var typeLabel = TYPE_LABELS[entry.type] || entry.type;
    var notesHtml, actionsHtml, descHtml;

    // Visible source chip for rows the system created automatically, so
    // owners can see at a glance why expenses they didn't enter show up.
    // Grouped sales rows already say "Sales · N transactions" — no chip
    // needed there.
    var sourceChipHtml = '';
    if (!entry._grouped && entry.source && entry.source !== 'manual') {
      var chipText = entry.source === 'restock' ? 'from Restock'
                   : entry.source === 'sale'    ? 'from POS'
                   : 'auto';
      sourceChipHtml = '<span class="entry-source-chip">' + chipText + '</span>';
    }

    if (entry._grouped) {
      descHtml    = '<span class="type-label">' + typeLabel + '</span>';
      notesHtml   = '<span style="color:var(--color-text-muted);font-size:0.82em;">' + entry.count + ' transaction' + (entry.count !== 1 ? 's' : '') + '</span>';
      actionsHtml = '<td class="actions-cell"></td>';
    } else {
      // category (free-form for opex/capex) and description are user-entered, so
      // they MUST be HTML-escaped before going into innerHTML — otherwise a note
      // like "<img src=x onerror=...>" is stored XSS that runs in whoever opens
      // Finance next (admin included, on a shared store device).
      var catLabel = entry.category ? escapeHtml(String(entry.category).replace(/_/g, ' ')) : '';
      descHtml = '<span class="type-label">' + typeLabel + '</span>' +
        (catLabel ? '<span class="cat-label"> · ' + catLabel + '</span>' : '') +
        sourceChipHtml;
      notesHtml   = entry.description ? escapeHtml(entry.description) : '—';
      actionsHtml = '<td class="actions-cell"></td>';
      if (isAdmin() && entry.source === 'manual') {
        actionsHtml =
          '<td class="actions-cell">' +
            '<div class="kebab-wrapper">' +
              '<button type="button" class="kebab-btn finance-kebab-btn" data-id="' + entry.id + '" title="Options">' + SVG_DOTS + '</button>' +
              '<div class="kebab-dropdown" id="fin-kd-' + entry.id + '">' +
                '<button type="button" class="kebab-item finance-edit-item" data-id="' + entry.id + '">' +
                  '<i data-lucide="pencil"></i> Edit' +
                '</button>' +
                '<button type="button" class="kebab-item delete-item finance-delete-item" data-id="' + entry.id + '">' +
                  '<i data-lucide="trash-2"></i> Delete' +
                '</button>' +
              '</div>' +
            '</div>' +
          '</td>';
      }
    }

    return '<tr>' +
      '<td>' + dateStr + '</td>' +
      '<td class="desc-cell">' + descHtml + '</td>' +
      '<td class="' + amountCls + '">' + sign + ' ' + formatPeso(entry.amount) + '</td>' +
      '<td class="notes-cell">' + notesHtml + '</td>' +
      actionsHtml +
    '</tr>';
  }).join('');

  if (window.lucide) lucide.createIcons();
  attachTableActions();
  renderFinancePagination(totalPages);
}

function attachTableActions() {
  if (!isAdmin()) return;

  function closeAllKebabs() {
    document.querySelectorAll('#finance-table .kebab-dropdown.open').forEach(function (d) {
      d.classList.remove('open');
    });
  }

  document.querySelectorAll('.finance-kebab-btn').forEach(function (btn) {
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      var dropdown = document.getElementById('fin-kd-' + btn.dataset.id);
      if (!dropdown) return;
      var wasOpen = dropdown.classList.contains('open');
      closeAllKebabs();
      if (!wasOpen) dropdown.classList.add('open');
    });
  });

  document.querySelectorAll('.finance-edit-item').forEach(function (btn) {
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      closeAllKebabs();
      openEditModal(btn.dataset.id);
    });
  });

  document.querySelectorAll('.finance-delete-item').forEach(function (btn) {
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      closeAllKebabs();
      handleDelete(btn.dataset.id);
    });
  });
}

function populateCategorySelect(type) {
  var options = CATEGORIES[type] || [];
  financeCatInput.innerHTML = '<option value="">No category</option>' +
    options.map(function (o) {
      return '<option value="' + o.value + '">' + o.label + '</option>';
    }).join('');
}

// Show/hide the loan-terms block, swap the Amount label, and refresh the
// readouts based on the current Type + Category selection.
function updateConditionalFields() {
  var type = financeTypeInput.value;
  var cat  = financeCatInput.value;
  var isBorrowed = type === 'capital_in' && cat === 'borrowed';

  loanTermsBlock.style.display = isBorrowed ? '' : 'none';
  if (financeAmountLabel) financeAmountLabel.textContent = AMOUNT_LABELS[type + ':' + cat] || 'Amount (₱)';

  updateLoanReadout();
  updatePayHint();
  updateFieldAccess();
}

// Gate Amount / Notes / loan-term inputs until BOTH Type and Category are
// chosen, so nothing can be recorded without a classification.
function updateFieldAccess() {
  var ready = !!financeTypeInput.value && !!financeCatInput.value;
  [financeAmountInput, financeNotesInput, financeMonthlyInput, financeTermInput].forEach(function (el) {
    if (el) el.disabled = !ready;
  });
}

// Live "Total to repay" line for a borrowed loan (monthly_due × term_months).
function updateLoanReadout() {
  if (!loanTotalReadout) return;
  var isBorrowed = financeTypeInput.value === 'capital_in' && financeCatInput.value === 'borrowed';
  if (!isBorrowed) {
    loanTotalReadout.textContent = '';
    loanTotalReadout.classList.remove('is-visible');
    return;
  }
  var md = Number(financeMonthlyInput.value);
  var tm = Number(financeTermInput.value);
  if (md > 0 && tm > 0) {
    var total     = md * tm;
    var principal = Number(financeAmountInput.value);
    var txt = 'Total to repay: ' + formatPeso(total) + ' over ' + tm + ' month' + (tm !== 1 ? 's' : '');
    if (principal > 0 && total > principal) txt += '  ·  ' + formatPeso(total - principal) + ' interest';
    loanTotalReadout.textContent = txt;
    loanTotalReadout.classList.add('is-visible');
  } else {
    loanTotalReadout.textContent = 'Optional: enter monthly payment and months — or leave both blank for an informal loan.';
    loanTotalReadout.classList.remove('is-visible');
  }
}

// Most that can be paid against debt right now. A debt payment may not exceed
// what's still owed. When editing an existing debt payment, its own amount is
// already baked into the outstanding figure, so add it back to get the true cap.
function debtPaymentCap() {
  var cap = Number(window._debtOutstanding || 0);
  if (editingId) {
    var orig = window._financeEntries && window._financeEntries.find(function (e) { return String(e.id) === String(editingId); });
    if (orig && orig.category === 'debt_payment') cap += Number(orig.amount);
  }
  return cap;
}

// Inline hint under Amount when recording a debt payment — confirms what is
// still owed and flags an amount over the allowed cap (which submit blocks).
function updatePayHint() {
  if (!financeAmountHint) return;
  var isDebtPay = financeTypeInput.value === 'owner_draw' && financeCatInput.value === 'debt_payment';
  if (!isDebtPay) {
    financeAmountHint.textContent = '';
    financeAmountHint.classList.remove('is-warning');
    return;
  }
  var owed = Number(window._debtOutstanding || 0);
  var cap  = debtPaymentCap();
  var amt  = Number(financeAmountInput.value);
  if (cap <= 0) {
    financeAmountHint.textContent = 'No outstanding debt to pay.';
    financeAmountHint.classList.add('is-warning');
  } else if (amt > cap + 0.001) {
    financeAmountHint.textContent = 'Cannot exceed the ' + formatPeso(cap) + ' still owed.';
    financeAmountHint.classList.add('is-warning');
  } else {
    financeAmountHint.textContent = 'You still owe ' + formatPeso(owed) + '.';
    financeAmountHint.classList.remove('is-warning');
  }
}

function resetModalFields() {
  financeTypeInput.value    = '';
  financeCatInput.innerHTML = '<option value="">Select category</option>';
  financeAmountInput.value  = '';
  financeNotesInput.value   = '';
  financeMonthlyInput.value = '';
  financeTermInput.value    = '';
}

function openAddModal() {
  editingId = null;
  financeModalTitle.textContent = 'Add Entry';
  financeSubmitBtn.textContent  = 'Save Entry';
  resetModalFields();
  financeDateInput.value = manilaToday();
  clearFormErrors();
  updateConditionalFields();
  financeModal.style.display = 'flex';
}

// Part A: open the modal preset to a debt payment (Type + Category filled).
// The Amount is left blank for the owner to type how much they're paying; it's
// capped at the outstanding balance by validation, not prefilled.
function openPayDebtModal() {
  editingId = null;
  financeModalTitle.textContent = 'Record Loan Payment';
  financeSubmitBtn.textContent  = 'Record Payment';
  resetModalFields();
  financeDateInput.value   = manilaToday();
  financeTypeInput.value   = 'owner_draw';
  populateCategorySelect('owner_draw');
  financeCatInput.value    = 'debt_payment';
  financeAmountInput.value = '';
  clearFormErrors();
  updateConditionalFields();
  financeModal.style.display = 'flex';
  setTimeout(function () {
    if (financeAmountInput) financeAmountInput.focus();
  }, 50);
}

function openEditModal(id) {
  var entry = window._financeEntries && window._financeEntries.find(function (e) { return String(e.id) === String(id); });
  if (!entry) return;
  editingId = id;
  financeModalTitle.textContent = 'Edit Entry';
  financeSubmitBtn.textContent  = 'Update Entry';

  financeDateInput.value    = String(entry.occurred_at).substring(0, 10);
  financeTypeInput.value    = entry.type;
  populateCategorySelect(entry.type);
  financeCatInput.value     = entry.category || '';
  financeAmountInput.value  = entry.amount;
  financeNotesInput.value   = entry.description || '';
  financeMonthlyInput.value = entry.monthly_due != null ? entry.monthly_due : '';
  financeTermInput.value    = entry.term_months != null ? entry.term_months : '';

  clearFormErrors();
  updateConditionalFields();
  financeModal.style.display = 'flex';
}

function closeModal() {
  financeModal.style.display = 'none';
  editingId = null;
}

function clearFormErrors() {
  ['finance-date-error', 'finance-type-error', 'finance-category-error', 'finance-amount-error',
   'finance-monthly-due-error', 'finance-term-months-error'].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) { el.textContent = ''; el.style.display = ''; }
  });
}

function showFieldError(id, msg) {
  var el = document.getElementById(id);
  if (el) { el.textContent = msg; el.style.display = 'block'; }
}

function getFilters() {
  var filters = {};
  if (financeTypeSelect.value) filters.type = financeTypeSelect.value;
  return filters;
}

async function loadData() {
  showLoading('#finance-table-body');
  try {
    var filters = getFilters();
    var period  = getActivePeriod();
    var fetches = [
      getFinanceMovements(filters),
      getFinanceSummary(filters),
      getFinanceProfit({ from: period.from, to: period.to }),
      // Chart fetch is always all-time so the period selector inside the
      // Profit card is scoped to what it visually controls (Profit only).
      // No type filter either — the chart is unaffected by the table filter.
      getFinanceMovements({}),
    ];

    var results      = await Promise.all(fetches);
    var movResult    = results[0];
    var sumResult    = results[1];
    var profitResult = results[2];
    var chartResult  = results[3];
    var allData      = (chartResult && chartResult.data) || [];

    if (sumResult && sumResult.success) {
      var profitForRender = profitResult && profitResult.success
        ? Object.assign({}, profitResult.data, { _isAllTime: period.value === 'all-time' })
        : null;
      renderSummary(sumResult.data, profitForRender);
    }

    if (movResult && movResult.success) {
      window._financeEntries = movResult.data || [];
      renderMovements(window._financeEntries);
    } else {
      financeTableBody.innerHTML =
        '<tr><td colspan="6" style="text-align:center;padding:40px;color:var(--color-danger,#dc2626);">' +
        (movResult ? movResult.message : 'Failed to load entries.') + '</td></tr>';
    }

    renderCashFlowChart(allData);
  } catch (err) {
    showApiError('Network error. Is the server running?');
  } finally {
    hideLoading('#finance-table-body');
  }
}

async function handleDelete(id) {
  if (!confirm('Delete this entry? This cannot be undone.')) return;
  try {
    var result = await deleteFinanceEntry(id);
    if (result && result.success !== false) {
      await loadData();
    } else {
      alert(result ? result.message : 'Delete failed.');
    }
  } catch (err) {
    showApiError('Network error. Is the server running?');
  }
}

// ── Event Listeners ──

financeTypeInput.addEventListener('change', function () {
  populateCategorySelect(financeTypeInput.value);
  updateConditionalFields();
});

financeCatInput.addEventListener('change', updateConditionalFields);

// Live readouts as the owner types loan terms / amount.
financeMonthlyInput.addEventListener('input', updateLoanReadout);
financeTermInput.addEventListener('input', updateLoanReadout);
financeAmountInput.addEventListener('input', function () {
  updateLoanReadout();
  updatePayHint();
});

if (addEntryButton) {
  addEntryButton.addEventListener('click', openAddModal);
}

closeFinanceModal.addEventListener('click', closeModal);
financeModal.addEventListener('click', function (e) {
  if (e.target === financeModal) closeModal();
});

financeTypeSelect.addEventListener('change', function () {
  currentPage = 1;
  loadData();
});

financeForm.addEventListener('submit', async function (e) {
  e.preventDefault();
  clearFormErrors();

  var occurred_at = financeDateInput.value;
  var type        = financeTypeInput.value;
  var category    = financeCatInput.value || null;
  var amount      = Number(financeAmountInput.value);
  var description = financeNotesInput.value.trim() || null;
  var monthly_due = null;
  var term_months = null;

  var hasError = false;
  if (!type)                  { showFieldError('finance-type-error',     'Type is required');              hasError = true; }
  if (!category)              { showFieldError('finance-category-error', 'Category is required');          hasError = true; }
  if (!occurred_at)           { showFieldError('finance-date-error',     'Date is required');              hasError = true; }
  if (!amount || amount <= 0) { showFieldError('finance-amount-error',   'Amount must be greater than 0'); hasError = true; }

  // A debt payment can't exceed what's still owed (would drive the balance
  // negative / overpay the lender).
  if (type === 'owner_draw' && category === 'debt_payment' && amount > 0) {
    var payCap = debtPaymentCap();
    if (amount > payCap + 0.001) {
      showFieldError('finance-amount-error', payCap > 0
        ? 'Cannot exceed the ' + formatPeso(payCap) + ' still owed'
        : 'No outstanding debt to pay');
      hasError = true;
    }
  }

  // Loan terms (optional, but both-or-neither) for borrowed capital.
  if (type === 'capital_in' && category === 'borrowed') {
    var mdRaw = financeMonthlyInput.value.trim();
    var tmRaw = financeTermInput.value.trim();
    if (mdRaw !== '' || tmRaw !== '') {
      var md = Number(mdRaw);
      var tm = Number(tmRaw);
      if (mdRaw === '' || !(md > 0)) {
        showFieldError('finance-monthly-due-error', 'Enter the monthly payment'); hasError = true;
      }
      if (tmRaw === '' || !Number.isInteger(tm) || tm < 1 || tm > 120) {
        showFieldError('finance-term-months-error', 'Enter months (1–120)'); hasError = true;
      }
      if (!hasError) { monthly_due = md; term_months = tm; }
    }
  }

  if (hasError) return;

  financeSubmitBtn.disabled = true;
  try {
    var payload = {
      type: type, category: category, amount: amount,
      monthly_due: monthly_due, term_months: term_months,
      description: description, occurred_at: occurred_at,
    };
    var result = editingId
      ? await updateFinanceEntry(editingId, payload)
      : await createFinanceEntry(payload);

    if (result && result.success) {
      if (!editingId && type === 'capital_in' &&
          typeof OnboardingChecklist !== 'undefined' &&
          typeof OnboardingCore !== 'undefined' &&
          OnboardingCore.getUserRole() === 'admin' &&
          !OnboardingCore.getChecklistProgress().logCapital) {
        OnboardingChecklist.complete('logCapital');
      }
      closeModal();
      await loadData();
    } else {
      showApiError(result ? result.message : 'Save failed.');
    }
  } catch (err) {
    showApiError('Network error. Is the server running?');
  } finally {
    financeSubmitBtn.disabled = false;
  }
});

// ── Admin-only controls ──

if (isAdmin()) {
  if (addEntryButton) addEntryButton.style.display = '';

}

// ── Close kebab dropdowns on outside click ──

document.addEventListener('click', function () {
  document.querySelectorAll('#finance-table .kebab-dropdown.open').forEach(function (d) {
    d.classList.remove('open');
  });
});

// Dismiss the Profit info tooltip on outside tap (touch) and when the page
// scrolls/resizes (its fixed position would otherwise drift away from the icon).
document.addEventListener('click', function (e) {
  if (e.target.closest && e.target.closest('#profit-info-trigger')) return;
  hideProfitInfo();
});
// capture so it fires for scrolls in any nested scroller; passive so it never
// blocks the compositor (hideProfitInfo only toggles a class).
window.addEventListener('scroll', hideProfitInfo, { capture: true, passive: true });
window.addEventListener('resize', hideProfitInfo);

loadData().then(function () {
  if (typeof OnboardingTour !== 'undefined' && typeof OnboardingTours !== 'undefined') {
    OnboardingTour.start('finance', OnboardingTours.finance);
  }
});
