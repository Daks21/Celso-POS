checkAuth();

const currentUser = JSON.parse(localStorage.getItem("currentUser"));

const newSaleButton = document.getElementById("new-sale-button");
const productGrid = document.getElementById("pos-product-grid");

const cartItems = document.getElementById("cart-items");
const cartSubtotal = document.getElementById("cart-subtotal");
const cartTax = document.getElementById("cart-tax");
const cartTotal = document.getElementById("cart-total");

const paymentAmountInput = document.getElementById("payment-amount");
const changeAmount = document.getElementById("change-amount");
const paymentWarning = document.getElementById("payment-warning");

const clearCartButton = document.getElementById("clear-cart-button");
const completeSaleButton = document.getElementById("complete-sale-button");
const saleMessage = document.getElementById("sale-message");

let products = [];
let cart = [];
let activeCategory = 'All';
let isSubmitting = false;

let taxEnabled   = localStorage.getItem('taxEnabled')   === 'true';
let taxDefaultOn = localStorage.getItem('taxDefaultOn') === 'true';
let taxRate      = parseFloat(localStorage.getItem('taxRate') || '0');
let cartTaxOn    = taxDefaultOn;

function refreshTaxSettings() {
  taxEnabled   = localStorage.getItem('taxEnabled')   === 'true';
  taxDefaultOn = localStorage.getItem('taxDefaultOn') === 'true';
  taxRate      = parseFloat(localStorage.getItem('taxRate') || '0');
  applyTaxRowVisibility();
}
document.addEventListener('visibilitychange', function () {
  if (document.visibilityState === 'visible') refreshTaxSettings();
});
window.addEventListener('pageshow', function (e) {
  if (e.persisted) refreshTaxSettings();
});

const cartTaxRow = document.getElementById('cart-tax-row');
const cartSubtotalRow = document.getElementById('cart-subtotal-row');
const cartTaxToggle = document.getElementById('cart-tax-toggle');

async function init() {
  showLoading('#pos-product-grid');
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
    hideLoading('#pos-product-grid');
  }
  renderCategoryPills();
  renderProductGrid();
  renderCart();
  applyTaxRowVisibility();

  if (typeof OnboardingTour !== 'undefined' && typeof OnboardingTours !== 'undefined') {
    OnboardingTour.start('order', OnboardingTours.order);
  }
}

clearCartButton.addEventListener("click", function () {
  clearCart();
});

completeSaleButton.addEventListener("click", function () {
  completeSale();
});

paymentAmountInput.addEventListener("input", function () {
  updateChangeDisplay();
});

paymentAmountInput.addEventListener("keydown", function (e) {
  if (e.key === 'Enter') { e.preventDefault(); completeSale(); }
});

var mobileCartBarBtn = document.getElementById('mobile-cart-bar-btn');
if (mobileCartBarBtn) {
  mobileCartBarBtn.addEventListener('click', function () {
    var cartSection = document.querySelector('.pos-cart');
    if (cartSection) {
      cartSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setTimeout(function () { paymentAmountInput.focus(); }, 400);
    }
  });
}

var denomChipsEl = document.getElementById('denom-chips');
if (denomChipsEl) {
  denomChipsEl.addEventListener('click', function (e) {
    var chip = e.target.closest('.denom-chip');
    if (!chip) return;
    var subtotal = getCartTotal();
    var tax = (taxEnabled && cartTaxOn) ? subtotal * taxRate : 0;
    var grandTotal = subtotal + tax;
    paymentAmountInput.value = chip.id === 'denom-exact'
      ? parseFloat(grandTotal.toFixed(2))
      : chip.dataset.amount;
    updateChangeDisplay();
  });
}

newSaleButton.addEventListener("click", function () {
  receiptModal.style.display = "none";

  cart = [];
  cartTaxOn = taxDefaultOn;
  applyTaxRowVisibility();
  paymentAmountInput.value = "";
  changeAmount.textContent = formatPeso(0);
  changeAmount.classList.remove("change-positive");
  changeAmount.classList.remove("change-negative");
  paymentWarning.textContent = "";
  saleMessage.textContent = "";

  renderCart();
  renderProductGrid();
  renderCategoryPills();
});

