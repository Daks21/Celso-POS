const OnboardingWelcome = (() => {

  // The welcome modal only ever runs for store owners — it inits on the
  // dashboard, the one page cashiers and super-admins never reach — so all copy
  // here is owner-only. Panel 2 fires a celebratory confetti burst for every new
  // store (there is no trial; Free already includes Finance + Analytics).

  const STORE_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24"
    fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M3 9l1-5h16l1 5"/>
    <path d="M3 9a1 1 0 0 0 1 1h.5A1.5 1.5 0 0 0 6 8.5v0A1.5 1.5 0 0 0 7.5 10H8a1.5 1.5 0 0 0 1.5-1.5v0A1.5 1.5 0 0 0 11 10h.5A1.5 1.5 0 0 0 13 8.5v0A1.5 1.5 0 0 0 14.5 10H15a1.5 1.5 0 0 0 1.5-1.5v0A1.5 1.5 0 0 0 18 10h.5a1 1 0 0 0 1-1"/>
    <path d="M4 10v9a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-9"/>
    <rect x="9" y="14" width="6" height="6" rx="1"/>
  </svg>`;

  // Panel-2 description (owner-only modal — see header note).
  const PANEL_2_DESC = 'Your store dashboard is ready. Start by logging your starting capital, then add the products you sell.';

  // Panel-1 "here's the path" setup steps.
  const WELCOME_STEPS = ['Log starting capital', 'Add your products', 'Restock them', 'Make your first sale'];

  function init() {
    if (!OnboardingCore.isFirstLogin()) return false;
    render();
    bindEvents();
    return true;
  }

  function render() {
    const desc = PANEL_2_DESC;

    // Free plan already includes Finance + Analytics, so welcome the owner with a
    // short reassurance instead of a trial countdown.
    const giftHtml =
      '<div class="onb-gift" style="margin:4px 0 2px;padding:12px 14px;border-radius:12px;' +
        'background:rgba(90,158,111,.1);border:1px solid rgba(90,158,111,.35);' +
        'color:var(--color-text);font-size:14px;line-height:1.45;text-align:center">' +
        '🎁 <b>Finance &amp; Analytics are free</b><br>' +
        'Track your cashflow and see your best sellers from day one.</div>';

    // Build the setup step pills for panel 1.
    const stepsHtml = WELCOME_STEPS.map(function (label, i) {
      return '<div class="onb-step">' +
               '<span class="onb-step-num">' + (i + 1) + '</span>' +
               '<span>' + label + '</span>' +
             '</div>';
    }).join('');

    let detectedTz = 'Asia/Manila';
    try { detectedTz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Manila'; } catch (e) {}
    let zones = [];
    try { if (typeof Intl.supportedValuesOf === 'function') zones = Intl.supportedValuesOf('timeZone'); } catch (e) {}
    if (!zones.length) {
      zones = ['Asia/Manila','Asia/Singapore','Asia/Hong_Kong','Asia/Tokyo',
               'Asia/Dubai','Asia/Kolkata','Australia/Sydney','Europe/London',
               'Europe/Paris','America/New_York','America/Chicago',
               'America/Los_Angeles','Pacific/Honolulu','UTC'];
    }
    if (zones.indexOf(detectedTz) === -1) zones.unshift(detectedTz);
    const tzOptions = zones.map(function (z) {
      return '<option value="' + z + '"' + (z === detectedTz ? ' selected' : '') + '>' + z + '</option>';
    }).join('');
    // Timezone confirmation — the store timezone is store-wide. Pre-select the
    // device's detected zone; the owner can change it here or later in Account
    // Settings.
    const tzFieldHtml =
      '<div class="onb-tz-field">' +
        '<label for="onb-tz-select">Store timezone</label>' +
        '<select id="onb-tz-select" class="onb-tz-select">' + tzOptions + '</select>' +
        '<p class="onb-tz-hint">We detected this from your device. Sales and daily totals use it to know when each day starts. You can change it later in Account Settings.</p>' +
      '</div>';

    const html = `
<div id="onb-welcome-overlay" class="onb-overlay onb-overlay--welcome"
     role="dialog" aria-modal="true" aria-labelledby="onb-welcome-title">
  <div class="onb-welcome-modal">

    <div class="onb-welcome-handle" aria-hidden="true"></div>
    <button type="button" class="onb-welcome-close" id="onb-welcome-close" aria-label="Close welcome">&#10005;</button>

    <div class="onb-welcome-panel" id="onb-panel-1">
      <div class="onb-welcome-icon">${STORE_ICON}</div>
      <h2 id="onb-welcome-title">Welcome to Celso POS</h2>
      <p>Everything you need to manage your store — products, stock, sales, and your money — all in one place.</p>
      <div class="onb-welcome-steps">
        ${stepsHtml}
      </div>
      <button type="button" class="onb-btn-primary" id="onb-welcome-next">Next →</button>
    </div>

    <div class="onb-welcome-panel onb-hidden" id="onb-panel-2">
      <div class="onb-welcome-icon onb-welcome-icon--check">
        <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24"
          fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"/>
          <path d="M8 12l3 3 5-5"/>
        </svg>
      </div>
      <h2>You're all set.</h2>
      <p id="onb-panel-2-desc">${desc}</p>
      ${giftHtml}
      ${tzFieldHtml}
      <button type="button" class="onb-btn-primary" id="onb-welcome-done">Let's Go</button>
    </div>

    <div class="onb-dots">
      <span class="onb-dot onb-dot--active" id="onb-dot-1"></span>
      <span class="onb-dot" id="onb-dot-2"></span>
    </div>

  </div>
</div>`;

    document.body.insertAdjacentHTML('beforeend', html);
    var _scrollEl = document.querySelector('.page-body') || document.body;
    _scrollEl.style.overflow = 'hidden';

    // Move focus into the modal so screen readers announce it and Esc handler
    // (which is global) is reachable from anywhere.
    setTimeout(function () {
      var first = document.getElementById('onb-welcome-next');
      if (first) first.focus();
    }, 50);
  }

  function bindEvents() {
    document.getElementById('onb-welcome-next').addEventListener('click', function () {
      showPanel(2);
    });
    document.getElementById('onb-welcome-done').addEventListener('click', function () {
      // Persist the chosen store timezone (admins only). Non-fatal on failure —
      // the value is cached locally and can be corrected in Account Settings.
      var sel = document.getElementById('onb-tz-select');
      if (sel && sel.value) {
        if (typeof setStoreTz === 'function') setStoreTz(sel.value);
        if (typeof updateStoreTimezone === 'function') updateStoreTimezone(sel.value).catch(function () {});
      }
      close();
    });
    document.getElementById('onb-welcome-close').addEventListener('click', close);

    document.addEventListener('keydown', _onKey);

    // Focus trap — Tab cycles within the modal
    var overlay = document.getElementById('onb-welcome-overlay');
    if (overlay) overlay.addEventListener('keydown', _trapFocus);
  }

  function _onKey(e) {
    if (!document.getElementById('onb-welcome-overlay')) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
    }
  }

  function _trapFocus(e) {
    if (e.key !== 'Tab') return;
    var overlay = document.getElementById('onb-welcome-overlay');
    if (!overlay) return;
    var focusables = overlay.querySelectorAll('button:not([disabled])');
    if (!focusables.length) return;
    var first = focusables[0];
    var last  = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault(); last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault(); first.focus();
    }
  }

  function showPanel(num) {
    const panel1 = document.getElementById('onb-panel-1');
    const panel2 = document.getElementById('onb-panel-2');
    const dot1   = document.getElementById('onb-dot-1');
    const dot2   = document.getElementById('onb-dot-2');

    if (num === 2) {
      panel1.classList.add('onb-hidden');
      panel2.classList.remove('onb-hidden');
      dot1.classList.remove('onb-dot--active');
      dot2.classList.add('onb-dot--active');
      var done = document.getElementById('onb-welcome-done');
      if (done) done.focus();
      _confetti();   // celebrate the new store
    } else {
      panel2.classList.add('onb-hidden');
      panel1.classList.remove('onb-hidden');
      dot2.classList.remove('onb-dot--active');
      dot1.classList.add('onb-dot--active');
    }
  }

  function close() {
    OnboardingCore.markWelcomeSeen();
    document.removeEventListener('keydown', _onKey);

    const overlay = document.getElementById('onb-welcome-overlay');
    if (overlay) overlay.remove();

    var _scrollEl = document.querySelector('.page-body') || document.body;
    _scrollEl.style.overflow = '';

    if (typeof OnboardingChecklist !== 'undefined') OnboardingChecklist.init();
    if (typeof SidebarProgress     !== 'undefined') SidebarProgress.init();
  }

  // Lightweight, dependency-free confetti burst from the top-centre. Respects
  // prefers-reduced-motion (skips entirely). Self-removes after ~2.2s.
  function _confetti() {
    try {
      if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      var canvas = document.createElement('canvas');
      canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:2147483000';
      document.body.appendChild(canvas);
      var ctx = canvas.getContext('2d');
      canvas.width = window.innerWidth; canvas.height = window.innerHeight;
      var colors = ['#5a9e6f', '#eab308', '#dc2626', '#3b82f6', '#ec4899', '#f97316'];
      var parts = [];
      for (var i = 0; i < 130; i++) {
        parts.push({
          x: canvas.width / 2, y: canvas.height / 3,
          vx: (Math.random() - 0.5) * 14, vy: Math.random() * -13 - 3,
          size: Math.random() * 6 + 4, color: colors[i % colors.length],
          rot: Math.random() * 6.28, vr: (Math.random() - 0.5) * 0.4,
        });
      }
      var start = performance.now();
      (function frame(t) {
        var elapsed = t - start;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        for (var j = 0; j < parts.length; j++) {
          var p = parts[j];
          p.vy += 0.32; p.x += p.vx; p.y += p.vy; p.rot += p.vr;
          ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
          ctx.globalAlpha = Math.max(0, 1 - elapsed / 2200);
          ctx.fillStyle = p.color;
          ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
          ctx.restore();
        }
        if (elapsed < 2200) requestAnimationFrame(frame);
        else if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
      })(start);
    } catch (e) { /* confetti is decorative — never block the flow */ }
  }

  return { init };

})();
