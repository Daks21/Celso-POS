const BASE_URL = (function () {
  var h = window.location.hostname;
  if (h === 'localhost' || h === '127.0.0.1') return 'http://localhost:3000/api';
  return window.location.origin + '/api';
})();

async function apiCall(endpoint, options = {}) {
  const token = localStorage.getItem('token');
  const defaultHeaders = {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
  };
  const response = await fetch(BASE_URL + endpoint, {
    ...options,
    headers: { ...defaultHeaders, ...(options.headers || {}) },
  });
  if (response.status === 401) {
    clearSession();
    window.location.href = getLoginPath();
    return;
  }
  if (response.status === 204) return { success: true };
  return response.json();
}

function getLoginPath() {
  const depth = window.location.pathname.split('/').length - 1;
  const prefix = depth >= 3 ? '../../' : depth === 2 ? '../' : '';
  return prefix + 'index.html';
}

// --- Auth ---

async function login(email, password) {
  return apiCall('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

async function register(fullName, email, password) {
  return apiCall('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ fullName, email, password }),
  });
}

async function getMe() {
  return apiCall('/auth/me');
}

// --- Entitlements (client-side cache; UI rendering only — the server enforces) ---
// Cached from the login / getMe response. Cleared on logout by clearSession()'s
// localStorage.clear(). Read by the nav gating, page guards, FAB, and account
// toggles. When absent/unknown, callers FAIL OPEN (show everything) so a session
// that predates this feature — or a transient cache miss — is never locked out.

function cacheEntitlements(result) {
  if (!result || !result.plan) return;
  try {
    localStorage.setItem('entitlements', JSON.stringify({
      plan:         result.plan,
      features:     Array.isArray(result.features) ? result.features : [],
      role:         result.role,
      cashierSeats: result.cashierSeats,
      trialEndsAt:  result.trialEndsAt || null,
    }));
  } catch (e) { /* storage full / disabled — gating just stays open */ }
}

function getEntitlements() {
  try {
    var raw = localStorage.getItem('entitlements');
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}

// True if the cached plan grants `feature`. Unknown (no cache) → true (fail open).
function hasEntitlement(feature) {
  var e = getEntitlements();
  if (!e || !Array.isArray(e.features)) return true;
  return e.features.indexOf(feature) !== -1;
}

// Wipes client-side state on sign-out / session-end. Sari-sari store devices
// are commonly shared, so a partial clear (token + currentUser only) would let
// the next user read the previous user's preferences and — critically — their
// AI chat history (sessionStorage 'osHistory'). We clear everything so no
// account data survives; cached prefs are re-synced from the DB on next login.
// Two kinds of non-sensitive state are intentionally preserved: onboarding
// flags ('onboarding_*', the "have you seen the tour" booleans) and the 'theme'
// choice. Wiping onboarding would replay the welcome modal + tours on every
// login; wiping theme would flip the login/register pages back to light after
// sign-out. Neither reveals any business data, so keeping them is safe on a
// shared device. ('theme' is re-synced to the next user's preference on login.)
function clearSession() {
  try {
    var preserved = {};
    for (var i = 0; i < localStorage.length; i++) {
      var key = localStorage.key(i);
      if (key && (key === 'theme' || key.indexOf('onboarding_') === 0)) {
        preserved[key] = localStorage.getItem(key);
      }
    }
    localStorage.clear();
    Object.keys(preserved).forEach(function (k) { localStorage.setItem(k, preserved[k]); });
  } catch (_) {}
  try { sessionStorage.clear(); } catch (_) {}
}

function logout() {
  clearSession();
  window.location.href = getLoginPath();
}

// --- Products ---

async function getProducts(params = {}) {
  const query = new URLSearchParams(params).toString();
  return apiCall('/products' + (query ? '?' + query : ''));
}

async function getProduct(id) {
  return apiCall(`/products/${id}`);
}

async function createProduct(data) {
  return apiCall('/products', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

async function updateProduct(id, data) {
  return apiCall(`/products/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

async function deleteProduct(id) {
  return apiCall(`/products/${id}`, { method: 'DELETE' });
}

async function getArchivedProducts(params = {}) {
  const query = new URLSearchParams(params).toString();
  return apiCall('/products/archived' + (query ? '?' + query : ''));
}

// Un-archive a product. Pass `data` (the re-add form fields) to also refresh its
// pricing/details; omit it for a bare restore from the Archived list.
async function restoreProduct(id, data) {
  return apiCall(`/products/${id}/restore`, {
    method: 'POST',
    ...(data ? { body: JSON.stringify(data) } : {}),
  });
}

// --- Sales ---

async function createSale(saleData) {
  return apiCall('/sales', {
    method: 'POST',
    body: JSON.stringify(saleData),
  });
}

async function getSales(filters = {}) {
  const query = new URLSearchParams(filters).toString();
  return apiCall('/sales' + (query ? '?' + query : ''));
}

async function getSale(id) {
  return apiCall(`/sales/${id}`);
}

async function updateSale(id, data) {
  return apiCall(`/sales/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

async function getSalesSummary() {
  return apiCall('/sales/summary');
}

// --- Inventory ---

async function getInventory() {
  return apiCall('/inventory');
}

async function getLowStock(threshold) {
  const query = threshold != null ? `?threshold=${threshold}` : '';
  return apiCall('/inventory/low-stock' + query);
}

async function getInventorySummary(threshold) {
  const query = threshold != null ? '?threshold=' + threshold : '';
  return apiCall('/inventory/summary' + query);
}

async function adjustStock(productId, data) {
  return apiCall(`/inventory/${productId}/adjust`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

// --- Preferences ---

async function getPreferences() {
  return apiCall('/auth/preferences');
}

async function savePreferences(prefs) {
  return apiCall('/auth/preferences', {
    method: 'PUT',
    body: JSON.stringify(prefs),
  });
}

// --- Analytics ---

async function getAnalyticsSummary(date, threshold) {
  const params = new URLSearchParams();
  if (date      != null) params.set('date',      date);
  if (threshold != null) params.set('threshold', threshold);
  const query = params.toString();
  return apiCall('/analytics/summary' + (query ? '?' + query : ''));
}

async function getHeatmap() {
  return apiCall('/analytics/heatmap');
}

async function getKPIs(from, to) {
  const params = new URLSearchParams();
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  const query = params.toString();
  return apiCall('/analytics/kpis' + (query ? '?' + query : ''));
}

async function getCharts(from, to) {
  const params = new URLSearchParams();
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  const query = params.toString();
  return apiCall('/analytics/charts' + (query ? '?' + query : ''));
}

async function getProfit(from, to) {
  const params = new URLSearchParams();
  if (from) params.set('from', from);
  if (to)   params.set('to',   to);
  const query = params.toString();
  return apiCall('/analytics/profit' + (query ? '?' + query : ''));
}

async function getInventoryHealth() {
  return apiCall('/analytics/inventory-health');
}

async function getGoalProjection() {
  return apiCall('/analytics/projection');
}

// --- Finance ---

async function getFinanceMovements(filters = {}) {
  const query = new URLSearchParams(filters).toString();
  return apiCall('/finance' + (query ? '?' + query : ''));
}

async function getFinanceSummary(filters = {}) {
  const query = new URLSearchParams(filters).toString();
  return apiCall('/finance/summary' + (query ? '?' + query : ''));
}

async function getFinanceProfit(filters = {}) {
  const query = new URLSearchParams(filters).toString();
  return apiCall('/finance/profit' + (query ? '?' + query : ''));
}

async function createFinanceEntry(data) {
  return apiCall('/finance', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

async function updateFinanceEntry(id, data) {
  return apiCall(`/finance/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

async function deleteFinanceEntry(id) {
  return apiCall(`/finance/${id}`, { method: 'DELETE' });
}

// --- Settings (store-wide) ---

async function getSettings() {
  return apiCall('/settings');
}

async function updateStoreTimezone(timezone) {
  return apiCall('/settings/timezone', {
    method: 'PUT',
    body: JSON.stringify({ timezone }),
  });
}

// --- Os AI (non-streaming endpoints) ---
async function getOsForecast()      { return apiCall('/ai/forecast'); }
async function getOsProfitCoach()   { return apiCall('/ai/profit');   }

// --- Team (cashier sub-accounts) ---
async function getTeam() { return apiCall('/team'); }
async function createCashier(data) {
  return apiCall('/team', { method: 'POST', body: JSON.stringify(data) });
}
async function setCashierActive(id, active) {
  return apiCall(`/team/${id}/active`, { method: 'PATCH', body: JSON.stringify({ active }) });
}
async function deleteCashier(id) {
  return apiCall(`/team/${id}`, { method: 'DELETE' });
}

// --- Billing ---
async function getBillingState() { return apiCall('/billing/state'); }
async function startCheckout(plan) {
  return apiCall('/billing/checkout', { method: 'POST', body: JSON.stringify({ plan }) });
}
async function openBillingPortal() {
  return apiCall('/billing/portal', { method: 'POST' });
}

// --- Password (forced first-login change for cashiers) ---
async function changePassword(data) {
  return apiCall('/auth/password', { method: 'PUT', body: JSON.stringify(data) });
}