function attachCartEvents() {
  const decreaseButtons = document.querySelectorAll(".decrease-button");
  const increaseButtons = document.querySelectorAll(".increase-button");
  const quantityInputs = document.querySelectorAll(".quantity-input");

  decreaseButtons.forEach(function (button) {
    button.addEventListener("click", function () {
      const productId = Number(button.dataset.id);
      const cartItem = cart.find(function (item) {
        return item.productId === productId;
      });

      if (cartItem) {
        updateQuantity(productId, cartItem.quantity - 1);
      }
    });
  });

  increaseButtons.forEach(function (button) {
    button.addEventListener("click", function () {
      const productId = Number(button.dataset.id);
      const cartItem = cart.find(function (item) {
        return item.productId === productId;
      });

      if (cartItem) {
        updateQuantity(productId, cartItem.quantity + 1);
      }
    });
  });

  quantityInputs.forEach(function (input) {
    input.addEventListener("change", function () {
      const productId = Number(input.dataset.id);
      const newQuantity = Number(input.value);
      updateQuantity(productId, newQuantity);
    });
  });
}

function renderProductGrid(productList) {
  productGrid.innerHTML = "";

  const list = productList || products;

  if (list.length === 0) {
    if (products.length === 0 && typeof OnboardingCore !== 'undefined') {
      OnboardingCore.renderEmptyState(productGrid, 'order', null);
    } else {
      productGrid.innerHTML = '<p class="cart-empty-message">No products match your search.</p>';
    }
    return;
  }

  var thr = (typeof getLowStockThreshold === 'function') ? getLowStockThreshold() : 50;

  list.forEach(function (product) {
    const productCard = document.createElement("button");

    productCard.type = "button";
    productCard.className = "pos-product-card";
    productCard.dataset.productId = product.id;

    var cartItem = cart.find(function (i) { return i.productId === product.id; });
    var cartQty = cartItem ? cartItem.quantity : 0;
    var effectiveStock = product.stock - cartQty;

    var dotCls = effectiveStock <= 0 ? 'stock-dot--out'
               : effectiveStock <= thr ? 'stock-dot--low'
               : 'stock-dot--ok';
    var dotTitle = effectiveStock <= 0 ? 'Out of Stock'
                 : effectiveStock <= thr ? 'Low Stock'
                 : 'In Stock';

    if (effectiveStock <= 0) {
      productCard.classList.add("is-disabled");
      productCard.disabled = true;
    }

    productCard.innerHTML =
      '<div class="pos-card-name-row">' +
        '<h3>' + escapeHtml(product.name) + '</h3>' +
        '<span class="stock-dot ' + dotCls + '" title="' + dotTitle + '"></span>' +
      '</div>' +
      '<p class="pos-product-price">' + formatPeso(product.price) + '</p>';

    productCard.addEventListener("click", function () {
      if (!productCard.disabled && typeof addToCart === "function") {
        addToCart(product.id);
      }
    });

    productGrid.appendChild(productCard);
  });
}

function updateProductDots() {
  var thr = (typeof getLowStockThreshold === 'function') ? getLowStockThreshold() : 50;

  document.querySelectorAll('.pos-product-card[data-product-id]').forEach(function (card) {
    var productId = Number(card.dataset.productId);
    var product = products.find(function (p) { return p.id === productId; });
    if (!product) return;

    var cartItem = cart.find(function (i) { return i.productId === productId; });
    var cartQty = cartItem ? cartItem.quantity : 0;
    var effectiveStock = product.stock - cartQty;

    var dot = card.querySelector('.stock-dot');
    if (dot) {
      dot.classList.remove('stock-dot--ok', 'stock-dot--low', 'stock-dot--out');
      if (effectiveStock <= 0) {
        dot.classList.add('stock-dot--out');
        dot.title = 'Out of Stock';
      } else if (effectiveStock <= thr) {
        dot.classList.add('stock-dot--low');
        dot.title = 'Low Stock';
      } else {
        dot.classList.add('stock-dot--ok');
        dot.title = 'In Stock';
      }
    }

    if (effectiveStock <= 0) {
      card.classList.add('is-disabled');
      card.disabled = true;
    } else {
      card.classList.remove('is-disabled');
      card.disabled = false;
    }

  });
}

function addToCart(productId) {
  const product = products.find(function (p) { return p.id === productId; });

  if (!product || product.stock <= 0) return;

  const existingCartItem = cart.find(function (item) { return item.productId === productId; });

  if (existingCartItem) {
    if (existingCartItem.quantity >= product.stock) return;
    existingCartItem.quantity += 1;
  } else {
    cart.push({
      productId: product.id,
      name: product.name,
      price: product.price,
      quantity: 1
    });
  }

  renderCart();
}

function removeFromCart(productId) {
  cart = cart.filter(function (item) { return item.productId !== productId; });
  renderCart();
}

