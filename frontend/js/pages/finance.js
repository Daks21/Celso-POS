checkAuth();

var currentUser = JSON.parse(localStorage.getItem('currentUser'));

var financeSummaryEl   = document.getElementById('finance-summary');
var financeTableBody   = document.getElementById('finance-table-body');
var financeTypeSelect  = document.getElementById('finance-type-select');
var financePeriodSelect = document.getElementById('finance-period-select');
var addEntryButton     = document.getElementById('add-entry-button');
var financeActionsCol  = document.getElementById('finance-actions-col');

var financeModal      = document.getElementById('finance-modal');
var closeFinanceModal = document.getElementById('close-finance-modal');
var financeForm       = document.getElementById('finance-form');
var financeModalTitle = document.getElementById('finance-modal-title');
var financeSubmitBtn  = document.getElementById('finance-submit');
var financeDateInput  = document.getElementById('finance-date');
var financeTypeInput  = document.getElementById('finance-type');
var financeCatInput   = document.getElementById('finance-category');
var financeAmountInput = document.getElementById('finance-amount');
var financeNotesInput = document.getElementById('finance-notes');

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

function isAdmin() {
  return currentUser && currentUser.role === 'admin';
}

function formatPeso(amount) {
  return '₱' + Number(amount).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Manila local YYYY-MM-DD for `today` and date arithmetic. Avoids server-TZ
// drift (the same defensive pattern the backend uses in analytics.controller).
var _manilaFmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' });
function manilaToday() { return _manilaFmt.format(new Date()); }
function manilaFromUTC(d) { return _manilaFmt.format(d); }

// Returns { from, to, label } for the currently selected period.
// `from` / `to` are YYYY-MM-DD strings the backend Profit endpoint accepts.
// `label` is the Taglish subtitle text rendered on the Profit card.
function getPeriodRange(value) {
  var today    = manilaToday();
  var year     = parseInt(today.slice(0, 4), 10);
  var month    = parseInt(today.slice(5, 7), 10);

  if (value === 'last-month') {
    var prevY = month === 1 ? year - 1 : year;
    var prevM = month === 1 ? 12       : month - 1;
    var prevFirst = prevY + '-' + String(prevM).padStart(2, '0') + '-01';
    // Last day of previous month = day 0 of current month (UTC noon avoids DST).
    var lastDayDate = new Date(Date.UTC(year, month - 1, 0, 12));
    var prevLast = manilaFromUTC(lastDayDate);
    return { from: prevFirst, to: prevLast, label: 'Kita noong nakaraang buwan' };
  }
  if (value === 'last-3-months') {
    // First day of the month 2 months ago, inclusive → 3 calendar months total.
    var startDate = new Date(Date.UTC(year, month - 3, 1, 12));
    return { from: manilaFromUTC(startDate), to: today, label: 'Kita sa nakaraang 3 buwan' };
  }
  if (value === 'this-year') {
    return { from: year + '-01-01', to: today, label: 'Kita ngayong taon' };
  }
  if (value === 'all-time') {
    return { from: '1970-01-01', to: today, label: 'Kabuuang kita' };
  }
  // Default: 'this-month'
  return { from: today.slice(0, 7) + '-01', to: today, label: 'Kita ngayong buwan' };
}

function getActivePeriod() {
  var stored = localStorage.getItem('financePeriod') || 'this-month';
  return getPeriodRange(stored);
}


function renderSummary(data, profitData) {
  var net         = Number(data.net);
  var debtBalance = Number(data.debtBalance || 0);
  var showDebt    = localStorage.getItem('financeDebtBalanceVisible') !== 'false';
  var debtClass   = debtBalance > 0 ? 'summary-card--debt summary-card--debt-active' : 'summary-card--debt';
  var debtTrend   = debtBalance > 0 ? 'Outstanding borrowed principal' : 'No outstanding debt';

  var profitHtml = '';
  if (profitData) {
    var profit       = Number(profitData.profit);
    var prevProfit   = Number(profitData.previous && profitData.previous.profit) || 0;
    var delta        = profit - prevProfit;
    var profitClass  = profit >= 0 ? 'summary-card--profit summary-card--profit-positive'
                                    : 'summary-card--profit summary-card--profit-negative';
    var deltaSign    = delta >= 0 ? '↑' : '↓';
    var deltaText    = (prevProfit === 0 && profit === 0)
      ? 'Walang transaction sa period na ito'
      : deltaSign + ' ' + formatPeso(Math.abs(delta)) + ' vs prior period';

    var profitLabel = profitData._periodLabel || 'Kita ngayong buwan';
    profitHtml =
      '<div class="summary-card ' + profitClass + '">' +
        '<div class="summary-card-header">' +
          '<span class="summary-label">Profit · ' + profitLabel + '</span>' +
          '<div class="summary-icon"><i data-lucide="trending-up"></i></div>' +
        '</div>' +
        '<p class="summary-value">' + formatPeso(profit) + '</p>' +
        '<p class="summary-trend">' + deltaText + '</p>' +
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
        '</div>'
      : '') +
    '<div class="summary-card summary-card--chart" id="cashflow-chart-card">' +
      '<div class="chart-card-header">' +
        '<span class="summary-label">Cash Flow</span>' +
        '<span class="chart-period-badge" id="chart-period-badge"></span>' +
      '</div>' +
      '<div class="chart-body" id="cashflow-chart-body"></div>' +
    '</div>';
  if (window.lucide) lucide.createIcons();
}

// ── Cash Flow Sparkline ──

var GRANULARITY_LABELS = { daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly', annually: 'Annually' };

function getGranularity(width) {
  if (width > 600) return 'daily';
  if (width > 350) return 'weekly';
  if (width > 200) return 'monthly';
  return 'annually';
}

function aggregateByGranularity(sortedEntries, granularity) {
  var buckets = {};
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
  });
  var keys = Object.keys(buckets).sort();
  var running = 0;
  return keys.map(function (k) { running += buckets[k]; return running; });
}

