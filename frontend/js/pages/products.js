let products = [];
let editingProductId = null;

checkAuth();

const currentUser = JSON.parse(localStorage.getItem('currentUser') || 'null');

const productsTableBody = document.getElementById("products-table-body");

const productModal = document.getElementById("product-modal");
const modalTitle = document.getElementById("modal-title");

const productNameInput = document.getElementById("product-name");
const productCategoryInput = document.getElementById("product-category");
const productPriceInput = document.getElementById("product-price");
const productCostInput = document.getElementById("product-cost");
const productUnitInput = document.getElementById("product-unit");

const addProductButton = document.getElementById("add-product-button");
const closeModalButton = document.getElementById("close-modal-button");
const productForm = document.getElementById("product-form");
const submitButton = productForm.querySelector('[type="submit"]');

const productSearchInput = document.getElementById("product-search");
const productSearchClear = document.getElementById("product-search-clear");
const productCategorySelect = document.getElementById('product-category-select');

let activeCategory = 'All';
let currentPage = 1;
const PAGE_SIZE = 20;

function renderCategorySelect() {
  if (!productCategorySelect) return;

  const categories = ['All', ...new Set(
    products.map(function (p) { return p.category; }).filter(Boolean)
  )];

  productCategorySelect.innerHTML = '';
  categories.forEach(function (category) {
    const option = document.createElement('option');
    option.value = category;
    option.textContent = category === 'All' ? 'All Categories' : category;
    if (category === activeCategory) option.selected = true;
    productCategorySelect.appendChild(option);
  });
}

// Suggest existing categories in the Add/Edit form so the owner reuses
// "Drinks" instead of inventing "drinks" — but it stays a free-text input,
// so a genuinely new category can still be typed.
function renderCategoryDatalist() {
  const dl = document.getElementById('product-category-list');
  if (!dl) return;

  const categories = Array.from(new Set(
    products.map(function (p) { return p.category; }).filter(Boolean)
  )).sort(function (a, b) { return String(a).localeCompare(String(b)); });

  dl.innerHTML = '';
  categories.forEach(function (category) {
    const option = document.createElement('option');
    option.value = category;
    dl.appendChild(option);
  });
}

