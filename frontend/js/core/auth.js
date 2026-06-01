const loginForm = document.getElementById("login-form");
const registerForm = document.getElementById("register-form");

const fullNameInput = document.getElementById("fullName");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const confirmPasswordInput = document.getElementById("confirmPassword");

const fullNameError = document.getElementById("fullName-error");
const emailError = document.getElementById("email-error");
const passwordError = document.getElementById("password-error");
const loginError = document.getElementById("login-error");
const confirmPasswordError = document.getElementById("confirmPassword-error");

if (loginForm) {
  loginForm.addEventListener("submit", async function (event) {
    event.preventDefault();

    const email = emailInput.value.trim();
    const password = passwordInput.value.trim();

    clearLoginErrors();

    let hasError = false;

    if (email === "") {
      showFieldError(emailInput, emailError, "Email address is required");
      hasError = true;
    }

    if (password === "") {
      showFieldError(passwordInput, passwordError, "Password is required");
      hasError = true;
    }

    if (hasError) return;

    const result = await login(email, password);

    if (result && result.success) {
      localStorage.setItem('token', result.token);
      localStorage.setItem('currentUser', JSON.stringify(result.user));
      if (result.timezone) localStorage.setItem('storeTimezone', result.timezone);
      // Store identity now comes from the store row (shared by owner + cashiers),
      // not per-user preferences — so every operator's receipts/sidebar match.
      localStorage.setItem('storeName',    result.storeName    || '');
      localStorage.setItem('storeAddress', result.storeAddress || '');
      // Cache the plan/feature entitlements for UI gating (server still enforces).
      if (typeof cacheEntitlements === 'function') cacheEntitlements(result);

      // Pull saved preferences from DB and cache them in localStorage
      // so every app page reads from cache without an extra API call.
      try {
        const prefsResult = await getPreferences();
        if (prefsResult && prefsResult.success) {
          _cachePreferences(prefsResult.data || {}, result.user.id);
        }
      } catch (e) { /* non-fatal — localStorage defaults will be used */ }

      // Cashiers have no dashboard — send them straight to the POS.
      window.location.href = result.role === 'cashier' ? "pages/order.html" : "pages/dashboard.html";
    } else {
      loginError.textContent = result ? result.message : "Login failed. Please try again.";
    }
  });
}

if (registerForm) {
  registerForm.addEventListener("submit", async function (event) {
    event.preventDefault();

    const fullName = fullNameInput.value.trim();
    const email = emailInput.value.trim();
    const password = passwordInput.value.trim();
    const confirmPassword = confirmPasswordInput.value.trim();

    clearRegisterErrors();

    let hasError = false;

    if (fullName === "") {
      showFieldError(fullNameInput, fullNameError, "Full name is required");
      hasError = true;
    }

    if (email === "") {
      showFieldError(emailInput, emailError, "Email address is required");
      hasError = true;
    }

    if (password === "") {
      showFieldError(passwordInput, passwordError, "Password is required");
      hasError = true;
    }

    if (confirmPassword === "") {
      showFieldError(confirmPasswordInput, confirmPasswordError, "Password confirmation is required");
      hasError = true;
    }

    if (hasError) return;

    if (!isValidEmail(email)) {
      showFieldError(emailInput, emailError, "Enter a valid email address");
      return;
    }

    if (password.length < 8) {
      showFieldError(passwordInput, passwordError, "Password must be at least 8 characters");
      return;
    }

    if (confirmPassword !== password) {
      showFieldError(confirmPasswordInput, confirmPasswordError, "Passwords do not match");
      return;
    }

    const result = await register(fullName, email, password);

    if (result && result.success) {
      window.location.href = "../../index.html";
    } else {
      showFieldError(emailInput, emailError, result ? result.message : "Registration failed. Please try again.");
    }
  });
}

function isValidEmail(email) {
  return email.includes("@") && email.includes(".");
}

function showFieldError(inputElement, errorElement, message) {
  inputElement.parentElement.classList.add("has-error");
  errorElement.textContent = message;
}

function clearLoginErrors() {
  emailInput.parentElement.classList.remove("has-error");
  passwordInput.parentElement.classList.remove("has-error");

  emailError.textContent = "";
  passwordError.textContent = "";

  if (loginError) {
    loginError.textContent = "";
  }
}

function clearRegisterErrors() {
  fullNameInput.parentElement.classList.remove("has-error");
  emailInput.parentElement.classList.remove("has-error");
  passwordInput.parentElement.classList.remove("has-error");
  confirmPasswordInput.parentElement.classList.remove("has-error");

  fullNameError.textContent = "";
  emailError.textContent = "";
  passwordError.textContent = "";
  confirmPasswordError.textContent = "";
}

function checkAuth() {
  const token = localStorage.getItem("token");
  if (token === null) {
    window.location.href = "../index.html";
  }
}

