const OnboardingWelcome = (() => {

  const STORE_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24"
    fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M3 9l1-5h16l1 5"/>
    <path d="M3 9a1 1 0 0 0 1 1h.5A1.5 1.5 0 0 0 6 8.5v0A1.5 1.5 0 0 0 7.5 10H8a1.5 1.5 0 0 0 1.5-1.5v0A1.5 1.5 0 0 0 11 10h.5A1.5 1.5 0 0 0 13 8.5v0A1.5 1.5 0 0 0 14.5 10H15a1.5 1.5 0 0 0 1.5-1.5v0A1.5 1.5 0 0 0 18 10h.5a1 1 0 0 0 1-1"/>
    <path d="M4 10v9a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-9"/>
    <rect x="9" y="14" width="6" height="6" rx="1"/>
  </svg>`;

  const PANEL_2_COPY = {
    admin:   'Your store dashboard is ready. Start by logging your starting capital, then add the products you sell.',
    cashier: 'Your POS is ready. Start by making your first sale.',
  };

  function init() {
    if (!OnboardingCore.isFirstLogin()) return false;
    render();
    bindEvents();
    return true;
  }

  function render() {
    const role = OnboardingCore.getUserRole();
    const desc = PANEL_2_COPY[role] || PANEL_2_COPY.cashier;

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
        <div class="onb-step">
          <span class="onb-step-num">1</span>
          <span>Log starting capital</span>
        </div>
        <div class="onb-step">
          <span class="onb-step-num">2</span>
          <span>Add your products</span>
        </div>
        <div class="onb-step">
          <span class="onb-step-num">3</span>
          <span>Restock them</span>
        </div>
        <div class="onb-step">
          <span class="onb-step-num">4</span>
          <span>Make your first sale</span>
        </div>
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

  return { init };

})();
