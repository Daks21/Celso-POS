// ── Nav Preferences ──

var NAV_PREFS_DEFAULTS = {
  navLabel:        'app',
  logoTarget:      'order.html',
  showThemeToggle: false
};

function getNavPrefsKey() {
  try {
    var user = JSON.parse(localStorage.getItem('currentUser') || 'null');
    var uid  = user && (user.id || user.email) ? String(user.id || user.email) : 'guest';
    return 'celso_navprefs_' + uid;
  } catch (e) {
    return 'celso_navprefs_guest';
  }
}

function getNavPrefs() {
  try {
    var raw = localStorage.getItem(getNavPrefsKey());
    return raw
      ? Object.assign({}, NAV_PREFS_DEFAULTS, JSON.parse(raw))
      : Object.assign({}, NAV_PREFS_DEFAULTS);
  } catch (e) {
    return Object.assign({}, NAV_PREFS_DEFAULTS);
  }
}

function saveNavPrefs(prefs) {
  localStorage.setItem(getNavPrefsKey(), JSON.stringify(prefs));
}

// Applies show/hide prefs to topbar elements — safe to call any time after DOMContentLoaded
function applyNavPrefs() {
  var prefs = getNavPrefs();

  var themeToggle = document.getElementById('theme-toggle');
  if (themeToggle) themeToggle.style.display = prefs.showThemeToggle ? '' : 'none';
}

// ── Sidebar helpers ──

function getUserInitials(fullName) {
  if (!fullName) return '--';
  return fullName.split(' ').map(function(w) { return w[0]; }).join('').toUpperCase().substring(0, 2);
}

function setActiveNavLink() {
  var currentPage = window.location.pathname.split('/').pop() || 'dashboard.html';
  document.querySelectorAll('.nav-link').forEach(function(link) {
    link.classList.toggle('active', link.getAttribute('href') === currentPage);
  });
}

// ── Store brand ──
// The sidebar brand reflects the owner's store name (set in Account settings),
// falling back to "Celso POS" when blank. The name is user input, so callers
// must render it via textContent — never interpolate it into an HTML string.
function getStoreBrand() {
  try {
    return (localStorage.getItem('storeName') || '').trim() || 'Celso POS';
  } catch (e) {
    return 'Celso POS';
  }
}

// Paints the brand into both the desktop (static) and mobile (injected) spans.
// Mobile is left alone when navLabel === 'page', which shows the page title.
function applyStoreBrand() {
  var brand = getStoreBrand();

  var deskEl = document.querySelector('.sidebar-header .sidebar-app-name');
  if (deskEl) {
    deskEl.textContent = brand;
    // Desktop only (the sidebar has 0 width while hidden on mobile): if the
    // name overflows one line, switch to the smaller two-line treatment.
    deskEl.classList.remove('is-long');
    if (window.matchMedia('(min-width: 769px)').matches &&
        deskEl.scrollWidth > deskEl.clientWidth) {
      deskEl.classList.add('is-long');
    }
  }

  var mobEl = document.querySelector('.mobile-topbar-logo .sidebar-app-name');
  if (mobEl && getNavPrefs().navLabel !== 'page') mobEl.textContent = brand;
}

window.SidebarBrand = { apply: applyStoreBrand, get: getStoreBrand };

function populateUserInfo() {
  var currentUser = JSON.parse(localStorage.getItem('currentUser'));
  if (!currentUser) return;
  var initials = getUserInitials(currentUser.fullName);
  ['user-avatar', 'mobile-user-avatar'].forEach(function(id) {
    var el = document.getElementById(id);
    if (el) el.textContent = initials;
  });
  ['user-name', 'mobile-user-name'].forEach(function(id) {
    var el = document.getElementById(id);
    if (el) el.textContent = currentUser.fullName;
  });
}

function initUserPopup() {
  var trigger = document.getElementById('user-menu-trigger');
  var popup   = document.getElementById('user-popup');
  if (!trigger || !popup) return;
  trigger.addEventListener('click', function(e) {
    e.stopPropagation();
    popup.classList.toggle('is-open');
  });
  document.addEventListener('click', function() {
    popup.classList.remove('is-open');
  });
  popup.addEventListener('click', function(e) {
    e.stopPropagation();
  });
}

function initLogout() {
  var btn = document.getElementById('logout-button');
  if (!btn) return;
  btn.addEventListener('click', function() {
    clearSession();
    window.location.href = '../index.html';
  });
}

// ── Mobile Nav ──

var SVG_MENU = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" x2="20" y1="6" y2="6"/><line x1="4" x2="20" y1="12" y2="12"/><line x1="4" x2="20" y1="18" y2="18"/></svg>';
var SVG_X    = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';

