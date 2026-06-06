function getCurrentTheme() {
  return localStorage.getItem('theme') || 'light';
}

function applyTheme(theme) {
  const html       = document.documentElement;
  const iconName   = theme === 'dark' ? 'sun' : 'moon';
  const iconIds    = ['theme-icon', 'account-theme-icon'];

  if (theme === 'dark') {
    html.setAttribute('data-theme', 'dark');
  } else {
    html.removeAttribute('data-theme');
  }

  iconIds.forEach(function (id) {
    const icon = document.getElementById(id);
    if (icon) icon.setAttribute('data-lucide', iconName);
  });

  if (window.lucide) lucide.createIcons();

  localStorage.setItem('theme', theme);
}

let themeTransitionTimer = null;

// Arm a one-shot, synchronized color transition on the whole document,
// then disarm it once the fade finishes. Kept off the initial page load
// (applyTheme) so saved themes apply instantly with no fade-in flash.
function enableThemeTransition() {
  const html = document.documentElement;
  html.classList.add('theme-transition');
  if (themeTransitionTimer) clearTimeout(themeTransitionTimer);
  themeTransitionTimer = setTimeout(function () {
    html.classList.remove('theme-transition');
    themeTransitionTimer = null;
  }, 320);
}

// The toggle writes the choice to localStorage (device-local), but that alone
// never reaches the DB — only Account/Analytics/promo-dismiss call
// syncPreferencesToDb. So a theme picked here used to be silently reverted on
// the next login, where _cachePreferences re-applies the (stale) server theme.
// Persist it here too, debounced against rapid toggling. Guarded so the shared
// pre-login pages (no token, data.js not loaded) stay device-local only.
let _themePersistTimer = null;

function persistThemeToDb() {
  if (!localStorage.getItem('token')) return;                 // not signed in
  if (typeof syncPreferencesToDb !== 'function') return;      // data.js not on this page
  let userId = null;
  try {
    const user = JSON.parse(localStorage.getItem('currentUser') || 'null');
    userId = user && user.id != null ? user.id : null;
  } catch (e) { /* fall through */ }
  if (userId == null) return;

  if (_themePersistTimer) clearTimeout(_themePersistTimer);
  _themePersistTimer = setTimeout(function () {
    _themePersistTimer = null;
    syncPreferencesToDb(userId);
  }, 600);
}

function toggleTheme() {
  const newTheme = getCurrentTheme() === 'light' ? 'dark' : 'light';
  enableThemeTransition();
  applyTheme(newTheme);
  persistThemeToDb();
}

document.addEventListener('DOMContentLoaded', function () {
  applyTheme(getCurrentTheme());

  ['theme-toggle', 'account-theme-toggle'].forEach(function (id) {
    const btn = document.getElementById(id);
    if (btn) btn.addEventListener('click', toggleTheme);
  });
});
