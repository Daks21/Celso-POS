checkAuth();

const currentUser = JSON.parse(localStorage.getItem("currentUser"));

const salesTableBody = document.getElementById("sales-table-body");
const salesEmptyState = document.getElementById("sales-empty-state");
const historySummary = document.getElementById("history-summary");
const tableWrapper = document.querySelector(".table-wrapper");

const fromDateInput = document.getElementById("from-date");
const toDateInput = document.getElementById("to-date");
const receiptSearchInput = document.getElementById("receipt-search");
const resetFiltersButton = document.getElementById("reset-filters-button");

let sales = [];
let filteredSales = [];
let currentPage = 1;
const PAGE_SIZE = 20;

fromDateInput.addEventListener("change", function () { filterSales(); });
toDateInput.addEventListener("change", function () { filterSales(); });
receiptSearchInput.addEventListener("input", function () { filterSales(); });

resetFiltersButton.addEventListener("click", async function () {
  fromDateInput.value = "";
  toDateInput.value = "";
  receiptSearchInput.value = "";
  currentPage = 1;

  showLoading('#sales-table-body');
  try {
    const result = await getSales();
    if (result && result.success) {
      sales = result.data || [];
      renderSales(sales);
    } else {
      showApiError(result ? result.message : 'Failed to load sales.');
    }
  } catch (err) {
    showApiError('Network error. Is the server running?');
  } finally {
    hideLoading('#sales-table-body');
  }
});

function formatReceiptNumber(sale) {
  return sale.receiptNo || `RCPT-${sale.id}`;
}

function renderHistoryPagination(totalPages) {
  const el = document.getElementById('history-pagination');
  if (!el) return;

  if (totalPages <= 1) { el.innerHTML = ''; return; }

  el.innerHTML =
    '<button class="page-btn" id="hist-prev-page"' + (currentPage === 1 ? ' disabled' : '') + '>&#8592;</button>' +
    '<span class="page-info">Page ' + currentPage + ' of ' + totalPages + '</span>' +
    '<button class="page-btn" id="hist-next-page"' + (currentPage === totalPages ? ' disabled' : '') + '>&#8594;</button>';

  document.getElementById('hist-prev-page').addEventListener('click', function () {
    if (currentPage > 1) { currentPage--; renderSales(filteredSales); }
  });
  document.getElementById('hist-next-page').addEventListener('click', function () {
    if (currentPage < totalPages) { currentPage++; renderSales(filteredSales); }
  });
}

function renderSales(salesArray) {
  filteredSales = salesArray;
  salesTableBody.innerHTML = "";

  if (salesArray.length === 0) {
    salesEmptyState.style.display = "block";
    if (tableWrapper) tableWrapper.style.display = "none";
    historySummary.textContent = "Showing 0 transactions | Total: ₱0.00";
    const pager = document.getElementById('history-pagination');
    if (pager) pager.innerHTML = '';
    return;
  }

  salesEmptyState.style.display = "none";
  if (tableWrapper) tableWrapper.style.display = "";

  const totalPages = Math.max(1, Math.ceil(salesArray.length / PAGE_SIZE));
  if (currentPage > totalPages) currentPage = totalPages;
  const start = (currentPage - 1) * PAGE_SIZE;
  const pageSlice = salesArray.slice(start, start + PAGE_SIZE);

  pageSlice.forEach(function (sale) {
    const row = document.createElement("tr");

    const itemCount = sale.items.reduce(function (sum, item) {
      return sum + item.quantity;
    }, 0);

    row.innerHTML = `
      <td>${escapeHtml(formatReceiptNumber(sale))}</td>
      <td>${escapeHtml(formatDateTz(sale.timestamp))}</td>
      <td>${escapeHtml(formatTimeTz(sale.timestamp, { hour: '2-digit', minute: '2-digit' }))}</td>
      <td>${itemCount}</td>
      <td>${escapeHtml(formatPeso(sale.total))}</td>
      <td>${escapeHtml(sale.cashier)}</td>
      <td>
        <button type="button" class="table-button edit-button view-sale-button" data-id="${sale.id}">
          View
        </button>
      </td>
    `;

    salesTableBody.appendChild(row);
  });

  attachViewSaleEvents();

  const totalSalesAmount = salesArray.reduce(function (sum, sale) {
    return sum + sale.total;
  }, 0);

  historySummary.textContent = `Showing ${salesArray.length} transaction(s) | Total: ${formatPeso(totalSalesAmount)}`;
  renderHistoryPagination(totalPages);
}