// ── Page-level entitlement guard ──
// Backstops a deep link (typed URL / stale bookmark) to a page the current plan
// or role can't access — the nav already hides the link, but the URL is still
// reachable. UI-only: the API enforces too. FAILS OPEN when entitlements are
// unknown (session predating this feature / cache miss).
//
// Two rules:
//   • Cashier — may only be on New Order + Sales History (+ logout). Any other
//     app page redirects to order.html.
//   • Owner/admin — plan-feature gate: a page whose feature isn't in the plan
//     redirects to the dashboard with an upgrade toast.
var APP_PAGES = [
  'dashboard.html', 'order.html', 'inventory.html', 'products.html',
  'finance.html', 'analytics.html', 'history.html', 'ai.html',
  'account.html', 'team.html', 'billing.html',
];
var CASHIER_ALLOWED = ['order.html', 'history.html'];
var PAGE_FEATURE = {
  'dashboard.html': 'dashboard_basic',
  'order.html':     'order',
  'inventory.html': 'inventory',
  'products.html':  'products',
  'finance.html':   'finance',
  'analytics.html': 'analytics',
  'history.html':   'history',
  'ai.html':        'ai',
};

function guardCurrentPage() {
  var page = window.location.pathname.split('/').pop();
  if (APP_PAGES.indexOf(page) === -1) return; // not a gated app page (login/register)
  var e = (typeof getEntitlements === 'function') ? getEntitlements() : null;
  if (!e || !Array.isArray(e.features)) return; // unknown → allow (server enforces)

  // Cashier role-lock: only New Order + History.
  if (e.role === 'cashier') {
    if (CASHIER_ALLOWED.indexOf(page) === -1 && page !== 'order.html') {
      window.location.replace('order.html');
    }
    return;
  }

  // Owner/admin plan-gate.
  var feature = PAGE_FEATURE[page];
  if (feature && e.features.indexOf(feature) === -1 && page !== 'dashboard.html') {
    try { sessionStorage.setItem('os_upgrade_redirect', '1'); } catch (_) {}
    window.location.replace('dashboard.html');
  }
}

// On the page we land on after a guard redirect, tell the user why.
function showUpgradeToastIfRedirected() {
  try {
    if (sessionStorage.getItem('os_upgrade_redirect') === '1') {
      sessionStorage.removeItem('os_upgrade_redirect');
      if (typeof showApiError === 'function') {
        showApiError("That page isn't available on your current plan.");
      }
    }
  } catch (_) {}
}

document.addEventListener('DOMContentLoaded', function () {
  guardCurrentPage();
  showUpgradeToastIfRedirected();
});

// Writes DB preferences into individual localStorage keys (no external deps).
// Called once on login before redirecting so every page reads from cache.
function _cachePreferences(prefs, userId) {
  var DEFAULTS = {
    theme: 'light', taxEnabled: false, taxRate: '0.03', taxDefaultOn: false,
    lowStockThreshold: 50, stockColors: { ok: '#5a9e6f', low: '#eab308', out: '#dc2626' },
    dashboardRecentCount: 5, dashboardWidgets: [],
    navLabel: 'app', logoTarget: 'order.html', showThemeToggle: false,
    financeDebtBalanceVisible: true, osEnabled: false,
    numpadOnDesktop: false,
  };
  var p = Object.assign({}, DEFAULTS, prefs);

  localStorage.setItem('theme',                p.theme);
  localStorage.setItem('taxEnabled',           String(p.taxEnabled));
  localStorage.setItem('taxRate',              String(p.taxRate));
  localStorage.setItem('taxDefaultOn',         String(p.taxDefaultOn));
  localStorage.setItem('lowStockThreshold',    String(p.lowStockThreshold));
  localStorage.setItem('stockColors',          JSON.stringify(p.stockColors));
  localStorage.setItem('dashboardRecentCount',  String(p.dashboardRecentCount));
  localStorage.setItem('dashboardItemsPopover',     String(p.dashboardItemsPopover !== false));
  localStorage.setItem('dashboardWidgets',           JSON.stringify(p.dashboardWidgets));
  localStorage.setItem('financeDebtBalanceVisible',  String(p.financeDebtBalanceVisible !== false));

  var navKey = 'celso_navprefs_' + String(userId);
  localStorage.setItem(navKey, JSON.stringify({
    navLabel:        p.navLabel,
    logoTarget:      p.logoTarget,
    showThemeToggle: p.showThemeToggle,
  }));

  // storeName/storeAddress are no longer sourced from per-user preferences —
  // they live on the store row and are cached from the login / getMe response.
  localStorage.setItem('numpadOnDesktop', String(p.numpadOnDesktop === true));

  // Restore user-specific prefs blob (Os toggle, advanced analytics, etc.)
  var userPrefsKey = 'prefs_' + String(userId);
  var userPrefs = {};
  try { userPrefs = JSON.parse(localStorage.getItem(userPrefsKey) || '{}'); } catch (e) {}
  userPrefs.osEnabled         = p.osEnabled === true;
  userPrefs.advancedAnalytics = p.advancedAnalytics === true;
  if (p.monthlyRevenueGoal != null && p.monthlyRevenueGoal !== '') {
    userPrefs.monthlyRevenueGoal = p.monthlyRevenueGoal;
  } else {
    delete userPrefs.monthlyRevenueGoal;
  }
  localStorage.setItem(userPrefsKey, JSON.stringify(userPrefs));
}
