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

fromDateInput.addEventListener("change", function () { filterSales(); });
toDateInput.addEventListener("change", function () { filterSales(); });
receiptSearchInput.addEventListener("keyup", function () { filterSales(); });

resetFiltersButton.addEventListener("click", async function () {
  fromDateInput.value = "";
  toDateInput.value = "";
  receiptSearchInput.value = "";

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

function renderSales(salesArray) {
  salesTableBody.innerHTML = "";

  if (salesArray.length === 0) {
    salesEmptyState.style.display = "block";
    historySummary.textContent = "Showing 0 transactions | Total: ₱0.00";
    return;
  }

  salesEmptyState.style.display = "none";

  salesArray.forEach(function (sale) {
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
}

async function filterSales() {
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
}

init();
