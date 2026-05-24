const OnboardingChecklist = (() => {

  const ADMIN_ITEMS = [
    { key: 'addProduct',    label: 'Add your first product',      link: 'products.html'  },
    { key: 'restock',       label: 'Restock it so it has stock',  link: 'inventory.html' },
    { key: 'makeSale',      label: 'Make your first sale',        link: 'order.html'     },
    { key: 'viewDashboard', label: 'Check your Dashboard summary', link: null            },
  ];

  const CASHIER_ITEMS = [
    { key: 'makeSale',    label: 'Make your first sale',    link: 'order.html'   },
    { key: 'viewHistory', label: 'Check your Sales History', link: 'history.html' },
  ];

  const SVG_DONE =
    '<svg class="onb-check-svg" viewBox="0 0 20 20" width="20" height="20">' +
      '<circle cx="10" cy="10" r="10" fill="var(--color-primary)"/>' +
      '<path d="M6 10l3 3 5-5" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" fill="none"/>' +
    '</svg>';

  const SVG_PENDING =
    '<svg class="onb-check-svg" viewBox="0 0 20 20" width="20" height="20" fill="none">' +
      '<circle cx="10" cy="10" r="8.5" stroke="var(--color-border)" stroke-width="1.5"/>' +
    '</svg>';

  const SVG_CELEBRATE =
    '<svg viewBox="0 0 24 24" width="40" height="40">' +
      '<circle cx="12" cy="12" r="12" fill="var(--color-primary)"/>' +
      '<path d="M7 12l4 4 6-7" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>' +
    '</svg>';

  let celebrating = false;

  // ── Helpers ──

  function getItemsForRole(role) {
    return role === 'admin' ? ADMIN_ITEMS : CASHIER_ITEMS;
  }

  function calcPercent(items, progress) {
    if (!items.length) return 0;
    const done = items.filter(function (i) { return !!progress[i.key]; }).length;
    return Math.round((done / items.length) * 100);
  }

  function buildItemHTML(item, progress) {
    const done      = !!progress[item.key];
    const doneClass = done ? ' onb-item--done' : '';
    const icon      = done ? SVG_DONE : SVG_PENDING;
    const label     = (item.link && !done)
      ? '<a href="' + item.link + '" class="onb-checklist-label">' + item.label + '</a>'
      : '<span class="onb-checklist-label">' + item.label + '</span>';

    return '<li class="onb-checklist-item' + doneClass + '">' +
             '<span class="onb-check-icon">' + icon + '</span>' +
             label +
           '</li>';
  }

  // ── Core functions ──

  function init() {
    if (OnboardingCore.isChecklistDismissed()) return;
    const slot = document.getElementById('onb-checklist-slot');
    if (!slot) return;
    celebrating = false;
    render();
    bindEvents();
    checkAutoComplete();
  }

  function render() {
    const slot = document.getElementById('onb-checklist-slot');
    if (!slot) return;

    const role     = OnboardingCore.getUserRole();
    const progress = OnboardingCore.getChecklistProgress();
    const items    = getItemsForRole(role);
    const pct      = calcPercent(items, progress);

    slot.innerHTML =
      '<div id="onb-checklist-card" class="onb-checklist-card">' +
        '<div class="onb-checklist-header">' +
          '<span class="onb-checklist-title">Get your store ready</span>' +
          '<button class="onb-checklist-close" id="onb-checklist-x" aria-label="Dismiss">&#10005;</button>' +
        '</div>' +
        '<div class="onb-checklist-progress-bar">' +
          '<div class="onb-checklist-progress-fill" style="width:' + pct + '%"></div>' +
        '</div>' +
        '<ul class="onb-checklist-list" id="onb-checklist-list">' +
          items.map(function (item) { return buildItemHTML(item, progress); }).join('') +
        '</ul>' +
      '</div>';
  }

  function bindEvents() {
    const btn = document.getElementById('onb-checklist-x');
    if (btn) btn.addEventListener('click', dismiss);
  }

  function dismiss() {
    OnboardingCore.dismissChecklist();
    const card = document.getElementById('onb-checklist-card');
    if (card) {
      card.classList.add('onb-checklist-card--hiding');
      setTimeout(function () { card.remove(); }, 300);
    }
    if (typeof SidebarProgress !== 'undefined') SidebarProgress.hide();
  }

  function checkAutoComplete() {
    if (OnboardingCore.getUserRole() !== 'admin') return;
    const progress = OnboardingCore.getChecklistProgress();
    if (progress.makeSale && !progress.viewDashboard) {
      OnboardingCore.completeChecklistItem('viewDashboard');
      refresh();
    }
  }

  function refresh() {
    const card = document.getElementById('onb-checklist-card');
    if (!card) return;
    if (celebrating) return;

    const role     = OnboardingCore.getUserRole();
    const progress = OnboardingCore.getChecklistProgress();
    const items    = getItemsForRole(role);
    const pct      = calcPercent(items, progress);

    const fill = card.querySelector('.onb-checklist-progress-fill');
    if (fill) fill.style.width = pct + '%';

    const list = document.getElementById('onb-checklist-list');
    if (list) {
      list.innerHTML = items.map(function (item) { return buildItemHTML(item, progress); }).join('');
    }

    const allDone = items.every(function (item) { return !!progress[item.key]; });
    if (allDone) celebrateAndDismiss();
  }

  function celebrateAndDismiss() {
    if (celebrating) return;
    celebrating = true;

    const card = document.getElementById('onb-checklist-card');
    if (!card) return;

    card.innerHTML =
      '<div class="onb-checklist-celebrate">' +
        SVG_CELEBRATE +
        '<p>Great job! You\'re all set.</p>' +
      '</div>';

    setTimeout(dismiss, 2000);
  }

  function complete(itemKey) {
    OnboardingCore.completeChecklistItem(itemKey);
    refresh();
    if (typeof SidebarProgress !== 'undefined') SidebarProgress.update();
  }

  return { init, complete };

})();
