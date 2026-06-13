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
  if (response.status === 403) {
    // Forced password-change gate (Phase 6.7): a user under a pending reset can only
    // reach the change-password screen — bounce them there. EVERY other 403 (e.g. an
    // admin-only route, or a RESET_EXPIRED login) just returns its body to the caller,
    // exactly as before (we read the body once and hand it back).
    let body = null;
    try { body = await response.json(); } catch (_) {}
    if (body && body.code === 'PASSWORD_CHANGE_REQUIRED') {
      window.location.href = getChangePasswordPath();
      return;
    }
    return body || { success: false };
  }
  if (response.status === 204) return { success: true };
  return response.json();
}

function getLoginPath() {
  const depth = window.location.pathname.split('/').length - 1;
  const prefix = depth >= 3 ? '../../' : depth === 2 ? '../' : '';
  return prefix + 'index.html';
}

// Path to the forced password-change screen (pages/auth/change-password.html),
// resolved relative to wherever we currently are (mirrors getLoginPath's depth math).
function getChangePasswordPath() {
  const depth = window.location.pathname.split('/').length - 1;
  if (depth >= 3) return 'change-password.html';        // already in pages/auth/
  if (depth === 2) return 'auth/change-password.html';  // in pages/
  return 'pages/auth/change-password.html';             // at site root
}

// --- Auth ---

async function login(email, password) {
  return apiCall('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

async function register(fullName, email, password, mobile, securityAnswer) {
  // mobile + securityAnswer (place of birth) added in Phase 6.7 for manual recovery.
  // Older callers passing 3 args still work — JSON.stringify drops the undefined keys.
  return apiCall('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ fullName, email, password, mobile, securityAnswer }),
  });
}

// Phase 6.7 — public password-recovery request. Always resolves to a generic
// success message regardless of whether the account exists (anti-enumeration).
async function forgotPassword(payload) {
  return apiCall('/auth/forgot-password', {
    method: 'POST',
    body: JSON.stringify(payload),
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
      state:        result.state || null,         // active|grace|free (6.6 cards)
      paidUntil:    result.paidUntil || null,
      graceEndsAt:  result.graceEndsAt || null,
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

// Re-pull entitlements from the server and re-cache them. The plan resolves live
// from the store row on every /me request, so this picks up an operator-approved
// upgrade (or a downgrade / trial expiry / seat change) WITHOUT a re-login — the
// login-time cache alone goes stale the moment the plan changes server-side.
// Returns true if the cached snapshot actually changed. UI-only; server enforces.
async function refreshEntitlements() {
  if (!localStorage.getItem('token')) return false;
  var before = localStorage.getItem('entitlements') || '';
  var res;
  try { res = await getMe(); } catch (e) { return false; }
  if (!res || !res.success || !res.plan) return false;   // leave the cache as-is on any miss
  cacheEntitlements(res);                                 // /me returns the same top-level shape as login
  return (localStorage.getItem('entitlements') || '') !== before;
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

// Persist the store name + address to the store row (admin only). Shared by all
// users of the store — so cashier receipts carry the same identity as the owner.
async function updateStoreInfo(storeName, storeAddress) {
  return apiCall('/settings/store-info', {
    method: 'PUT',
    body: JSON.stringify({ storeName, storeAddress }),
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
async function resetCashierPassword(id, password) {
  return apiCall(`/team/${id}/password`, { method: 'PUT', body: JSON.stringify({ password }) });
}
// Admin-only daily-sales audit. `date` is a store-local YYYY-MM-DD; omit for today.
async function getDailySales(date) {
  return apiCall('/team/daily-sales' + (date ? ('?date=' + encodeURIComponent(date)) : ''));
}
async function getPersonReceipts(userId, date) {
  return apiCall('/team/daily-sales/' + userId + (date ? ('?date=' + encodeURIComponent(date)) : ''));
}

// --- Billing (Phase 6.6 — manual GCash bridge) ---
async function getBillingState() { return apiCall('/billing/state'); }
// Submit a paid GCash payment for review (verify-first). plan: plus|pro.
async function submitClaim(plan, gcashRef) {
  return apiCall('/billing/claim', { method: 'POST', body: JSON.stringify({ plan, gcashRef }) });
}
// Fix a typo'd reference (or switch plan) on the still-pending claim, in place.
async function editClaim(plan, gcashRef) {
  return apiCall('/billing/claim', { method: 'PATCH', body: JSON.stringify({ plan, gcashRef }) });
}
// Withdraw the pending claim (owner changed their mind / wrong plan).
async function cancelClaim() {
  return apiCall('/billing/claim', { method: 'DELETE' });
}

// --- Operator / super-admin (Phase 6.6; /api/admin — 404s for non-super-admins) ---
async function getAdminStats(period) {
  return apiCall('/admin/stats' + (period ? ('?period=' + encodeURIComponent(period)) : ''));
}
async function getAdminClaims(status) {
  return apiCall('/admin/claims' + (status ? ('?status=' + encodeURIComponent(status)) : ''));
}
async function approveAdminClaim(id) {
  return apiCall('/admin/claims/' + id + '/approve', { method: 'POST' });
}
async function rejectAdminClaim(id, note) {
  return apiCall('/admin/claims/' + id + '/reject', { method: 'POST', body: JSON.stringify({ note: note || '' }) });
}
async function revertAdminClaim(id) {
  return apiCall('/admin/claims/' + id + '/revert', { method: 'POST' });
}
async function getAdminQr() { return apiCall('/admin/qr'); }
async function saveAdminQr(payload) {
  return apiCall('/admin/qr', { method: 'POST', body: JSON.stringify(payload) });
}

// --- Admin: password recovery review + support tickets (Phase 6.7) ---
async function getResetRequests(status) {
  return apiCall('/admin/reset-requests' + (status ? ('?status=' + encodeURIComponent(status)) : ''));
}
async function getResetHistory(id) {
  return apiCall('/admin/reset-requests/' + id + '/history');
}
async function approveResetRequest(id, operatorPassword) {
  return apiCall('/admin/reset-requests/' + id + '/approve', { method: 'POST', body: JSON.stringify({ operatorPassword: operatorPassword }) });
}
async function regenerateResetRequest(id, operatorPassword) {
  return apiCall('/admin/reset-requests/' + id + '/regenerate', { method: 'POST', body: JSON.stringify({ operatorPassword: operatorPassword }) });
}
async function rejectResetRequest(id, note) {
  return apiCall('/admin/reset-requests/' + id + '/reject', { method: 'POST', body: JSON.stringify({ note: note || '' }) });
}
async function getAdminTickets(status) {
  return apiCall('/admin/tickets' + (status ? ('?status=' + encodeURIComponent(status)) : ''));
}
async function closeAdminTicket(id) {
  return apiCall('/admin/tickets/' + id + '/close', { method: 'POST' });
}
async function getAdminNotifications() {
  return apiCall('/admin/notifications');
}

// --- Password (owner self-service change; admin-gated server-side) ---
async function changePassword(data) {
  return apiCall('/auth/password', { method: 'PUT', body: JSON.stringify(data) });
}

// --- Recovery details (owner mobile + place-of-birth answer; admin-gated) ---
async function updateRecovery(data) {
  return apiCall('/auth/recovery', { method: 'PUT', body: JSON.stringify(data) });
}

// --- Support ticket submit (any tenant user) ---
async function submitTicket(data) {
  return apiCall('/support/tickets', { method: 'POST', body: JSON.stringify(data) });
}