function updateQuantity(productId, newQuantity) {
  const product = products.find(function (p) { return p.id === productId; });
  if (!product) return;

  if (newQuantity <= 0) {
    removeFromCart(productId);
    return;
  }

  const cartItem = cart.find(function (item) { return item.productId === productId; });
  if (!cartItem) return;

  cartItem.quantity = newQuantity > product.stock ? product.stock : newQuantity;

  updateCartDisplay();
}

function updateCartDisplay() {
  const subtotal = getCartTotal();
  const tax = (taxEnabled && cartTaxOn) ? subtotal * taxRate : 0;
  const total = subtotal + tax;

  cartSubtotal.textContent = formatPeso(subtotal);
  cartTax.textContent = formatPeso(tax);
  cartTotal.textContent = formatPeso(total);

  updateChangeDisplay();
  updateProductDots();
  updateMobileCartBar();

  cart.forEach(function (item) {
    const cartItemElement = cartItems.querySelector(`[data-product-id="${item.productId}"]`);
    if (cartItemElement) {
      const quantityInput = cartItemElement.querySelector(".quantity-input");
      if (quantityInput) quantityInput.value = item.quantity;

      const totalDisplay = cartItemElement.querySelector(".cart-item-total strong");
      if (totalDisplay) totalDisplay.textContent = formatPeso(item.price * item.quantity);

      const product = products.find(function (p) { return p.id === item.productId; });
      const nameEl = cartItemElement.querySelector("h3");
      if (nameEl && product) {
        var existingDot = nameEl.querySelector('.stock-dot');
        if (item.quantity >= product.stock) {
          if (!existingDot) {
            var dot = document.createElement('span');
            dot.className = 'stock-dot stock-dot--out';
            dot.title = 'Out of Stock';
            nameEl.appendChild(dot);
          }
        } else {
          if (existingDot) existingDot.remove();
        }
      }
    }
  });
}

function updateCheckoutButtonState() {
  completeSaleButton.disabled = cart.length === 0;
}

function updateMobileCartBar() {
  var bar = document.getElementById('mobile-cart-bar');
  if (!bar) return;
  var hasItems = cart.length > 0;
  var subtotal = getCartTotal();
  var tax = (taxEnabled && cartTaxOn) ? subtotal * taxRate : 0;
  var total = subtotal + tax;
  var itemCount = cart.reduce(function (n, i) { return n + i.quantity; }, 0);
  document.getElementById('mobile-cart-count').textContent = itemCount === 1 ? '1 item' : itemCount + ' items';
  document.getElementById('mobile-cart-total').textContent = formatPeso(total);
  bar.classList.toggle('is-visible', hasItems);
  document.body.classList.toggle('mobile-bar-active', hasItems);
}

function renderCart() {
  cartItems.innerHTML = "";

  var hasItems = cart.length > 0;
  clearCartButton.style.display = hasItems ? "inline-flex" : "none";
  if (cartTaxToggle && taxEnabled) {
    cartTaxToggle.style.display = hasItems ? "inline-flex" : "none";
  }
  var denomChips = document.getElementById('denom-chips');
  if (denomChips) denomChips.style.display = hasItems ? 'flex' : 'none';

  if (cart.length === 0) {
    cartItems.innerHTML = `<p class="cart-empty-message">No items added yet.</p>`;
  } else {
    cart.forEach(function (item) {
      const product = products.find(function (p) { return p.id === item.productId; });
      const isMaxed = product && item.quantity >= product.stock;

      const cartItem = document.createElement("div");
      cartItem.className = "cart-item";
      cartItem.dataset.productId = item.productId;

      var maxedDot = isMaxed
        ? '<span class="stock-dot stock-dot--out" title="Out of Stock"></span>'
        : '';

      cartItem.innerHTML =
        '<div class="cart-item-info">' +
          '<h3>' + escapeHtml(item.name) + maxedDot + '</h3>' +
          '<p>' + formatPeso(item.price) + ' each</p>' +
        '</div>' +
        '<div class="cart-item-controls">' +
          '<button type="button" class="quantity-button decrease-button" data-id="' + item.productId + '">-</button>' +
          '<input type="number" class="quantity-input" value="' + item.quantity + '" min="0" data-id="' + item.productId + '" />' +
          '<button type="button" class="quantity-button increase-button" data-id="' + item.productId + '">+</button>' +
        '</div>' +
        '<div class="cart-item-total">' +
          '<strong>' + formatPeso(item.price * item.quantity) + '</strong>' +
        '</div>';

      cartItems.appendChild(cartItem);
    });
  }

  const subtotal = getCartTotal();
  const tax = (taxEnabled && cartTaxOn) ? subtotal * taxRate : 0;
  const total = subtotal + tax;

  cartSubtotal.textContent = formatPeso(subtotal);
  cartTax.textContent = formatPeso(tax);
  cartTotal.textContent = formatPeso(total);

  attachCartEvents();
  updateChangeDisplay();
  updateProductDots();
  updateCheckoutButtonState();
  updateMobileCartBar();
}

