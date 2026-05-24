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

const taxEnabled = localStorage.getItem('taxEnabled') === 'true';
const taxDefaultOn = localStorage.getItem('taxDefaultOn') === 'true';
const taxRate = parseFloat(localStorage.getItem('taxRate') || '0.03');
let cartTaxOn = taxDefaultOn;

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
    productGrid.innerHTML = `<p class="cart-empty-message">No products available.</p>`;
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
        '<h3>' + product.name + '</h3>' +
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
    const confirmed = confirm("Remove this item from the cart?");
    if (confirmed) {
      removeFromCart(productId);
    } else {
      const quantityInput = document.querySelector(`.quantity-input[data-id="${productId}"]`);
      if (quantityInput) quantityInput.value = 1;
      const cartItem = cart.find(function (item) { return item.productId === productId; });
      if (cartItem) cartItem.quantity = 1;
      updateCartDisplay();
    }
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

function renderCart() {
  cartItems.innerHTML = "";

  clearCartButton.style.display = cart.length > 0 ? "inline-flex" : "none";
  if (cartTaxToggle && taxEnabled) {
    cartTaxToggle.style.display = cart.length > 0 ? "inline-flex" : "none";
  }

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
          '<h3>' + item.name + maxedDot + '</h3>' +
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

      showReceipt(result.data);
    } else {
      saleMessage.textContent = result ? result.message : "Sale failed. Please try again.";
    }
  } catch (err) {
    showApiError('Network error. Is the server running?');
  } finally {
    completeSaleButton.disabled = false;
  }
}

function showReceipt(sale) {
  const saleDate = new Date(sale.timestamp);

  receiptNumber.textContent = sale.receiptNo || ('RCPT-' + String(sale.id).padStart(6, '0'));
  receiptDate.textContent = saleDate.toLocaleDateString("en-PH");
  receiptTime.textContent = saleDate.toLocaleTimeString("en-PH");
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

function applyFilters() {
  const searchTerm = document.getElementById('pos-product-search')
    .value.trim().toLowerCase();

  let filtered = products.slice();

  if (activeCategory !== 'All') {
    filtered = filtered.filter(function (p) { return p.category === activeCategory; });
  }

  if (searchTerm !== '') {
    filtered = filtered.filter(function (p) { return p.name.toLowerCase().includes(searchTerm); });
  }

  renderProductGrid(filtered);
}

document.getElementById('pos-product-search').addEventListener('keyup', applyFilters);

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
}

if (cartTaxToggle && taxEnabled) {
  cartTaxToggle.addEventListener('click', function () {
    cartTaxOn = !cartTaxOn;
    applyTaxRowVisibility();
  });
}

init();
