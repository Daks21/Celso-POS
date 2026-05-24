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
  };

})();