function clearCart() {
  cart = [];
  cartTaxOn = taxDefaultOn;
  applyTaxRowVisibility();
  renderCart();
}

function getCartTotal() {
  return cart.reduce(function (sum, item) {
    return sum + item.price * item.quantity;
  }, 0);
}

function updateChangeDisplay() {
  const subtotal = getCartTotal();
  const tax = (taxEnabled && cartTaxOn) ? subtotal * taxRate : 0;
  const total = subtotal + tax;
  const paymentAmount = Number(paymentAmountInput.value);

  paymentWarning.textContent = "";
  changeAmount.classList.remove("change-positive");
  changeAmount.classList.remove("change-negative");

  if (paymentAmountInput.value === "") {
    changeAmount.textContent = formatPeso(0);
    return;
  }

  const change = paymentAmount - total;
  changeAmount.textContent = formatPeso(change);

  if (change >= 0) {
    changeAmount.classList.add("change-positive");
  } else {
    changeAmount.classList.add("change-negative");
    paymentWarning.textContent = "Payment amount is less than the total.";
  }
}

async function completeSale() {
  if (isSubmitting) return;

  const subtotal = getCartTotal();
  const tax = (taxEnabled && cartTaxOn) ? subtotal * taxRate : 0;
  const total = subtotal + tax;
  const paymentAmount = Number(paymentAmountInput.value);

  paymentWarning.textContent = "";
  saleMessage.textContent = "";

  if (cart.length === 0) {
    paymentWarning.textContent = "Cart is empty. Add products before completing a sale.";
    return;
  }

  if (paymentAmountInput.value === "") {
    paymentWarning.textContent = "Please enter the payment amount.";
    return;
  }

  if (paymentAmount < total) {
    paymentWarning.textContent = "Payment amount is less than the grand total.";
    return;
  }

  const change = paymentAmount - total;

  const saleRecord = {
    items: cart.map(function (item) {
      return {
        productId: item.productId,
        name: item.name,
        price: item.price,
        quantity: item.quantity,
        lineTotal: item.price * item.quantity
      };
    }),
    subtotal: subtotal,
    tax: tax,
    taxRate: tax > 0 ? taxRate : 0,
    cartTaxOn: cartTaxOn,
    total: total,
    payment: paymentAmount,
    change: change,
    cashier: currentUser ? currentUser.fullName : "Unknown Cashier"
  };

  isSubmitting = true;
  completeSaleButton.disabled = true;
  try {
    const result = await createSale(saleRecord);

    if (result && result.success) {
      cart = [];
      paymentAmountInput.value = "";
      changeAmount.textContent = formatPeso(0);
      changeAmount.classList.remove("change-positive");
      changeAmount.classList.remove("change-negative");
      paymentWarning.textContent = "";

      try {
        const refreshed = await getProducts();
        if (refreshed && refreshed.success) products = refreshed.data || [];
      } catch (e) {
        // non-fatal: grid will still show with stale stock until next reload
      }

      renderCart();
      renderCategoryPills();
      applyFilters();

      if (typeof OnboardingChecklist !== 'undefined') {
        OnboardingChecklist.complete('makeSale');
      }

      showReceipt(result.data);
    } else {
      saleMessage.textContent = result ? result.message : "Sale failed. Please try again.";
    }
  } catch (err) {
    showApiError('Network error. Is the server running?');
  } finally {
    isSubmitting = false;
    updateCheckoutButtonState();
  }
}

