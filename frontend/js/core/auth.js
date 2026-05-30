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

      // Pull saved preferences from DB and cache them in localStorage
      // so every app page reads from cache without an extra API call.
      try {
        const prefsResult = await getPreferences();
        if (prefsResult && prefsResult.success) {
          _cachePreferences(prefsResult.data || {}, result.user.id);
        }
      } catch (e) { /* non-fatal — localStorage defaults will be used */ }

      window.location.href = "pages/dashboard.html";
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

  localStorage.setItem('storeName',    p.storeName    || '');
  localStorage.setItem('storeAddress', p.storeAddress || '');
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
