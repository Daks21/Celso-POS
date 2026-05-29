checkAuth();

const currentUser = JSON.parse(localStorage.getItem('currentUser'));
const userName    = document.getElementById('user-name');

const inventoryTableBody      = document.getElementById('inventory-table-body');
const inventorySearch         = document.getElementById('inventory-search');
const inventorySummary        = document.getElementById('inventory-summary');
const restockColHeader        = document.getElementById('restock-col-header');
const inventoryCategorySelect = document.getElementById('inventory-category-select');
const inventoryStatusSelect   = document.getElementById('inventory-status-select');

const restockModal         = document.getElementById('restock-modal');
const closeRestockModal    = document.getElementById('close-restock-modal');
const confirmRestock       = document.getElementById('confirm-restock');
const restockQuantityInput = document.getElementById('restock-quantity');
const restockProductInfo   = document.getElementById('restock-product-info');
const restockError         = document.getElementById('restock-error');

let products       = [];
let activeStatus   = 'all';
let activeCategory = 'All';
let restockingId   = null;
let currentPage    = 1;

const PAGE_SIZE = 20;

function isAdmin() {
  return currentUser && currentUser.role === 'admin';
}


async function renderSummary() {
  let data = {};
  try {
    const threshold = getLowStockThreshold();
    const result = await getInventorySummary(threshold);
    if (result && result.success) {
      data = result.data;
    } else {
      showApiError(result ? result.message : 'Failed to load inventory summary.');
    }
  } catch (err) {
    showApiError('Network error. Is the server running?');
  }

  const totalStocks   = data.totalItems      || 0;
  const totalProducts = data.totalProducts   || 0;
  const low           = data.lowStockCount   || 0;
  const out           = data.outOfStockCount || 0;

  inventorySummary.innerHTML =
    '<div class="summary-card">' +
      '<div class="summary-card-header">' +
        '<span class="summary-label">Total Stocks</span>' +
        '<div class="summary-icon"><i data-lucide="layers"></i></div>' +
      '</div>' +
      '<p class="summary-value">' + totalStocks + '</p>' +
    '</div>' +
    '<div class="summary-card">' +
      '<div class="summary-card-header">' +
        '<span class="summary-label">Total Products</span>' +
        '<div class="summary-icon"><i data-lucide="package"></i></div>' +
      '</div>' +
      '<p class="summary-value">' + totalProducts + '</p>' +
    '</div>' +
    '<div class="summary-card">' +
      '<div class="summary-card-header">' +
        '<span class="summary-label">Low Stock</span>' +
        '<div class="summary-icon"><i data-lucide="alert-triangle"></i></div>' +
      '</div>' +
      '<p class="summary-value" style="color:var(--stock-color-low);">' + low + '</p>' +
    '</div>' +
    '<div class="summary-card">' +
      '<div class="summary-card-header">' +
        '<span class="summary-label">Out of Stock</span>' +
        '<div class="summary-icon"><i data-lucide="x-circle"></i></div>' +
      '</div>' +
      '<p class="summary-value" style="color:var(--stock-color-out);">' + out + '</p>' +
    '</div>';

  if (window.lucide) lucide.createIcons();
}

function renderCategorySelect() {
  if (!inventoryCategorySelect) return;

  const categories = ['All', ...new Set(
    products.map(function (p) { return p.category; }).filter(Boolean)
  )];

  inventoryCategorySelect.innerHTML = '';
  categories.forEach(function (category) {
    const option = document.createElement('option');
    option.value = category;
    option.textContent = category === 'All' ? 'All Categories' : category;
    if (category === activeCategory) option.selected = true;
    inventoryCategorySelect.appendChild(option);
  });
}

function renderInventory(list) {
  inventoryTableBody.innerHTML = '';

  if (list.length === 0) {
    if (products.length === 0 && typeof OnboardingCore !== 'undefined') {
      OnboardingCore.renderEmptyState(inventoryTableBody, 'inventory', 5);
    } else {
      inventoryTableBody.innerHTML =
        '<tr><td colspan="5" style="text-align:center;padding:40px;' +
        'color:var(--color-text-muted);">No products match your search.</td></tr>';
    }
    return;
  }

  list.forEach(function (product) {
    const status = getStockStatus(product.stock);
    const row    = document.createElement('tr');

    const name     = escapeHtml(product.name);
    const category = escapeHtml(product.category);
    const unit     = escapeHtml(product.unit);

    const restockCell = isAdmin()
      ? '<td><button type="button" class="action-btn" data-id="' + product.id + '" title="Restock">' +
          '<i data-lucide="plus"></i>' +
        '</button></td>'
      : '<td></td>';

    row.innerHTML =
      '<td><strong>' + name + '</strong><span class="row-sub">' + category + '</span></td>' +
      '<td>' + category + '</td>' +
      '<td>' + product.stock + ' ' + unit + '</td>' +
      '<td><span class="stock-dot ' + status.dotCls + '"></span></td>' +
      restockCell;

    inventoryTableBody.appendChild(row);
  });

  if (window.lucide) lucide.createIcons();
  attachRestockEvents();
}

