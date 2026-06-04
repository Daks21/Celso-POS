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

      // Route by role: cashiers -> POS, platform super-admin -> operator console,
      // owners -> dashboard.
      window.location.href = result.role === 'cashier'    ? "pages/order.html"
                           : result.role === 'superadmin' ? "pages/admin.html"
                           : "pages/dashboard.html";
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

    var pwCheck = (typeof PasswordPolicy !== 'undefined')
      ? PasswordPolicy.validate(password)
      : { ok: password.length >= 12, message: 'Password must be at least 12 characters' };
    if (!pwCheck.ok) {
      showFieldError(passwordInput, passwordError, pwCheck.message);
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

  // Live strength meter — register page only (the element is absent on login).
  if (typeof PasswordPolicy !== 'undefined') {
    PasswordPolicy.attachMeter(passwordInput, document.getElementById('pw-meter'));
  }
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
  var e = (typeof getEntitlements === 'function') ? getEntitlements() : null;

  // Operator console: only the platform super-admin may view it; a tenant user
  // is bounced out (the API 404s anyway). Unknown role -> allow, API enforces.
  if (page === 'admin.html') {
    if (e && e.role && e.role !== 'superadmin') window.location.replace('dashboard.html');
    return;
  }
  // A super-admin who lands on a tenant app page is sent to the console (both
  // live in pages/, so the relative replace resolves correctly). Login/register
  // and other non-app pages are left alone.
  if (e && e.role === 'superadmin' && APP_PAGES.indexOf(page) !== -1) {
    window.location.replace('admin.html');
    return;
  }

  if (APP_PAGES.indexOf(page) === -1) return; // not a gated app page (login/register)
  if (!e || !Array.isArray(e.features)) return; // unknown → allow (server enforces)

  // Cashier role-lock: only New Order + History.
  if (e.role === 'cashier') {
    if (CASHIER_ALLOWED.indexOf(page) === -1 && page !== 'order.html') {
      window.location.replace('order.html');
    }
    return;
  }

  // Owner/admin plan-gate. Phase 6.6: instead of bouncing to the dashboard,
  // show an in-page locked overlay (blurred teaser + Upgrade CTA) so the page's
  // 402 data calls don't spray red toasts and the owner still sees the feature.
  var feature = PAGE_FEATURE[page];
  if (feature && e.features.indexOf(feature) === -1 && page !== 'dashboard.html') {
    // Hold the visible lock card back while a first-time owner is still being
    // guided through this page's own onboarding tour (e.g. Finance). The card
    // would otherwise blur + inert the page and pre-empt the tour. We still mark
    // the gate active (gateSilently) so the page's 402 data calls don't spray red
    // toasts. Once the tour has been seen the card shows normally on the next
    // visit. Pages without a tour (Analytics, AI) lock immediately as before.
    var pageKey = page.replace(/\.html$/, '');
    if (typeof OnboardingCore !== 'undefined' &&
        OnboardingCore.hasOnboarding(pageKey) && !OnboardingCore.isTourSeen(pageKey)) {
      if (typeof LockedOverlay !== 'undefined') LockedOverlay.gateSilently();
      return;
    }
    if (typeof LockedOverlay !== 'undefined') { LockedOverlay.show(feature); return; }
    // Fallback if the overlay component isn't loaded: redirect as before.
    try { sessionStorage.setItem('os_upgrade_redirect', '1'); } catch (_) {}
    window.location.replace('dashboard.html');
  }
}

// On the page we land on after a guard redirect, tell the user why.
function showUpgradeToastIfRedirected() {
  try {
    if (sessionStorage.getItem('os_upgrade_redirect') === '1') {
      sessionStorage.removeItem('os_upgrade_redirect');
      // Show-locked (6.6): a typed/bookmarked deep link to a locked page lands
      // here on the dashboard — send the owner to the Billing page to choose a
      // plan so the upgrade intent isn't lost.
      window.location.href = 'billing.html';
    }
  } catch (_) {}
}

document.addEventListener('DOMContentLoaded', function () {
  guardCurrentPage();
  showUpgradeToastIfRedirected();
  syncEntitlementsOnLoad();
});

// Entitlements are cached at login for synchronous gating, but a plan can change
// server-side mid-session (e.g. an operator approves a GCash upgrade). Refresh the
// cache on every app-page load; if it changed, reload ONCE so the sidebar locks,
// the page guard, and the locked overlay all re-apply against the new plan — no
// re-login needed. Loop-safe: after the reload the fresh snapshot matches, so the
// next load detects no change. Fails open (network/auth miss leaves the cache).
async function syncEntitlementsOnLoad() {
  var page = window.location.pathname.split('/').pop();
  if (APP_PAGES.indexOf(page) === -1) return;            // app pages only (skip login/register/operator console)
  if (typeof refreshEntitlements !== 'function') return;
  var changed = false;
  try { changed = await refreshEntitlements(); } catch (_) { return; }
  if (changed) window.location.reload();
}

// Writes DB preferences into individual localStorage keys (no external deps).
// Called once on login before redirecting so every page reads from cache.
function _cachePreferences(prefs, userId) {
  var DEFAULTS = {
    theme: 'light', taxEnabled: false, taxRate: '0.03', taxDefaultOn: false,
    lowStockThreshold: 50, stockColors: { ok: '#5a9e6f', low: '#eab308', out: '#dc2626' },
    dashboardRecentCount: 5, dashboardWidgets: [],
    navLabel: 'app', logoTarget: 'dashboard.html', showThemeToggle: false,
    financeDebtBalanceVisible: true, osEnabled: false,
    numpadOnDesktop: false,
  };
  var p = Object.assign({}, DEFAULTS, prefs);

  // Theme is a device-local choice (set client-side by theme.js, and also used by
  // the pre-login pages). Only sync it from the server when one is actually saved
  // there — otherwise keep the device's current theme so a login never resets it
  // to light. The super-admin never visits the tenant Settings page that persists
  // prefs, so getPreferences returns {} and the 'light' default used to clobber it.
  if (prefs && prefs.theme) localStorage.setItem('theme', prefs.theme);
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
  // 6.6 upgrade-promo cooldown — server-persisted so it survives the shared-device
  // logout wipe (a localStorage-only cooldown would reset on every login).
  if (p.promoDismissedUntil) userPrefs.promoDismissedUntil = p.promoDismissedUntil;
  else delete userPrefs.promoDismissedUntil;
  localStorage.setItem(userPrefsKey, JSON.stringify(userPrefs));
}
