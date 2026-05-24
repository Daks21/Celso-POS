checkAuth();

const currentUser = JSON.parse(localStorage.getItem("currentUser"));

const salesTableBody = document.getElementById("sales-table-body");
const salesEmptyState = document.getElementById("sales-empty-state");
const historySummary = document.getElementById("history-summary");

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
    historySummary.textContent = "Showing 0 transactions | Total: ₱0.00";
    const pager = document.getElementById('history-pagination');
    if (pager) pager.innerHTML = '';
    return;
  }

  salesEmptyState.style.display = "none";

  const totalPages = Math.max(1, Math.ceil(salesArray.length / PAGE_SIZE));
  if (currentPage > totalPages) currentPage = totalPages;
  const start = (currentPage - 1) * PAGE_SIZE;
  const pageSlice = salesArray.slice(start, start + PAGE_SIZE);

  pageSlice.forEach(function (sale) {
    const row = document.createElement("tr");

    const saleDate = new Date(sale.timestamp);
    const itemCount = sale.items.reduce(function (sum, item) {
      return sum + item.quantity;
    }, 0);

    row.innerHTML = `
      <td>${formatReceiptNumber(sale)}</td>
      <td>${saleDate.toLocaleDateString("en-PH")}</td>
      <td>${saleDate.toLocaleTimeString("en-PH", { hour: '2-digit', minute: '2-digit' })}</td>
      <td>${itemCount}</td>
      <td>${formatPeso(sale.total)}</td>
      <td>${sale.cashier}</td>
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
      showReceipt(result.data);
    } else {
      showApiError(result ? result.message : 'Failed to load sale details.');
    }
  } catch (err) {
    showApiError('Network error. Is the server running?');
  }
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
