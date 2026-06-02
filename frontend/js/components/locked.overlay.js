// frontend/js/components/locked.overlay.js — Phase 6.6 feature-gate overlay.
//
// When an OWNER lands on a page their plan doesn't include (e.g. Free → Finance),
// instead of a redirect + a cascade of red 402 toasts we blur the page's own
// layout as a teaser and float a centered lock card with an Upgrade CTA. The
// page's data calls may still 402, but showApiError is suppressed while a lock is
// active (see core/utils.js). The CTA opens the shared BillingModal. Owner-only —
// cashiers never reach gated pages (their links are hidden and they redirect).
//
// Styling lives in css/layout.css (.lock-overlay / .lock-card / .page-body.is-locked).

window.LockedOverlay = (function () {
  var FEATURE_META = {
    finance:            { label: 'Finance',            plan: 'basic', blurb: 'Track your capital, cashflow, and profit.' },
    analytics:          { label: 'Analytics',          plan: 'basic', blurb: 'See best-sellers, trends, and daily KPIs.' },
    advanced_analytics: { label: 'Advanced Analytics', plan: 'plus',  blurb: 'Goal projections and inventory health.' },
    ai:                 { label: 'Os AI Assistant',    plan: 'plus',  blurb: 'Ask Os about your store in plain language.' },
  };
  var PLAN_LABEL = { basic: 'Basic', plus: 'Plus', pro: 'Pro' };
  var _active = false;

  function isActive() { return _active; }

  // Blur the page content + float a lock card. Idempotent. Setting _active first
  // suppresses the 402 red-toast cascade from the page's in-flight data calls.
  function show(feature) {
    if (_active) return;
    _active = true;

    var meta = FEATURE_META[feature] || { label: 'This feature', plan: 'basic', blurb: 'Upgrade to unlock it.' };
    var planLabel = PLAN_LABEL[meta.plan] || meta.plan;

    // Blur + take the teaser content out of the tab order / AT tree.
    var body = document.querySelector('.page-body');
    if (body) {
      body.classList.add('is-locked');
      body.setAttribute('inert', '');        // ignored by old browsers (pointer-events still blocks)
      body.setAttribute('aria-hidden', 'true');
    }

    var host = document.querySelector('.main-content') || document.body;
    var ov = document.createElement('div');
    ov.className = 'lock-overlay';
    ov.setAttribute('role', 'region');
    ov.setAttribute('aria-label', meta.label + ' is locked');
    ov.innerHTML =
      '<div class="lock-card">' +
        '<div class="lock-badge"><i data-lucide="lock"></i></div>' +
        '<h2></h2><p></p>' +
        '<button type="button" class="lock-cta" id="lock-cta"></button>' +
        '<span class="lock-tag">Sample view</span>' +
      '</div>';
    host.appendChild(ov);

    // textContent for the dynamic copy (no interpolation into HTML).
    ov.querySelector('h2').textContent = meta.label + ' is part of ' + planLabel;
    ov.querySelector('p').textContent  = meta.blurb;
    var cta = ov.querySelector('#lock-cta');
    cta.textContent = 'Upgrade to ' + planLabel;
    cta.addEventListener('click', function () {
      if (typeof BillingModal !== 'undefined') BillingModal.open(meta.plan);
    });

    if (typeof lucide !== 'undefined') lucide.createIcons();
    try { cta.focus(); } catch (_) {}
  }

  return { show: show, isActive: isActive };
})();
