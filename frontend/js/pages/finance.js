checkAuth();

var currentUser = JSON.parse(localStorage.getItem('currentUser'));

var financeSummaryEl  = document.getElementById('finance-summary');
var financeTableBody  = document.getElementById('finance-table-body');
var financeTypeSelect = document.getElementById('finance-type-select');
var financeFromInput  = document.getElementById('finance-from');
var financeToInput    = document.getElementById('finance-to');
var applyFilterBtn    = document.getElementById('finance-apply-filter');
var addEntryButton    = document.getElementById('add-entry-button');
var financeActionsCol = document.getElementById('finance-actions-col');

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

var editingId = null;

var TYPE_LABELS = {
  capital_in: 'Puhunan In',
  owner_draw: 'Kuha',
  opex:       'OpEx',
  capex:      'CapEx',
};

// Matches README category conventions exactly.
// null → free-form (opex/capex: user types any category)
var CATEGORIES = {
  capital_in: [
    { value: 'own',      label: 'Own (Sariling pera)'  },
    { value: 'borrowed', label: 'Borrowed / Hiniram'   },
  ],
  owner_draw: [
    { value: 'personal',      label: 'Personal / Household'       },
    { value: 'loan_payment',  label: 'Loan Payment (Bayad utang)' },
    { value: 'reinvest',      label: 'Reinvestment'               },
    { value: 'other',         label: 'Other / Iba pa'             },
  ],
  opex: [
    { value: 'rent',       label: 'Rent'              },
    { value: 'utilities',  label: 'Utilities'         },
    { value: 'transport',  label: 'Transport'         },
    { value: 'supplies',   label: 'Supplies'          },
    { value: 'restock',    label: 'Restock'           },
    { value: 'other',      label: 'Other / Iba pa'    },
  ],
  capex: [
    { value: 'equipment',  label: 'Equipment'         },
    { value: 'furniture',  label: 'Furniture'         },
    { value: 'renovation', label: 'Renovation'        },
    { value: 'other',      label: 'Other / Iba pa'    },
  ],
};

function isAdmin() {
  return currentUser && currentUser.role === 'admin';
}

function formatPeso(amount) {
  return '₱' + Number(amount).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function getCurrentMonthRange() {
  var now = new Date();
  var from = new Date(now.getFullYear(), now.getMonth(), 1);
  var pad = function (n) { return String(n).padStart(2, '0'); };
  var fmt = function (d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
  return { from: fmt(from), to: fmt(now) };
}

function renderSummary(data) {
  var net   = Number(data.net);
  var utang = Number(data.utang);

  function stat(label, value, valMod) {
    return '<div class="finance-stat">' +
      '<p class="finance-stat-value ' + valMod + '">' + formatPeso(value) + '</p>' +
      '<p class="finance-stat-label">' + label + '</p>' +
    '</div>';
  }

  var html =
    stat('Money In',  data.moneyIn,  'finance-positive') +
    stat('Money Out', data.moneyOut, 'finance-negative') +
    stat('Net',       net,           net >= 0 ? 'finance-positive' : 'finance-negative');

  if (utang > 0) {
    html += stat('Utang (Outstanding)', utang, 'finance-utang');
  }

  financeSummaryEl.innerHTML = html;
}

var SVG_DOTS = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="5" r="1" fill="currentColor"></circle><circle cx="12" cy="12" r="1" fill="currentColor"></circle><circle cx="12" cy="19" r="1" fill="currentColor"></circle></svg>';

function renderMovements(list) {
  if (!list || list.length === 0) {
    financeTableBody.innerHTML =
      '<tr><td colspan="6" style="text-align:center;padding:40px;color:var(--color-text-muted);">No entries found.</td></tr>';
    return;
  }

  financeTableBody.innerHTML = list.map(function (entry) {
    var isOut       = ['owner_draw', 'opex', 'capex'].includes(entry.type);
    var amountCls   = isOut ? 'finance-amount is-out' : 'finance-amount is-in';
    var sign        = isOut ? '−' : '+';
    var catLabel    = entry.category ? entry.category.replace(/_/g, ' ') : '—';
    var dateStr     = entry.occurred_at ? String(entry.occurred_at).substring(0, 10) : '—';
    var isAutoEntry = entry.source !== 'manual';

    var actionsHtml = '<td class="actions-cell"></td>';
    if (isAdmin()) {
      if (isAutoEntry) {
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

    return '<tr>' +
      '<td>' + dateStr + '</td>' +
      '<td><span class="type-badge type-badge--' + entry.type + '">' + (TYPE_LABELS[entry.type] || entry.type) + '</span></td>' +
      '<td>' + catLabel + '</td>' +
      '<td class="' + amountCls + '">' + sign + ' ' + formatPeso(entry.amount) + '</td>' +
      '<td>' + (entry.description || '—') + '</td>' +
      actionsHtml +
    '</tr>';
  }).join('');

  if (window.lucide) lucide.createIcons();
  attachTableActions();
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
  if (financeFromInput.value)  filters.from = financeFromInput.value;
  if (financeToInput.value)    filters.to   = financeToInput.value;
  return filters;
}

async function loadData() {
  showLoading('#finance-table-body');
  try {
    var filters = getFilters();
    var results = await Promise.all([
      getFinanceMovements(filters),
      getFinanceSummary(filters),
    ]);
    var movResult = results[0];
    var sumResult = results[1];

    if (sumResult && sumResult.success) {
      renderSummary(sumResult.data);
    }

    if (movResult && movResult.success) {
      window._financeEntries = movResult.data || [];
      renderMovements(window._financeEntries);
    } else {
      financeTableBody.innerHTML =
        '<tr><td colspan="6" style="text-align:center;padding:40px;color:var(--color-danger,#dc2626);">' +
        (movResult ? movResult.message : 'Failed to load entries.') + '</td></tr>';
    }
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

applyFilterBtn.addEventListener('click', loadData);

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

  var financeFab = document.createElement('button');
  financeFab.className = 'fab';
  financeFab.title = 'Add Finance Entry';
  financeFab.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"></path><path d="M12 5v14"></path></svg>';
  financeFab.addEventListener('click', openAddModal);
  document.body.appendChild(financeFab);
}

// ── Close kebab dropdowns on outside click ──

document.addEventListener('click', function () {
  document.querySelectorAll('#finance-table .kebab-dropdown.open').forEach(function (d) {
    d.classList.remove('open');
  });
});

// ── Init: pre-fill date range to current month ──

(function initDateRange() {
  var range = getCurrentMonthRange();
  financeFromInput.value = range.from;
  financeToInput.value   = range.to;
})();

loadData();