function attachRestockEvents() {
  if (!isAdmin()) return;

  document.querySelectorAll('.action-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      restockingId = btn.dataset.id;
      openRestockModal(restockingId);
    });
  });
}

function openRestockModal(productId) {
  const product = products.find(function (p) { return p.id == productId; });
  if (!product) return;

  restockProductInfo.innerHTML =
    '<h3>' + escapeHtml(product.name) + '</h3>' +
    '<p>Current stock: ' + product.stock + ' ' + escapeHtml(product.unit) + '</p>';

  restockQuantityInput.value = '';
  restockError.textContent   = '';
restockModal.style.display = 'flex';
}

function closeModal() {
  restockModal.style.display = 'none';
  restockingId = null;
}

async function handleRestock() {
  const quantity = Number(restockQuantityInput.value);
  restockError.textContent = '';

  if (!restockQuantityInput.value || isNaN(quantity)) {
    restockError.textContent = 'Please enter a quantity.';
    return;
  }

  if (!Number.isInteger(quantity) || quantity <= 0) {
    restockError.textContent = 'Quantity must be a whole number greater than 0.';
    return;
  }

  const payload = { quantity: quantity, type: 'restock' };

  confirmRestock.disabled = true;
  try {
    const result = await adjustStock(restockingId, payload);
    if (result && result.success) {
      closeModal();
      await refreshInventory();
      if (typeof OnboardingChecklist !== 'undefined') {
        OnboardingChecklist.complete('restock');
      }
    } else {
      restockError.textContent = result ? result.message : 'Restock failed. Please try again.';
    }
  } catch (err) {
    showApiError('Network error. Is the server running?');
  } finally {
    confirmRestock.disabled = false;
  }
}

function applyFilters() {
  const search = inventorySearch.value.trim().toLowerCase();
  let filtered = products.slice();

  if (activeCategory !== 'All') {
    filtered = filtered.filter(function (p) { return p.category === activeCategory; });
  }

  if (activeStatus !== 'all') {
    filtered = filtered.filter(function (p) { return getStockStatus(p.stock).key === activeStatus; });
  }

  if (search !== '') {
    filtered = filtered.filter(function (p) {
      return (p.name     || '').toLowerCase().includes(search) ||
             (p.category || '').toLowerCase().includes(search);
    });
  }

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  if (currentPage > totalPages) currentPage = totalPages;

  const start = (currentPage - 1) * PAGE_SIZE;
  renderInventory(filtered.slice(start, start + PAGE_SIZE));
  renderPagination(totalPages);
}

function renderPagination(totalPages) {
  const el = document.getElementById('inventory-pagination');
  if (!el) return;

  if (totalPages <= 1) {
    el.innerHTML = '';
    return;
  }

  el.innerHTML =
    '<button class="page-btn" id="prev-page"' + (currentPage === 1 ? ' disabled' : '') + '>&#8592;</button>' +
    '<span class="page-info">Page ' + currentPage + ' of ' + totalPages + '</span>' +
    '<button class="page-btn" id="next-page"' + (currentPage === totalPages ? ' disabled' : '') + '>&#8594;</button>';

  document.getElementById('prev-page').addEventListener('click', function () {
    if (currentPage > 1) { currentPage--; applyFilters(); }
  });
  document.getElementById('next-page').addEventListener('click', function () {
    if (currentPage < totalPages) { currentPage++; applyFilters(); }
  });
}

async function refreshInventory() {
  showLoading('#inventory-table-body');
  try {
    const result = await getInventory();
    if (result && result.success) {
      products = result.data || [];
    } else {
      showApiError(result ? result.message : 'Failed to load inventory.');
    }
  } catch (err) {
    showApiError('Network error. Is the server running?');
  } finally {
    hideLoading('#inventory-table-body');
  }
  renderCategorySelect();
  await renderSummary();
  applyFilters();

  // Gate the inventory tour: only fire when the table has at least one product
  // with a stock row rendered. Otherwise the .action-btn / .stock-dot steps
  // silently skip and the user misses the stock-status-colors explanation.
  if (typeof OnboardingTour !== 'undefined' && typeof OnboardingTours !== 'undefined') {
    var hasInventoryRows = !!document.querySelector('#inventory-table-body .stock-dot');
    if (hasInventoryRows) {
      OnboardingTour.start('inventory', OnboardingTours.inventory);
    }
  }
}

if (currentUser && userName) {
  userName.textContent = currentUser.fullName;
}

inventorySearch.addEventListener('input', function () {
  currentPage = 1;
  applyFilters();
});

if (inventoryCategorySelect) {
  inventoryCategorySelect.addEventListener('change', function () {
    activeCategory = inventoryCategorySelect.value;
    currentPage = 1;
    applyFilters();
  });
}

if (inventoryStatusSelect) {
  inventoryStatusSelect.addEventListener('change', function () {
    activeStatus = inventoryStatusSelect.value;
    currentPage = 1;
    applyFilters();
  });
}

closeRestockModal.addEventListener('click', closeModal);
confirmRestock.addEventListener('click', handleRestock);

restockModal.addEventListener('click', function (e) {
  if (e.target === restockModal) closeModal();
});

refreshInventory();