function closeMobileNav() {
  var panel = document.getElementById('mobile-nav');
  var btn   = document.getElementById('mobile-menu-btn');
  if (panel) panel.classList.remove('is-open');
  if (btn) {
    btn.setAttribute('aria-expanded', 'false');
    btn.innerHTML = SVG_MENU;
  }
}

function initMobileNav() {
  var topbar = document.querySelector('.topbar');
  if (!topbar) return;

  var prefs = getNavPrefs();

  // Inject logo at left of topbar — only the icon box is tappable (logoTarget pref)
  var logo = document.createElement('div');
  logo.className = 'mobile-topbar-logo';
  var h1El = topbar.querySelector('h1');
  var labelText = prefs.navLabel === 'page' && h1El
    ? (h1El.textContent || getStoreBrand())
    : getStoreBrand();
  logo.innerHTML =
    '<a href="' + prefs.logoTarget + '" class="sidebar-logo-box mobile-logo-link" aria-label="Go to home">' +
      '<i data-lucide="leaf"></i>' +
    '</a>' +
    '<span class="sidebar-app-name"></span>';
  // textContent (not interpolation) — labelText may be the user's store name.
  logo.querySelector('.sidebar-app-name').textContent = labelText;
  topbar.insertBefore(logo, topbar.firstChild);

  // Inject hamburger into topbar-actions (right side, after theme toggle)
  var hamburger = document.createElement('button');
  hamburger.type = 'button';
  hamburger.id = 'mobile-menu-btn';
  hamburger.className = 'topbar-icon-button mobile-menu-btn';
  hamburger.title = 'Menu';
  hamburger.setAttribute('aria-label', 'Open navigation menu');
  hamburger.setAttribute('aria-expanded', 'false');
  hamburger.setAttribute('aria-controls', 'mobile-nav');
  hamburger.innerHTML = SVG_MENU;
  var topbarActions = topbar.querySelector('.topbar-actions');
  if (topbarActions) topbarActions.appendChild(hamburger);
  else topbar.appendChild(hamburger);

  // Build nav links
  var currentPage = window.location.pathname.split('/').pop() || 'dashboard.html';
  var navItems = [
    { href: 'dashboard.html', icon: 'layout-dashboard', label: 'Dashboard' },
    { href: 'order.html',     icon: 'shopping-cart',    label: 'New Order'  },
    { href: 'inventory.html', icon: 'archive',           label: 'Inventory'  },
    { href: 'products.html',  icon: 'package',           label: 'Products'   },
    { href: 'finance.html',   icon: 'wallet',            label: 'Finance'    },
    { href: 'analytics.html', icon: 'bar-chart-2',       label: 'Analytics'  },
    { href: 'history.html',   icon: 'clock',             label: 'History'    },
  ];

  var linksHtml = navItems.map(function(item) {
    var active = item.href === currentPage ? ' active' : '';
    return '<a href="' + item.href + '" class="mobile-nav-link' + active + '">' +
      '<i data-lucide="' + item.icon + '"></i><span>' + item.label + '</span></a>';
  }).join('');

  // Inject slide-down nav panel
  var panel = document.createElement('div');
  panel.id = 'mobile-nav';
  panel.className = 'mobile-nav';
  panel.setAttribute('role', 'navigation');
  panel.setAttribute('aria-label', 'Main navigation');
  panel.innerHTML =
    '<div class="mobile-nav-links">' + linksHtml + '</div>' +
    '<div class="mobile-nav-footer">' +
      '<div class="mobile-nav-user-row">' +
        '<div class="user-avatar" id="mobile-user-avatar">--</div>' +
        '<div class="mobile-nav-user-info">' +
          '<p class="user-name" id="mobile-user-name">User</p>' +
          '<p class="user-role">Cashier</p>' +
        '</div>' +
      '</div>' +
      '<div class="mobile-nav-actions">' +
        '<a href="account.html" class="mobile-nav-action">' +
          '<i data-lucide="user"></i>Account Settings' +
        '</a>' +
        '<button type="button" class="mobile-nav-action mobile-nav-action--logout" id="mobile-logout-btn">' +
          '<i data-lucide="log-out"></i>Logout' +
        '</button>' +
      '</div>' +
    '</div>';

  topbar.insertAdjacentElement('afterend', panel);
  if (typeof lucide !== 'undefined') lucide.createIcons();

  function openNav() {
    panel.classList.add('is-open');
    hamburger.setAttribute('aria-expanded', 'true');
    hamburger.innerHTML = SVG_X;
  }

  hamburger.addEventListener('click', function(e) {
    e.stopPropagation();
    panel.classList.contains('is-open') ? closeMobileNav() : openNav();
  });

  document.addEventListener('click', function() {
    if (panel.classList.contains('is-open')) closeMobileNav();
  });

  panel.addEventListener('click', function(e) {
    e.stopPropagation();
  });

  var mobileLogout = document.getElementById('mobile-logout-btn');
  if (mobileLogout) {
    mobileLogout.addEventListener('click', function() {
      clearSession();
      window.location.href = '../index.html';
    });
  }
}

