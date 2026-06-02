// frontend/js/components/locked.overlay.js — Phase 6.6 feature-gate overlay.
//
// When an OWNER lands on a page their plan doesn't include (e.g. Free → Finance),
// instead of a redirect + a cascade of red 402 toasts we blur the page's own
// layout as a teaser and float a centered lock card with an Upgrade CTA. The
// page's data calls may still 402, but showApiError is suppressed while a lock is
// active (see core/utils.js). The CTA opens the shared BillingModal. Owner-only —
// cashiers never reach gated pages (their links are hidden and they redirect).

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

  function injectStyles() {
    if (document.getElementById('lock-overlay-styles')) return;
    var css = ''
      + '.page-body.is-locked{filter:blur(3px);pointer-events:none;user-select:none;opacity:.9}'
      + '.lock-overlay{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;padding:24px;z-index:60;pointer-events:none}'
      + '.lock-card{pointer-events:auto;max-width:360px;width:100%;text-align:center;background:var(--color-surface);border:1px solid var(--color-border);border-radius:var(--radius-lg);box-shadow:var(--shadow-lg);padding:30px 26px}'
      + '.lock-card .lock-badge{width:52px;height:52px;margin:0 auto 14px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:rgba(90,158,111,.12);color:var(--color-primary)}'
      + '.lock-card .lock-badge svg{width:26px;height:26px}'
      + '.lock-card h2{font-size:19px;margin:0 0 6px;color:var(--color-text)}'
      + '.lock-card p{font-size:14px;color:var(--color-text-muted);margin:0 0 18px;line-height:1.45}'
      + '.lock-card .lock-cta{width:100%;padding:12px;border:none;border-radius:var(--radius-sm);background:var(--color-primary);color:#fff;font-family:inherit;font-weight:600;font-size:14px;cursor:pointer}'
      + '.lock-card .lock-tag{display:inline-block;margin-top:12px;font-size:11px;letter-spacing:.04em;text-transform:uppercase;color:var(--color-text-muted)}';
    var s = document.createElement('style'); s.id = 'lock-overlay-styles'; s.textContent = css;
    document.head.appendChild(s);
  }

  // Blur the page content + float a lock card. Idempotent. Setting _active first
  // suppresses the 402 red-toast cascade from the page's in-flight data calls.
  function show(feature) {
    if (_active) return;
    _active = true;
    injectStyles();

    var meta = FEATURE_META[feature] || { label: 'This feature', plan: 'basic', blurb: 'Upgrade to unlock it.' };
    var planLabel = PLAN_LABEL[meta.plan] || meta.plan;

    var body = document.querySelector('.page-body');
    if (body) body.classList.add('is-locked');

    var host = document.querySelector('.main-content') || document.body;
    var ov = document.createElement('div');
    ov.className = 'lock-overlay';
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
  }

  return { show: show, isActive: isActive };
})();
