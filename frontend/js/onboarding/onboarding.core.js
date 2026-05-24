const OnboardingCore = (() => {

  const KEYS = {
    welcomeSeen:        'onboarding_welcome_seen',
    checklistDismissed: 'onboarding_checklist_dismissed',
    checklistProgress:  'onboarding_checklist_progress',
    tourProducts:       'onboarding_tour_products',
    tourInventory:      'onboarding_tour_inventory',
    tourOrder:          'onboarding_tour_order',
    tourDashboard:      'onboarding_tour_dashboard',
  };

  const PROGRESS_DEFAULTS = {
    addProduct:    false,
    restock:       false,
    makeSale:      false,
    viewDashboard: false,
    viewHistory:   false,
  };

  const PAGE_TO_KEY = {
    products:  'tourProducts',
    inventory: 'tourInventory',
    order:     'tourOrder',
    dashboard: 'tourDashboard',
  };

  function getUserRole() {
    try {
      const user = JSON.parse(localStorage.getItem('currentUser') || 'null');
      return (user && user.role) ? user.role : 'cashier';
    } catch (e) {
      return 'cashier';
    }
  }

  function isFirstLogin() {
    return localStorage.getItem(KEYS.welcomeSeen) !== 'true';
  }

  function markWelcomeSeen() {
    localStorage.setItem(KEYS.welcomeSeen, 'true');
  }

  function isChecklistDismissed() {
    return localStorage.getItem(KEYS.checklistDismissed) === 'true';
  }

  function dismissChecklist() {
    localStorage.setItem(KEYS.checklistDismissed, 'true');
  }

  function getChecklistProgress() {
    try {
      const raw = localStorage.getItem(KEYS.checklistProgress);
      return raw ? Object.assign({}, PROGRESS_DEFAULTS, JSON.parse(raw)) : Object.assign({}, PROGRESS_DEFAULTS);
    } catch (e) {
      return Object.assign({}, PROGRESS_DEFAULTS);
    }
  }

  function completeChecklistItem(itemKey) {
    const progress = getChecklistProgress();
    progress[itemKey] = true;
    localStorage.setItem(KEYS.checklistProgress, JSON.stringify(progress));
  }

  function isTourSeen(page) {
    const key = PAGE_TO_KEY[page];
    if (!key) return true;
    return localStorage.getItem(KEYS[key]) === 'true';
  }

  function markTourSeen(page) {
    const key = PAGE_TO_KEY[page];
    if (!key) return;
    localStorage.setItem(KEYS[key], 'true');
  }

  function resetAll() {
    Object.values(KEYS).forEach(k => localStorage.removeItem(k));
    console.log('[Onboarding] State reset. Reload the page to restart the flow.');
  }

  // ── Empty state helpers ──

  const ICONS = {
    package:  '<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>',
    bag:      '<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>',
    receipt:  '<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>',
    clipboard:'<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg>',
  };

  const EMPTY_STATE_CONFIG = {
    products: {
      icon:     ICONS.package,
      title:    'No products yet',
      body:     'Start by adding the items you sell. Once added, they\'ll appear here.',
      ctaLabel: 'Add Your First Product',
      ctaType:  'action',
      ctaAction: function () {
        var btn = document.getElementById('add-product-button');
        if (btn) btn.click();
      },
    },
    order: {
      icon:     ICONS.bag,
      title:    'Your catalog is empty',
      body:     'Add products first before making a sale.',
      ctaLabel: 'Go to Products',
      ctaType:  'href',
      ctaHref:  'products.html',
    },
    history: {
      icon:     ICONS.receipt,
      title:    'No sales yet',
      body:     'Your sales history will appear here after your first transaction.',
      ctaLabel: 'Make Your First Sale',
      ctaType:  'href',
      ctaHref:  'order.html',
    },
    inventory: {
      icon:     ICONS.clipboard,
      title:    'Nothing to stock yet',
      body:     'Add products first, then come back here to set their stock levels.',
      ctaLabel: 'Add Products',
      ctaType:  'href',
      ctaHref:  'products.html',
    },
  };

  function buildEmptyStateHTML(cfg) {
    return '<div class="onb-empty-state">' +
             '<div class="onb-empty-icon">' + cfg.icon + '</div>' +
             '<h3 class="onb-empty-title">' + cfg.title + '</h3>' +
             '<p class="onb-empty-body">' + cfg.body + '</p>' +
             '<button class="onb-btn-primary onb-empty-cta">' + cfg.ctaLabel + '</button>' +
           '</div>';
  }

  function renderEmptyState(containerSelector, pageKey, colSpan) {
    var cfg = EMPTY_STATE_CONFIG[pageKey];
    if (!cfg) return;

    var el = typeof containerSelector === 'string'
      ? document.querySelector(containerSelector)
      : containerSelector;
    if (!el) return;

    var html = buildEmptyStateHTML(cfg);

    if (el.tagName === 'TBODY') {
      el.innerHTML = '<tr><td colspan="' + (colSpan || 1) + '" class="onb-empty-cell">' + html + '</td></tr>';
    } else {
      el.innerHTML = html;
    }

    var cta = el.querySelector('.onb-empty-cta');
    if (!cta) return;

    if (cfg.ctaType === 'href') {
      cta.addEventListener('click', function () { window.location.href = cfg.ctaHref; });
    } else if (cfg.ctaType === 'action') {
      cta.addEventListener('click', cfg.ctaAction);
    }
  }

  return {
    getUserRole,
    isFirstLogin,
    markWelcomeSeen,
    isChecklistDismissed,
    dismissChecklist,
    getChecklistProgress,
    completeChecklistItem,
    isTourSeen,
    markTourSeen,
    resetAll,
    renderEmptyState,
  };

})();
