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

function toggleTheme() {
  const newTheme = getCurrentTheme() === 'light' ? 'dark' : 'light';
  enableThemeTransition();
  applyTheme(newTheme);
}

document.addEventListener('DOMContentLoaded', function () {
  applyTheme(getCurrentTheme());

  ['theme-toggle', 'account-theme-toggle'].forEach(function (id) {
    const btn = document.getElementById(id);
    if (btn) btn.addEventListener('click', toggleTheme);
  });
});