function buildSparklineSVG(points, color) {
  var VW = 1000, VH = 100, pad = 8;
  var gradId = 'cf-grad-' + (++_chartDrawSeq);

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
    '</svg>'
  );
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

  var points       = aggregateByGranularity(sorted, granularity);
  var finalBalance = points.length > 0 ? points[points.length - 1] : 0;

  var cs    = getComputedStyle(document.documentElement);
  var color = finalBalance >= 0
    ? (cs.getPropertyValue('--color-primary').trim() || '#5a9e6f')
    : (cs.getPropertyValue('--color-danger').trim()  || '#dc2626');

  body.innerHTML = buildSparklineSVG(points, color);
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

function renderMovements(list) {
  if (!list || list.length === 0) {
    financeTableBody.innerHTML =
      '<tr><td colspan="5" style="text-align:center;padding:40px;color:var(--color-text-muted);">No entries found.</td></tr>';
    var pager = document.getElementById('finance-pagination');
    if (pager) pager.innerHTML = '';
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

    if (entry._grouped) {
      descHtml    = '<span class="type-label">' + typeLabel + '</span>';
      notesHtml   = '<span style="color:var(--color-text-muted);font-size:0.82em;">' + entry.count + ' transaction' + (entry.count !== 1 ? 's' : '') + '</span>';
      actionsHtml = '<td class="actions-cell"></td>';
    } else {
      var catLabel = entry.category ? entry.category.replace(/_/g, ' ') : '';
      descHtml = '<span class="type-label">' + typeLabel + '</span>' +
        (catLabel ? '<span class="cat-label"> · ' + catLabel + '</span>' : '');
      notesHtml   = (entry.description || '—');
      actionsHtml = '<td class="actions-cell"></td>';
      if (isAdmin()) {
        if (entry.source !== 'manual') {
          actionsHtml = '<td class="actions-cell" style="text-align:center;color:var(--color-text-muted);font-size:0.78em;">auto</td>';
        } else {
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

function openAddModal() {
  editingId = null;
  financeModalTitle.textContent = 'Add Entry';
  financeSubmitBtn.textContent  = 'Save Entry';
  financeDateInput.value   = new Date().toISOString().slice(0, 10);
  financeTypeInput.value   = '';
  financeCatInput.innerHTML = '<option value="">Select category</option>';
  financeAmountInput.value = '';
  financeNotesInput.value  = '';
  clearFormErrors();
  financeModal.style.display = 'flex';
}

function openEditModal(id) {
  var entry = window._financeEntries && window._financeEntries.find(function (e) { return String(e.id) === String(id); });
  if (!entry) return;
  editingId = id;
  financeModalTitle.textContent = 'Edit Entry';
  financeSubmitBtn.textContent  = 'Update Entry';
  financeDateInput.value   = String(entry.occurred_at).substring(0, 10);
  financeTypeInput.value   = entry.type;
  populateCategorySelect(entry.type);
  financeCatInput.value    = entry.category || '';
  financeAmountInput.value = entry.amount;
  financeNotesInput.value  = entry.description || '';
  clearFormErrors();
  financeModal.style.display = 'flex';
}

function closeModal() {
  financeModal.style.display = 'none';
  editingId = null;
}

function clearFormErrors() {
  ['finance-date-error', 'finance-type-error', 'finance-category-error', 'finance-amount-error'].forEach(function (id) {
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
    var filters   = getFilters();
    var hasFilter = Object.keys(filters).length > 0;

    var period = getActivePeriod();
    var fetches = [
      getFinanceMovements(filters),
      getFinanceSummary(filters),
      getFinanceProfit({ from: period.from, to: period.to }),
    ];
    if (hasFilter) fetches.push(getFinanceMovements({}));

    var results      = await Promise.all(fetches);
    var movResult    = results[0];
    var sumResult    = results[1];
    var profitResult = results[2];
    var allData      = hasFilter
      ? ((results[3] && results[3].data) || [])
      : ((results[0] && results[0].data) || []);

    if (sumResult && sumResult.success) {
      var profitForRender = profitResult && profitResult.success
        ? Object.assign({}, profitResult.data, { _periodLabel: period.label })
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

// Restore the saved period selection, then reload when the user changes it.
if (financePeriodSelect) {
  var savedPeriod = localStorage.getItem('financePeriod') || 'this-month';
  financePeriodSelect.value = savedPeriod;
  financePeriodSelect.addEventListener('change', function () {
    localStorage.setItem('financePeriod', financePeriodSelect.value);
    loadData();
  });
}

financeForm.addEventListener('submit', async function (e) {
  e.preventDefault();
  clearFormErrors();

  var occurred_at = financeDateInput.value;
  var type        = financeTypeInput.value;
  var amount      = Number(financeAmountInput.value);
  var category    = financeCatInput.value || null;
  var description = financeNotesInput.value.trim() || null;

  var hasError = false;
  if (!occurred_at)           { showFieldError('finance-date-error',   'Date is required');             hasError = true; }
  if (!type)                  { showFieldError('finance-type-error',   'Type is required');             hasError = true; }
  if (!amount || amount <= 0) { showFieldError('finance-amount-error', 'Amount must be greater than 0'); hasError = true; }
  if (hasError) return;

  financeSubmitBtn.disabled = true;
  try {
    var payload = { type: type, category: category, amount: amount, description: description, occurred_at: occurred_at };
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

loadData().then(function () {
  if (typeof OnboardingTour !== 'undefined' && typeof OnboardingTours !== 'undefined') {
    OnboardingTour.start('finance', OnboardingTours.finance);
  }
});