async function filterSales() {
  currentPage = 1;
  const fromDate = fromDateInput.value;
  const toDate = toDateInput.value;
  const receiptSearch = receiptSearchInput.value.trim().toLowerCase();

  const params = {};
  if (fromDate) params.from = fromDate;
  if (toDate) params.to = toDate;

  showLoading('#sales-table-body');
  try {
    const result = await getSales(params);
    if (result && result.success) {
      let filtered = result.data || [];
      if (receiptSearch !== '') {
        filtered = filtered.filter(function (sale) {
          return formatReceiptNumber(sale).toLowerCase().includes(receiptSearch);
        });
      }
      renderSales(filtered);
    } else {
      showApiError(result ? result.message : 'Failed to load sales.');
    }
  } catch (err) {
    showApiError('Network error. Is the server running?');
  } finally {
    hideLoading('#sales-table-body');
  }
}

function attachViewSaleEvents() {
  document.querySelectorAll(".view-sale-button").forEach(function (button) {
    button.addEventListener("click", function () {
      openSaleDetailModal(button.dataset.id);
    });
  });
}

async function openSaleDetailModal(saleId) {
  try {
    const result = await getSale(saleId);
    if (result && result.success) {
      currentSale = result.data;
      showReceipt(result.data);
      if (editSaleButton) editSaleButton.style.display = isAdmin() ? '' : 'none';
    } else {
      showApiError(result ? result.message : 'Failed to load sale details.');
    }
  } catch (err) {
    showApiError('Network error. Is the server running?');
  }
}

// ─── Edit Sale (admin only) ─────────────────────────────────────────────────
// The Edit button lives inside the View/receipt modal. Editing reconciles stock,
// finance, and analytics server-side (PUT /api/sales/:id); the client only sends
// new per-line quantities, the tax toggle, and the payment.

let currentSale = null;   // the sale currently shown in the View modal
let editLines = [];       // working copy: { itemId, name, price, qty }

const editSaleButton   = document.getElementById("edit-sale-button");
const editSaleModal    = document.getElementById("edit-sale-modal");
const editSaleItems    = document.getElementById("edit-sale-items");
const editSaleReceipt  = document.getElementById("edit-sale-receipt");
const editTaxRow       = document.getElementById("edit-sale-tax-row");
const editTaxToggle    = document.getElementById("edit-tax-toggle");
const editTaxRateLabel = document.getElementById("edit-tax-rate");
const editSubtotalEl   = document.getElementById("edit-subtotal");
const editTaxLine      = document.getElementById("edit-tax-line");
const editTaxEl        = document.getElementById("edit-tax");
const editTotalEl      = document.getElementById("edit-total");
const editPaymentInput = document.getElementById("edit-payment");
const editChangeEl     = document.getElementById("edit-change");
const editErrorEl      = document.getElementById("edit-sale-error");
const saveEditButton   = document.getElementById("save-edit-button");
const cancelEditButton = document.getElementById("cancel-edit-button");
const closeEditButton  = document.getElementById("close-edit-button");

function isAdmin() {
  return !!(currentUser && currentUser.role === 'admin');
}

function openEditModal() {
  if (!currentSale || !isAdmin()) return;

  editLines = currentSale.items.map(function (it) {
    return { itemId: it.id, name: it.name, price: it.price, qty: it.quantity };
  });

  editSaleReceipt.textContent = formatReceiptNumber(currentSale);

  // Tax can only be toggled when the original sale carried a tax rate.
  const rate = Number(currentSale.taxRate) || 0;
  if (rate > 0) {
    editTaxRow.style.display = '';
    editTaxToggle.checked = !!currentSale.cartTaxOn;
    const pct = rate * 100;
    editTaxRateLabel.textContent = (pct % 1 === 0 ? pct.toFixed(0) : pct.toFixed(2)) + '%';
  } else {
    editTaxRow.style.display = 'none';
    editTaxToggle.checked = false;
  }

  editPaymentInput.value = Number(currentSale.payment).toFixed(2);
  if (editErrorEl) { editErrorEl.style.display = 'none'; editErrorEl.textContent = ''; }

  renderEditLines();
  if (typeof receiptModal !== 'undefined' && receiptModal) receiptModal.style.display = 'none';
  editSaleModal.style.display = 'flex';
}

function closeEditModal() {
  editSaleModal.style.display = 'none';
}

