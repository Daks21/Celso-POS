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
    localStorage.removeItem('token');
    localStorage.removeItem('currentUser');
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

function logout() {
  localStorage.removeItem('token');
  localStorage.removeItem('currentUser');
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
