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
  capital_in: 'Capital In',
  owner_draw: 'Withdrawal',
  opex:       'OpEx',
  capex:      'CapEx',
};

var CATEGORIES = {
  capital_in: [
    { value: 'own_savings',  label: 'Own Savings'      },
    { value: 'borrowed',     label: 'Borrowed / Utang' },
    { value: 'other_income', label: 'Other Income'     },
  ],
  owner_draw: [
    { value: 'personal_use', label: 'Personal Use'     },
    { value: 'loan_payment', label: 'Loan Payment'     },
    { value: 'reinvestment', label: 'Reinvestment'     },
    { value: 'other_draw',   label: 'Other Withdrawal' },
  ],
  opex: [
    { value: 'utilities',  label: 'Utilities'    },
    { value: 'supplies',   label: 'Supplies'     },
    { value: 'rent',       label: 'Rent'         },
    { value: 'salaries',   label: 'Salaries'     },
    { value: 'transport',  label: 'Transport'    },
    { value: 'restock',    label: 'Restock'      },
    { value: 'other_opex', label: 'Other Expense'},
  ],
  capex: [
    { value: 'equipment',   label: 'Equipment'  },
    { value: 'renovation',  label: 'Renovation' },
    { value: 'fixtures',    label: 'Fixtures'   },
    { value: 'other_capex', label: 'Other'      },
  ],
};

function isAdmin() {
  return currentUser && currentUser.role === 'admin';
}

function formatPeso(amount) {
  return '₱' + Number(amount).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function renderSummary(data) {
  var net = Number(data.net);
  financeSummaryEl.innerHTML =
    '<div class="finance-stat">' +
      '<p class="finance-stat-label">Money In</p>' +
      '<p class="finance-stat-value positive">' + formatPeso(data.moneyIn) + '</p>' +
    '</div>' +
    '<div class="finance-stat">' +
      '<p class="finance-stat-label">Money Out</p>' +
      '<p class="finance-stat-value negative">' + formatPeso(data.moneyOut) + '</p>' +
    '</div>' +
    '<div class="finance-stat">' +
      '<p class="finance-stat-label">Net</p>' +
      '<p class="finance-stat-value ' + (net >= 0 ? 'positive' : 'negative') + '">' + formatPeso(net) + '</p>' +
    '</div>' +
    '<div class="finance-stat">' +
      '<p class="finance-stat-label">Utang (Outstanding)</p>' +
      '<p class="finance-stat-value utang">' + formatPeso(data.utang) + '</p>' +
    '</div>';
}

function renderMovements(list) {
  if (!list || list.length === 0) {
    financeTableBody.innerHTML =
      '<tr><td colspan="6" style="text-align:center;padding:40px;color:var(--color-text-muted);">No entries found.</td></tr>';
    return;
  }

  financeTableBody.innerHTML = list.map(function (entry) {
    var isOut = ['owner_draw', 'opex', 'capex'].includes(entry.type);
    var amountCls = isOut ? 'finance-amount is-out' : 'finance-amount is-in';
    var sign = isOut ? '−' : '+';
    var catLabel = entry.category ? entry.category.replace(/_/g, ' ') : '—';
    var dateStr  = entry.occurred_at ? String(entry.occurred_at).substring(0, 10) : '—';
    var actionsHtml = '';
    if (isAdmin() && entry.source === 'manual') {
      actionsHtml =
        '<td style="text-align:center;white-space:nowrap;">' +
          '<button type="button" class="restock-button finance-edit-btn" data-id="' + entry.id + '" title="Edit"><i data-lucide="pencil"></i></button>' +
          '&nbsp;' +
          '<button type="button" class="restock-button finance-delete-btn" data-id="' + entry.id + '" title="Delete" style="color:var(--color-danger,#dc2626);"><i data-lucide="trash-2"></i></button>' +
        '</td>';
    } else {
      actionsHtml = '<td></td>';
    }
    return '<tr>' +
      '<td>' + dateStr + '</td>' +
      '<td><span class="type-badge type-badge--' + entry.type + '">' + (TYPE_LABELS[entry.type] || entry.type) + '</span></td>' +
      '<td style="text-transform:capitalize;">' + catLabel + '</td>' +
      '<td class="' + amountCls + '">' + sign + ' ' + formatPeso(entry.amount) + '</td>' +
      '<td style="color:var(--color-text-muted);font-size:0.85em;">' + (entry.description || '—') + '</td>' +
      actionsHtml +
    '</tr>';
  }).join('');

  if (window.lucide) lucide.createIcons();
  attachTableActions();
}

function attachTableActions() {
  if (!isAdmin()) return;
  document.querySelectorAll('.finance-edit-btn').forEach(function (btn) {
    btn.addEventListener('click', function () { openEditModal(btn.dataset.id); });
  });
  document.querySelectorAll('.finance-delete-btn').forEach(function (btn) {
    btn.addEventListener('click', function () { handleDelete(btn.dataset.id); });
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
    if (el) el.textContent = '';
  });
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
    var [movResult, sumResult] = await Promise.all([
      getFinanceMovements(filters),
      getFinanceSummary(filters),
    ]);

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
  if (!occurred_at) { document.getElementById('finance-date-error').textContent   = 'Date is required';             hasError = true; }
  if (!type)        { document.getElementById('finance-type-error').textContent   = 'Type is required';             hasError = true; }
  if (!amount || amount <= 0) { document.getElementById('finance-amount-error').textContent = 'Amount must be greater than 0'; hasError = true; }
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
      document.getElementById('finance-amount-error').textContent = result ? result.message : 'Save failed.';
    }
  } catch (err) {
    showApiError('Network error. Is the server running?');
  } finally {
    financeSubmitBtn.disabled = false;
  }
});

if (isAdmin()) {
  if (addEntryButton) addEntryButton.style.display = '';
  if (financeActionsCol) financeActionsCol.textContent = 'Actions';
}

loadData();