function renderEditLines() {
  editSaleItems.innerHTML = '';
  editLines.forEach(function (line, index) {
    const row = document.createElement('div');
    row.className = 'edit-line' + (line.qty === 0 ? ' edit-line--removed' : '');
    row.innerHTML =
      '<div class="edit-line-info">' +
        '<span class="edit-line-name">' + escapeHtml(line.name) + '</span>' +
        '<span class="edit-line-price">' + escapeHtml(formatPeso(line.price)) + ' each</span>' +
      '</div>' +
      '<div class="edit-line-qty">' +
        '<button type="button" class="qty-btn" data-act="dec" data-i="' + index + '" aria-label="Decrease quantity">−</button>' +
        '<span class="edit-line-count">' + line.qty + '</span>' +
        '<button type="button" class="qty-btn" data-act="inc" data-i="' + index + '" aria-label="Increase quantity">+</button>' +
      '</div>' +
      '<span class="edit-line-total">' + escapeHtml(formatPeso(line.price * line.qty)) + '</span>' +
      '<button type="button" class="edit-line-remove" data-act="rm" data-i="' + index + '" aria-label="Remove item">×</button>';
    editSaleItems.appendChild(row);
  });
  recalcEdit();
}

function recalcEdit() {
  let subtotal = 0;
  let liveLines = 0;
  editLines.forEach(function (l) {
    if (l.qty > 0) { subtotal += l.price * l.qty; liveLines += 1; }
  });
  subtotal = Math.round(subtotal * 100) / 100;

  const rate = Number(currentSale.taxRate) || 0;
  const taxOn = rate > 0 && editTaxToggle.checked;
  const tax = taxOn ? Math.round(subtotal * rate * 100) / 100 : 0;
  const total = Math.round((subtotal + tax) * 100) / 100;
  const payment = Number(editPaymentInput.value);
  const change = (!isNaN(payment) ? payment : 0) - total;

  editSubtotalEl.textContent = formatPeso(subtotal);
  editTaxLine.style.display = taxOn ? '' : 'none';
  editTaxEl.textContent = formatPeso(tax);
  editTotalEl.textContent = formatPeso(total);
  editChangeEl.textContent = formatPeso(change >= 0 ? change : 0);

  let error = '';
  if (liveLines === 0) error = 'Keep at least one item, or close without saving.';
  else if (isNaN(payment)) error = 'Enter the payment amount.';
  else if (payment < total) error = 'Payment cannot be less than ' + formatPeso(total) + '.';

  if (error) {
    editErrorEl.textContent = error;
    editErrorEl.style.display = 'block';
    saveEditButton.disabled = true;
  } else {
    editErrorEl.style.display = 'none';
    saveEditButton.disabled = false;
  }
}

if (editSaleItems) {
  editSaleItems.addEventListener('click', function (e) {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const i = Number(btn.dataset.i);
    const line = editLines[i];
    if (!line) return;
    const act = btn.dataset.act;
    if (act === 'inc') line.qty += 1;
    else if (act === 'dec') line.qty = Math.max(0, line.qty - 1);
    else if (act === 'rm') line.qty = 0;
    renderEditLines();
  });
}

if (editTaxToggle)    editTaxToggle.addEventListener('change', recalcEdit);
if (editPaymentInput) editPaymentInput.addEventListener('input', recalcEdit);
if (editSaleButton)   editSaleButton.addEventListener('click', openEditModal);
if (cancelEditButton) cancelEditButton.addEventListener('click', closeEditModal);
if (closeEditButton)  closeEditButton.addEventListener('click', closeEditModal);
if (editSaleModal) {
  editSaleModal.addEventListener('click', function (e) {
    if (e.target === editSaleModal) closeEditModal();
  });
}

if (saveEditButton) {
  saveEditButton.addEventListener('click', async function () {
    if (!currentSale) return;
    const payload = {
      items: editLines.map(function (l) { return { itemId: l.itemId, quantity: l.qty }; }),
      cartTaxOn: !!(editTaxToggle && editTaxToggle.checked),
      payment: Number(editPaymentInput.value),
    };

    const original = saveEditButton.textContent;
    saveEditButton.disabled = true;
    saveEditButton.textContent = 'Saving...';
    try {
      const result = await updateSale(currentSale.id, payload);
      if (result && result.success) {
        closeEditModal();
        showApiSuccess('Sale updated.');
        filterSales();   // refresh the table honoring the current filters
      } else {
        showApiError(result ? result.message : 'Failed to update sale.');
        saveEditButton.disabled = false;
      }
    } catch (err) {
      showApiError('Network error. Is the server running?');
      saveEditButton.disabled = false;
    } finally {
      saveEditButton.textContent = original;
    }
  });
}

async function init() {
  showLoading('#sales-table-body');
  try {
    const result = await getSales();
    if (result && result.success) {
      sales = result.data || [];
      renderSales(sales);
    } else {
      showApiError(result ? result.message : 'Failed to load sales history.');
    }
  } catch (err) {
    showApiError('Network error. Is the server running?');
  } finally {
    hideLoading('#sales-table-body');
  }

  if (typeof OnboardingChecklist !== 'undefined') {
    OnboardingChecklist.complete('viewHistory');
  }
}

init();