function applyFilters() {
  const search = productSearchInput.value.trim().toLowerCase();

  let filtered = products.slice();

  if (activeCategory !== 'All') {
    filtered = filtered.filter(function (p) { return p.category === activeCategory; });
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
  renderProducts(filtered.slice(start, start + PAGE_SIZE));
  renderPagination(totalPages);
}

function renderPagination(totalPages) {
  const el = document.getElementById('products-pagination');
  if (!el) return;

  if (totalPages <= 1) {
    el.innerHTML = '';
    return;
  }

  el.innerHTML =
    '<button class="page-btn" id="prod-prev-page"' + (currentPage === 1 ? ' disabled' : '') + '>&#8592;</button>' +
    '<span class="page-info">Page ' + currentPage + ' of ' + totalPages + '</span>' +
    '<button class="page-btn" id="prod-next-page"' + (currentPage === totalPages ? ' disabled' : '') + '>&#8594;</button>';

  document.getElementById('prod-prev-page').addEventListener('click', function () {
    if (currentPage > 1) { currentPage--; applyFilters(); }
  });
  document.getElementById('prod-next-page').addEventListener('click', function () {
    if (currentPage < totalPages) { currentPage++; applyFilters(); }
  });
}

async function refreshProducts() {
  showLoading('#products-table-body');
  try {
    const result = await getProducts();
    if (result && result.success) {
      products = result.data || [];
    } else {
      showApiError(result ? result.message : 'Failed to load products.');
    }
  } catch (err) {
    showApiError('Network error. Is the server running?');
  } finally {
    hideLoading('#products-table-body');
  }
  renderCategorySelect();
  renderCategoryDatalist();
  applyFilters();

  if (typeof OnboardingTour !== 'undefined' && typeof OnboardingTours !== 'undefined') {
    OnboardingTour.start('products', OnboardingTours.products);
  }
}

// Show the clear ("X") button only while the field has text.
function syncSearchClear() {
  if (productSearchClear) productSearchClear.hidden = productSearchInput.value === "";
}

function runProductSearch() {
  currentPage = 1;
  applyFilters();
  syncSearchClear();
}

function clearProductSearch() {
  productSearchInput.value = "";
  runProductSearch();
  productSearchInput.focus();
}

productSearchInput.addEventListener("input", runProductSearch);

// ESC clears the field (keyboard). Stop it here so it never reaches the
// global Escape handler that closes modals.
productSearchInput.addEventListener("keydown", function (e) {
  if (e.key === "Escape" && productSearchInput.value !== "") {
    e.preventDefault();
    e.stopPropagation();
    clearProductSearch();
  }
});

// Tap-to-clear (touch / mouse).
if (productSearchClear) {
  productSearchClear.addEventListener("click", clearProductSearch);
}

if (productCategorySelect) {
  productCategorySelect.addEventListener('change', function () {
    activeCategory = productCategorySelect.value;
    currentPage = 1;
    applyFilters();
  });
}

addProductButton.addEventListener("click", function () {
  openAddProductModal();
});

closeModalButton.addEventListener("click", function () {
  closeProductModal();
});

const PRODUCT_UNITS = ['piece', 'pack', 'bottle', 'can', 'sachet', 'box', 'kg', 'liter'];

function clearProductErrors() {
  [productNameInput, productCategoryInput, productPriceInput, productCostInput, productUnitInput]
    .forEach(function (input) {
      const group = input.closest('.form-group');
      if (group) group.classList.remove('has-error');
    });
  ['product-name-error', 'product-category-error', 'product-price-error', 'product-cost-error', 'product-unit-error']
    .forEach(function (id) {
      const el = document.getElementById(id);
      if (el) el.textContent = '';
    });
}

// Block submission unless every field is filled and valid. Mirrors the
// server-side rules so the owner gets an inline message instead of a round-trip
// error toast. The form carries `novalidate`, so this is the authoritative gate.
function validateProductForm(data) {
  clearProductErrors();
  let firstInvalid = null;

  function fail(input, errorId, message) {
    const group = input.closest('.form-group');
    if (group) group.classList.add('has-error');
    const el = document.getElementById(errorId);
    if (el) el.textContent = message;
    if (!firstInvalid) firstInvalid = input;
  }

  if (!data.name)
    fail(productNameInput, 'product-name-error', 'Product name is required.');
  if (!data.category)
    fail(productCategoryInput, 'product-category-error', 'Category is required.');
  if (productPriceInput.value.trim() === '' || !Number.isFinite(data.price) || data.price <= 0)
    fail(productPriceInput, 'product-price-error', 'Price must be a number greater than 0.');
  if (productCostInput.value.trim() === '' || !Number.isFinite(data.cost) || data.cost < 0)
    fail(productCostInput, 'product-cost-error', 'Cost must be a number of 0 or more.');
  if (!data.unit || PRODUCT_UNITS.indexOf(data.unit) === -1)
    fail(productUnitInput, 'product-unit-error', 'Please select a unit.');

  if (firstInvalid) {
    firstInvalid.focus();
    return false;
  }
  return true;
}

productForm.addEventListener("submit", async function (event) {
  event.preventDefault();

  const productData = {
    name: productNameInput.value.trim(),
    category: productCategoryInput.value.trim(),
    price: Number(productPriceInput.value),
    cost: Number(productCostInput.value),
    unit: productUnitInput.value
  };

  if (!validateProductForm(productData)) return;

  const isNewProduct = editingProductId === null;
  if (submitButton) submitButton.disabled = true;

  try {
    let result;
    if (editingProductId === null) {
      result = await createProduct(productData);
    } else {
      result = await updateProduct(editingProductId, productData);
    }

    if (result && result.success) {
      await refreshProducts();
      closeProductModal();
      if (isNewProduct) {
        if (typeof OnboardingChecklist !== 'undefined') {
          OnboardingChecklist.complete('addProduct');
        }
        showAddStockToast(result.data);
      }
    } else if (result && result.archivedMatch && isNewProduct) {
      // The name matches a previously-deleted product. Let the owner restore it
      // (keeps history) instead of silently creating a duplicate.
      openArchivedTwinPrompt(productData, result.data);
    } else {
      showApiError(result ? result.message : 'Failed to save product.');
    }
  } catch (err) {
    showApiError('Network error. Is the server running?');
  } finally {
    if (submitButton) submitButton.disabled = false;
  }
});

productModal.addEventListener("click", function (event) {
  if (event.target === productModal) {
    closeProductModal();
  }
});

function renderProducts(productList) {
  if (products.length === 0) {
    if (typeof OnboardingCore !== 'undefined') {
      OnboardingCore.renderEmptyState(productsTableBody, 'products', 5);
    }
    return;
  }

  productsTableBody.innerHTML = "";

  (productList || products).forEach(function (product) {
    const row = document.createElement("tr");

    const name     = escapeHtml(product.name);
    const category = escapeHtml(product.category);

    row.innerHTML = `
      <td>${name}</td>
      <td>${category}</td>
      <td>${formatPeso(Number(product.price))}</td>
      <td>${formatPeso(Number(product.cost))}</td>
      <td class="actions-cell">
        <div class="kebab-wrapper">
          <button type="button" class="kebab-btn" data-id="${product.id}" title="Actions">
            <i data-lucide="more-vertical"></i>
          </button>
          <div class="kebab-dropdown">
            <button type="button" class="kebab-item edit-btn" data-id="${product.id}">
              <i data-lucide="pencil"></i> Edit
            </button>
            <button type="button" class="kebab-item delete-btn" data-id="${product.id}">
              <i data-lucide="trash-2"></i> Delete
            </button>
          </div>
        </div>
      </td>
    `;

    productsTableBody.appendChild(row);
  });

  lucide.createIcons();
  attachProductActionEvents();
}

function closeAllDropdowns() {
  document.querySelectorAll('.kebab-dropdown.open').forEach(function (d) {
    d.classList.remove('open');
  });
}

function attachProductActionEvents() {
  document.querySelectorAll(".kebab-btn").forEach(function (button) {
    button.addEventListener("click", function (e) {
      e.stopPropagation();
      const dropdown = button.nextElementSibling;
      const isOpen = dropdown.classList.contains('open');
      closeAllDropdowns();
      if (!isOpen) dropdown.classList.add('open');
    });
  });

  document.querySelectorAll(".edit-btn").forEach(function (button) {
    button.addEventListener("click", function () {
      closeAllDropdowns();
      openEditProductModal(button.dataset.id);
    });
  });

  document.querySelectorAll(".delete-btn").forEach(function (button) {
    button.addEventListener("click", function () {
      closeAllDropdowns();
      handleDeleteProduct(button.dataset.id);
    });
  });
}

function openEditProductModal(productId) {
  const product = products.find(function (p) { return p.id == productId; });
  if (!product) return;

  clearProductErrors();
  editingProductId = productId;
  modalTitle.textContent = "Edit Product";

  productNameInput.value = product.name;
  productCategoryInput.value = product.category;
  productPriceInput.value = product.price;
  productCostInput.value = product.cost;
  productUnitInput.value = product.unit;

  productModal.style.display = "flex";
}

async function handleDeleteProduct(productId) {
  if (!window.confirm("Are you sure you want to delete this product?")) return;

  try {
    const result = await deleteProduct(productId);
    if (result && result.success) {
      await refreshProducts();
    } else {
      showApiError(result ? result.message : 'Failed to delete product.');
    }
  } catch (err) {
    showApiError('Network error. Is the server running?');
  }
}

function openAddProductModal() {
  editingProductId = null;
  modalTitle.textContent = "Add Product";
  productForm.reset();
  clearProductErrors();
  productModal.style.display = "flex";
}

function closeProductModal() {
  productModal.style.display = "none";
  productForm.reset();
  editingProductId = null;
}

// After creating a product (which always starts at stock = 0), nudge the owner
// to add stock. Restock is admin-only server-side, so non-admins just get a
// plain confirmation with no dead-end action link.
function showAddStockToast(product) {
  if (!product || product.id == null) return;
  const isAdmin = currentUser && currentUser.role === 'admin';
  if (isAdmin && typeof showActionToast === 'function') {
    showActionToast('Product added', 'Add stock now →', function () {
      window.location.href = 'inventory.html?restock=' + encodeURIComponent(product.id);
    });
  } else if (typeof showApiSuccess === 'function') {
    showApiSuccess('Product added');
  }
}

document.addEventListener('click', function (e) {
  if (!e.target.closest('.kebab-wrapper')) closeAllDropdowns();
});

// ── Archived products (restore deleted items instead of re-creating) ──

const viewArchivedButton = document.getElementById('view-archived-button');
const archivedModal = document.getElementById('archived-modal');
const archivedCloseButton = document.getElementById('archived-close-button');
const archivedList = document.getElementById('archived-list');
const archivedSearchInput = document.getElementById('archived-search');
const archivedHint = document.getElementById('archived-hint');
let archivedSearchTimer = null;

const archivedTwinModal = document.getElementById('archived-twin-modal');
const twinCloseButton = document.getElementById('twin-close-button');
const twinMessage = document.getElementById('twin-message');
const twinRestoreButton = document.getElementById('twin-restore-button');
const twinAddNewButton = document.getElementById('twin-addnew-button');

// Holds the form data + matched archived row while the twin prompt is open.
let pendingProductData = null;
let pendingArchivedMatch = null;

function openArchivedModal() {
  if (!archivedModal) return;
  if (archivedSearchInput) archivedSearchInput.value = '';
  archivedModal.style.display = 'flex';
  loadArchived('');
}

function closeArchivedModal() {
  archivedModal.style.display = 'none';
}

// Current archived search term (empty = show the most-recent page).
function currentArchivedSearch() {
  return archivedSearchInput ? archivedSearchInput.value.trim() : '';
}

async function loadArchived(search) {
  const term = (search || '').trim();
  archivedList.innerHTML = '<p class="archived-empty">Loading…</p>';
  if (archivedHint) archivedHint.textContent = '';
  try {
    const result = await getArchivedProducts(term ? { search: term } : {});
    if (result && result.success) {
      renderArchived(result.data || [], term);
      // The query is capped; tell the owner to search if there are older items
      // beyond the cap (only meaningful on the unfiltered list).
      if (archivedHint && result.hasMore) {
        archivedHint.textContent = 'Showing the 50 most recent. Search to find older items.';
      }
    } else {
      archivedList.innerHTML = '<p class="archived-empty">Failed to load archived products.</p>';
    }
  } catch (err) {
    archivedList.innerHTML = '<p class="archived-empty">Network error. Is the server running?</p>';
  }
}

function renderArchived(list, term) {
  if (!list.length) {
    archivedList.innerHTML = term
      ? '<p class="archived-empty">No archived products match “' + escapeHtml(term) + '”.</p>'
      : '<p class="archived-empty">No archived products. Deleted items will appear here.</p>';
    return;
  }

  archivedList.innerHTML = '';
  list.forEach(function (product) {
    const row = document.createElement('div');
    row.className = 'archived-row';
    row.innerHTML =
      '<div class="archived-info">' +
        '<span class="archived-name">' + escapeHtml(product.name) + '</span>' +
        '<span class="archived-meta">' + escapeHtml(product.category) +
          ' · ' + formatPeso(Number(product.price)) + '</span>' +
      '</div>' +
      '<button type="button" class="secondary-button archived-restore" data-id="' +
        product.id + '">Restore</button>';
    archivedList.appendChild(row);
  });

  archivedList.querySelectorAll('.archived-restore').forEach(function (btn) {
    btn.addEventListener('click', function () {
      restoreFromList(btn.dataset.id, btn);
    });
  });
}

async function restoreFromList(productId, btn) {
  btn.disabled = true;
  try {
    const result = await restoreProduct(productId);
    if (result && result.success) {
      showApiSuccess('Product restored');
      await refreshProducts();
      await loadArchived(currentArchivedSearch());
    } else {
      showApiError(result ? result.message : 'Failed to restore product.');
      btn.disabled = false;
    }
  } catch (err) {
    showApiError('Network error. Is the server running?');
    btn.disabled = false;
  }
}

function openArchivedTwinPrompt(productData, archivedProduct) {
  pendingProductData = productData;
  pendingArchivedMatch = archivedProduct;
  if (!archivedTwinModal || !twinMessage) {
    // Twin modal markup missing (shouldn't happen) — fail safe by adding as new
    // rather than dead-ending the owner with an unhandled error.
    confirmTwinAddNew();
    return;
  }
  twinMessage.textContent =
    'You archived "' + archivedProduct.name + '" before. Restoring brings it ' +
    'back with all its past sales history. Adding it as new starts a separate ' +
    'item, so its old records stay with the archived one.';
  archivedTwinModal.style.display = 'flex';
}

function closeArchivedTwinPrompt() {
  archivedTwinModal.style.display = 'none';
  pendingProductData = null;
  pendingArchivedMatch = null;
}

// Shared post-save flow for both twin choices: close everything, refresh, and
// nudge to add stock (new products always start at 0).
async function finishTwinSave(result) {
  closeArchivedTwinPrompt();
  closeProductModal();
  await refreshProducts();
  if (typeof OnboardingChecklist !== 'undefined') {
    OnboardingChecklist.complete('addProduct');
  }
  showAddStockToast(result.data);
}

async function confirmTwinRestore() {
  if (!pendingArchivedMatch || !pendingProductData) return;
  twinRestoreButton.disabled = true;
  try {
    const result = await restoreProduct(pendingArchivedMatch.id, pendingProductData);
    if (result && result.success) {
      await finishTwinSave(result);
    } else {
      showApiError(result ? result.message : 'Failed to restore product.');
    }
  } catch (err) {
    showApiError('Network error. Is the server running?');
  } finally {
    twinRestoreButton.disabled = false;
  }
}

async function confirmTwinAddNew() {
  if (!pendingProductData) return;
  twinAddNewButton.disabled = true;
  try {
    const result = await createProduct(Object.assign({}, pendingProductData, { allowDuplicate: true }));
    if (result && result.success) {
      await finishTwinSave(result);
    } else {
      showApiError(result ? result.message : 'Failed to add product.');
    }
  } catch (err) {
    showApiError('Network error. Is the server running?');
  } finally {
    twinAddNewButton.disabled = false;
  }
}

// The archived + twin modals are progressive enhancements. Guard their wiring
// so a missing element can never throw here and block the core product table
// (refreshProducts) below from rendering.
if (viewArchivedButton && archivedModal && archivedCloseButton && archivedList) {
  viewArchivedButton.addEventListener('click', openArchivedModal);
  archivedCloseButton.addEventListener('click', closeArchivedModal);
  archivedModal.addEventListener('click', function (event) {
    if (event.target === archivedModal) closeArchivedModal();
  });

  if (archivedSearchInput) {
    archivedSearchInput.addEventListener('input', function () {
      clearTimeout(archivedSearchTimer);
      archivedSearchTimer = setTimeout(function () {
        loadArchived(archivedSearchInput.value);
      }, 250);
    });
  }
}

if (archivedTwinModal && twinCloseButton && twinRestoreButton && twinAddNewButton) {
  twinCloseButton.addEventListener('click', closeArchivedTwinPrompt);
  archivedTwinModal.addEventListener('click', function (event) {
    if (event.target === archivedTwinModal) closeArchivedTwinPrompt();
  });
  twinRestoreButton.addEventListener('click', confirmTwinRestore);
  twinAddNewButton.addEventListener('click', confirmTwinAddNew);
}

refreshProducts();