function showReceipt(sale) {
  var nameEl = document.getElementById('receipt-store-name');
  var addrEl = document.getElementById('receipt-store-address');
  if (nameEl) nameEl.textContent = localStorage.getItem('storeName')    || 'Celso POS Store';
  if (addrEl) addrEl.textContent = localStorage.getItem('storeAddress') || '123 Sample Street, Quezon City';

  receiptNumber.textContent = sale.receiptNo || ('RCPT-' + String(sale.id).padStart(6, '0'));
  receiptDate.textContent = formatDateTz(sale.timestamp);
  receiptTime.textContent = formatTimeTz(sale.timestamp);
  receiptCashier.textContent = sale.cashier;

  receiptItemsBody.innerHTML = "";

  sale.items.forEach(function (item) {
    const row = document.createElement("tr");
    const tdName  = document.createElement("td"); tdName.textContent  = item.name;
    const tdQty   = document.createElement("td"); tdQty.textContent   = item.quantity;
    const tdPrice = document.createElement("td"); tdPrice.textContent = formatPeso(item.price);
    const tdTotal = document.createElement("td"); tdTotal.textContent = formatPeso(item.lineTotal);
    row.appendChild(tdName);
    row.appendChild(tdQty);
    row.appendChild(tdPrice);
    row.appendChild(tdTotal);
    receiptItemsBody.appendChild(row);
  });

  receiptSubtotal.textContent = formatPeso(sale.subtotal);

  const receiptTaxRow    = document.getElementById('receipt-tax-row');
  const receiptTaxAmount = document.getElementById('receipt-tax-amount');
  if (receiptTaxRow && receiptTaxAmount) {
    if (sale.tax > 0) {
      receiptTaxAmount.textContent = formatPeso(sale.tax);
      receiptTaxRow.style.display  = '';
    } else {
      receiptTaxRow.style.display = 'none';
    }
  }

  receiptGrandTotal.textContent = formatPeso(sale.total);
  receiptPayment.textContent = formatPeso(sale.payment);
  receiptChange.textContent = formatPeso(sale.change);

  receiptModal.style.display = "flex";
}

function renderCategoryPills() {
  const pillsContainer = document.getElementById('pos-category-pills');
  const selectEl = document.getElementById('pos-category-select');
  if (!pillsContainer) return;

  const categories = ['All', ...new Set(
    products.map(function (p) { return p.category; }).filter(Boolean)
  )];

  pillsContainer.innerHTML = '';
  categories.forEach(function (category) {
    const pill = document.createElement('button');
    pill.type = 'button';
    pill.className = 'category-pill';
    pill.textContent = category;

    if (category === activeCategory) pill.classList.add('is-active');

    pill.addEventListener('click', function () {
      activeCategory = category;
      renderCategoryPills();
      applyFilters();
    });

    pillsContainer.appendChild(pill);
  });

  if (selectEl) {
    selectEl.innerHTML = '';
    categories.forEach(function (category) {
      const option = document.createElement('option');
      option.value = category;
      option.textContent = category;
      if (category === activeCategory) option.selected = true;
      selectEl.appendChild(option);
    });
  }
}

function getFilteredProducts() {
  const searchTerm = document.getElementById('pos-product-search')
    .value.trim().toLowerCase();

  let filtered = products.slice();

  if (activeCategory !== 'All') {
    filtered = filtered.filter(function (p) { return p.category === activeCategory; });
  }

  if (searchTerm !== '') {
    filtered = filtered.filter(function (p) { return p.name.toLowerCase().includes(searchTerm); });
  }

  return filtered;
}

function applyFilters() {
  renderProductGrid(getFilteredProducts());
}

var posSearchInput = document.getElementById('pos-product-search');
posSearchInput.addEventListener('keyup', function (e) {
  // Enter is handled on keydown (add-to-cart); keyup only live-filters.
  if (e.key === 'Enter') return;
  applyFilters();
});

// Enter in the search box adds the first in-stock match to the cart, then
// clears the box — lets a cashier rapid-fire search-and-add (and is the
// hook a USB barcode scanner uses: it types the code and sends Enter).
posSearchInput.addEventListener('keydown', function (e) {
  if (e.key !== 'Enter') return;
  e.preventDefault();
  if (posSearchInput.value.trim() === '') return;

  var addable = getFilteredProducts().find(function (p) {
    var ci = cart.find(function (i) { return i.productId === p.id; });
    var qty = ci ? ci.quantity : 0;
    return (p.stock - qty) > 0;
  });

  if (addable) {
    addToCart(addable.id);
    posSearchInput.value = '';
    applyFilters();
  }
});

var posCategorySelect = document.getElementById('pos-category-select');
if (posCategorySelect) {
  posCategorySelect.addEventListener('change', function () {
    activeCategory = posCategorySelect.value;
    renderCategoryPills();
    applyFilters();
  });
}

function applyTaxRowVisibility() {
  const show = taxEnabled && cartTaxOn;
  if (cartTaxRow) cartTaxRow.style.display = show ? '' : 'none';
  if (cartSubtotalRow) cartSubtotalRow.style.display = show ? '' : 'none';
  if (cartTaxToggle) cartTaxToggle.classList.toggle('is-active', cartTaxOn);
  updateCartDisplay();
}

if (cartTaxToggle && taxEnabled) {
  cartTaxToggle.addEventListener('click', function () {
    cartTaxOn = !cartTaxOn;
    applyTaxRowVisibility();
  });
}

init();