// ── FAB ──

function mountFab() {
  var currentPage = window.location.pathname.split('/').pop();
  if (currentPage === 'order.html') return;
  if (document.getElementById('new-sale-fab')) return;
  var fab = document.createElement('button');
  fab.id = 'new-sale-fab';
  fab.className = 'fab';
  fab.title = 'New Sale';
  fab.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"></path><path d="M12 5v14"></path></svg>';
  fab.addEventListener('click', function() {
    window.location.href = 'order.html';
  });
  document.body.appendChild(fab);
}

function unmountFab() {
  var fab = document.getElementById('new-sale-fab');
  if (fab) fab.parentNode.removeChild(fab);
}

function initFab() {
  try {
    var user  = JSON.parse(localStorage.getItem('currentUser') || '{}');
    var key   = 'prefs_' + (user.id || 'guest');
    var prefs = JSON.parse(localStorage.getItem(key) || '{}');
    if (prefs.osEnabled === true) return;
  } catch (_) {}
  mountFab();
}

window.DefaultFab = { mount: mountFab, unmount: unmountFab };

// ── Mobile: hide topbar on scroll down, reveal on scroll up ──

function initScrollHideTopbar() {
  if (!window.matchMedia('(max-width: 768px)').matches) return;

  var topbar   = document.querySelector('.topbar');
  var pageBody = document.querySelector('.page-body');
  if (!topbar || !pageBody) return;

  var lastY     = 0;
  var DEAD_ZONE = 80; // px — never hide within this distance from the top

  pageBody.addEventListener('scroll', function() {
    var y = pageBody.scrollTop;

    if (y < DEAD_ZONE) {
      topbar.classList.remove('topbar--hidden');
    } else if (y > lastY) {
      // scrolling down
      topbar.classList.add('topbar--hidden');
      closeMobileNav();
    } else {
      // scrolling up
      topbar.classList.remove('topbar--hidden');
    }

    lastY = y;
  }, { passive: true });
}

// ── Global: close modals on Escape ──

document.addEventListener('keydown', function(e) {
  if (e.key !== 'Escape') return;
  document.querySelectorAll('.modal-overlay').forEach(function(modal) {
    if (modal.style.display === 'flex') modal.style.display = 'none';
  });
});

// ── Sidebar Progress Pill (onboarding) ──

var SidebarProgress = (function () {

  var ROLE_KEYS = {
    admin:   ['logCapital', 'addProduct', 'restock', 'makeSale', 'viewDashboard'],
    cashier: ['makeSale', 'viewHistory'],
  };

  function _counts() {
    if (typeof OnboardingCore === 'undefined') return null;
    var role     = OnboardingCore.getUserRole();
    var keys     = ROLE_KEYS[role] || ROLE_KEYS.cashier;
    var progress = OnboardingCore.getChecklistProgress();
    var done     = keys.filter(function (k) { return !!progress[k]; }).length;
    return { done: done, total: keys.length };
  }

  function init() {
    if (typeof OnboardingCore === 'undefined') return;
    if (OnboardingCore.isChecklistDismissed()) return;
    render();
  }

  function render() {
    var existing = document.getElementById('onb-sidebar-progress');
    if (existing) existing.remove();

    var c = _counts();
    if (!c) return;

    var nav = document.querySelector('.sidebar-nav');
    if (!nav) return;

    var pill = document.createElement('div');
    pill.id        = 'onb-sidebar-progress';
    pill.className = 'onb-sidebar-progress';
    pill.innerHTML =
      '<span class="onb-sidebar-progress-label">Setup</span>' +
      '<span class="onb-sidebar-progress-count" id="onb-sidebar-progress-count">' +
        c.done + ' of ' + c.total + ' done' +
      '</span>';

    nav.insertAdjacentElement('afterend', pill);
  }

  function update() {
    var countEl = document.getElementById('onb-sidebar-progress-count');
    if (!countEl) return;
    var c = _counts();
    if (!c) return;
    countEl.textContent = c.done + ' of ' + c.total + ' done';
  }

  function hide() {
    var pill = document.getElementById('onb-sidebar-progress');
    if (pill) pill.remove();
  }

  return { init: init, update: update, hide: hide };

})();

// ── Boot ──

document.addEventListener('DOMContentLoaded', function() {
  applyNavPrefs();    // hide/show topbar elements before first paint
  initMobileNav();
  applyStoreBrand();  // paint the desktop brand from the saved store name
  setActiveNavLink();
  populateUserInfo();
  initUserPopup();
  initLogout();
  initFab();
  initScrollHideTopbar();
  SidebarProgress.init();
});
