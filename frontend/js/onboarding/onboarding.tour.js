const OnboardingTour = (() => {

  let steps        = [];
  let current      = 0;
  let page         = '';
  let _resizeTimer = null;
  let _scrollEl    = null;
  let _hiddenFab   = null;

  const MOBILE_MAX_WIDTH = 768;

  // ── Helpers ──

  function isMobileViewport() {
    return window.innerWidth <= MOBILE_MAX_WIDTH;
  }

  // Resolves the target selector, preferring `mobileTarget` on small viewports
  function resolveTarget(step) {
    if (isMobileViewport() && step.mobileTarget) {
      var mEl = document.querySelector(step.mobileTarget);
      if (mEl) return mEl;
    }
    return document.querySelector(step.target);
  }

  // Returns true if an element is in the DOM but not actually visible —
  // display:none, visibility:hidden, or rendered with 0×0 dimensions.
  // Without this guard, hidden targets (e.g. an admin-only button) leave
  // getBoundingClientRect at all-zero, which pins the spotlight to the
  // top-left corner instead of skipping the step cleanly.
  function isHidden(el) {
    if (!el) return true;
    var style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') return true;
    var rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return true;
    return false;
  }

  // ── DOM injection ──

  function injectDOM() {
    if (document.getElementById('onb-tour-overlay')) return;

    document.body.insertAdjacentHTML('beforeend',
      '<div id="onb-tour-overlay" class="onb-tour-overlay">' +
        '<svg id="onb-spotlight-svg" xmlns="http://www.w3.org/2000/svg"' +
            ' aria-hidden="true"' +
            ' style="position:absolute;top:0;left:0;width:100%;height:100%">' +
          '<defs>' +
            '<mask id="onb-spotlight-mask">' +
              '<rect width="100%" height="100%" fill="white"/>' +
              '<rect id="onb-spotlight-hole" rx="8" fill="black"' +
                   ' x="-200" y="-200" width="0" height="0"/>' +
            '</mask>' +
          '</defs>' +
          '<rect width="100%" height="100%"' +
               ' fill="rgba(0,0,0,0.55)"' +
               ' mask="url(#onb-spotlight-mask)"/>' +
        '</svg>' +
        '<div id="onb-tooltip" class="onb-tooltip" style="visibility:hidden"' +
            ' role="dialog" aria-modal="true"' +
            ' aria-labelledby="onb-tip-title" aria-describedby="onb-tip-body"' +
            ' aria-live="polite">' +
          '<div class="onb-tooltip-title" id="onb-tip-title"></div>' +
          '<div class="onb-tooltip-body"  id="onb-tip-body"></div>' +
          '<div class="onb-tooltip-dots" id="onb-tip-dots"></div>' +
          '<div class="onb-tooltip-footer">' +
            '<button type="button" class="onb-btn-ghost"   id="onb-tour-skip">Skip Tour</button>' +
            '<button type="button" class="onb-btn-primary" id="onb-tour-next">Next →</button>' +
          '</div>' +
        '</div>' +
      '</div>'
    );

    document.getElementById('onb-tour-skip').addEventListener('click', skip);
    document.getElementById('onb-tour-next').addEventListener('click', next);
    window.addEventListener('resize', _onResize);
    document.addEventListener('keydown', _onKey);
  }

  // ── Keyboard support ──

  function _onKey(e) {
    if (!document.getElementById('onb-tour-overlay')) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      skip();
    } else if (e.key === 'Enter' || e.key === ' ') {
      // Only fire next() when NO specific button is focused — otherwise let
      // the focused button handle Enter/Space natively via its click event,
      // so Skip doesn't accidentally trigger next() and vice versa.
      var active = document.activeElement;
      if (!active || active === document.body) {
        e.preventDefault();
        next();
      }
    }
  }

  // ── Resize handler — recalculates spotlight + tooltip for current step ──

  function _onResize() {
    clearTimeout(_resizeTimer);
    _resizeTimer = setTimeout(function () {
      if (document.getElementById('onb-tour-overlay')) {
        showStep(current);
      }
    }, 150);
  }

  // ── Step rendering ──

  function showStep(index) {
    var step = steps[index];
    if (!step) { finish(); return; }

    var el = resolveTarget(step);
    if (!el || isHidden(el)) { next(); return; }

    // Scroll first while overflow is unlocked, then lock. Prevents iOS Safari
    // and some Android browsers from refusing programmatic scroll when the
    // scroll container has overflow:hidden.
    //
    // `block: 'nearest'` keeps already-visible targets in place instead of
    // forcing them to viewport center — that prevented top-of-page targets
    // (e.g. the finance balance card) from being pushed down with the
    // tooltip stranded in the lower half of the page.
    if (_scrollEl) _scrollEl.style.overflow = '';
    el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    setTimeout(function () {
      if (_scrollEl) _scrollEl.style.overflow = 'hidden';
      var rect = el.getBoundingClientRect();
      updateSpotlight(rect);
      updateTooltip(step, index, rect);
      renderDots(index);
      var nextBtn = document.getElementById('onb-tour-next');
      if (nextBtn) nextBtn.focus();
    }, 350);
  }

  function renderDots(index) {
    var el = document.getElementById('onb-tip-dots');
    if (!el) return;
    var html = '';
    for (var i = 0; i < steps.length; i++) {
      html += '<span class="onb-tip-dot' + (i === index ? ' onb-tip-dot--active' : '') + '"></span>';
    }
    el.innerHTML = html;
  }

  function updateSpotlight(rect) {
    var hole = document.getElementById('onb-spotlight-hole');
    if (!hole) return;

    var PAD = 8;
    var x   = Math.round(rect.left   - PAD);
    var y   = Math.round(rect.top    - PAD);
    var w   = Math.max(44, Math.round(rect.width  + PAD * 2));
    var h   = Math.max(44, Math.round(rect.height + PAD * 2));

    hole.setAttribute('x',      x);
    hole.setAttribute('y',      y);
    hole.setAttribute('width',  w);
    hole.setAttribute('height', h);
  }

  function resolvePosition(requestedPos, rect) {
    var pos  = requestedPos || 'bottom';
    var GAP  = 12;
    var PAD  = 8;
    var maxW = Math.min(320, window.innerWidth * 0.9);
    var THRESHOLD = 180; // approx tooltip footprint (title + body + dots + buttons)

    // Vertical: only flip top↔bottom when the requested side is too cramped
    // AND the opposite side has strictly more room. The old logic used two
    // independent ifs, so when both sides were cramped the second one always
    // won — which placed the tooltip on the SMALLER side and let it clamp
    // into the spotlight (the "top:8px over the chart card" bug on small
    // viewports).
    if (pos === 'top' || pos === 'bottom') {
      var roomAbove = rect.top;
      var roomBelow = window.innerHeight - rect.bottom;

      if (pos === 'top' && roomAbove < THRESHOLD && roomBelow > roomAbove) {
        pos = 'bottom';
      } else if (pos === 'bottom' && roomBelow < THRESHOLD && roomAbove > roomBelow) {
        pos = 'top';
      }
    }

    // Horizontal: fall back to bottom when there isn't enough room left/right.
    if (pos === 'right' && rect.right + GAP + maxW > window.innerWidth - PAD) {
      pos = 'bottom';
    } else if (pos === 'left' && rect.left - GAP - maxW < PAD) {
      pos = 'bottom';
    }

    return pos;
  }

  function updateTooltip(step, index, rect) {
    // Set content first so offsetHeight reflects actual rendered height
    document.getElementById('onb-tip-title').textContent    = step.title;
    document.getElementById('onb-tip-body').textContent     = step.body;

    var nextBtn = document.getElementById('onb-tour-next');
    nextBtn.textContent = (index === steps.length - 1) ? 'Done' : 'Next →';

    var tooltip  = document.getElementById('onb-tooltip');
    var GAP      = 12;
    var PAD      = 8;
    var maxW     = Math.min(320, window.innerWidth * 0.9);
    var pos      = resolvePosition(step.position, rect);
    var cx       = rect.left + rect.width  / 2;
    var cy       = rect.top  + rect.height / 2;
    var leftEdge = Math.max(PAD, Math.min(cx - maxW / 2, window.innerWidth - maxW - PAD));

    // Reset all position properties, then set width so offsetHeight is accurate
    tooltip.style.top       = '';
    tooltip.style.left      = '';
    tooltip.style.bottom    = '';
    tooltip.style.right     = '';
    tooltip.style.transform = '';
    tooltip.style.maxWidth  = maxW + 'px';

    var th = tooltip.offsetHeight; // read after content + width settled

    switch (pos) {
      case 'bottom':
        tooltip.style.top  = Math.min(rect.bottom + GAP, window.innerHeight - th - PAD) + 'px';
        tooltip.style.left = leftEdge + 'px';
        break;

      case 'top':
        tooltip.style.top  = Math.max(PAD, rect.top - GAP - th) + 'px';
        tooltip.style.left = leftEdge + 'px';
        break;

      case 'right':
        tooltip.style.left = (rect.right + GAP) + 'px';
        tooltip.style.top  = Math.max(PAD, Math.min(cy - th / 2, window.innerHeight - th - PAD)) + 'px';
        break;

      case 'left':
        tooltip.style.right = (window.innerWidth - rect.left + GAP) + 'px';
        tooltip.style.top   = Math.max(PAD, Math.min(cy - th / 2, window.innerHeight - th - PAD)) + 'px';
        break;
    }

    // Reveal at the correct position and replay the fade-up animation.
    // Setting animation:none, forcing reflow, then clearing lets the CSS
    // class animation restart from the correct coords instead of the
    // unpositioned default (which caused the top-of-page flash on step 1).
    tooltip.style.animation = 'none';
    void tooltip.offsetHeight;
    tooltip.style.animation  = '';
    tooltip.style.visibility = 'visible';
  }

  // ── Flow control ──

  function next() {
    if (current >= steps.length - 1) {
      celebrateThenFinish();
      return;
    }
    current++;
    showStep(current);
  }

  function skip() {
    finish();
  }

  function celebrateThenFinish() {
    var tooltip = document.getElementById('onb-tooltip');
    var hole    = document.getElementById('onb-spotlight-hole');
    if (!tooltip) { finish(); return; }

    // Collapse the spotlight hole so the overlay dims uniformly
    if (hole) {
      hole.setAttribute('x', '-200');
      hole.setAttribute('y', '-200');
      hole.setAttribute('width', '0');
      hole.setAttribute('height', '0');
    }

    // Clear all inline positioning from the last step. The CSS class
    // (.onb-tooltip--celebrate) owns centering via top/left 50% +
    // the onbCelebrateIn animation which ends at translate(-50%, -50%).
    tooltip.style.top       = '';
    tooltip.style.right     = '';
    tooltip.style.bottom    = '';
    tooltip.style.left      = '';
    tooltip.style.transform = '';
    tooltip.style.maxWidth  = '';

    // Force a clean animation restart so the celebrate animation
    // definitely runs from time 0 (avoids browser quirks where merely
    // swapping classes with different animation-name doesn't always
    // restart the animation).
    tooltip.style.animation = 'none';
    void tooltip.offsetHeight;
    tooltip.classList.add('onb-tooltip--celebrate');
    tooltip.style.animation = '';

    tooltip.innerHTML =
      '<div class="onb-tour-celebrate">' +
        '<svg viewBox="0 0 24 24" width="48" height="48" aria-hidden="true">' +
          '<circle cx="12" cy="12" r="12" fill="var(--color-primary)"/>' +
          '<path d="M7 12l4 4 6-7" stroke="#fff" stroke-width="2"' +
            ' stroke-linecap="round" stroke-linejoin="round" fill="none"/>' +
        '</svg>' +
        '<p>Nice! You finished the tour.</p>' +
      '</div>';

    setTimeout(finish, 1400);
  }

  function finish() {
    OnboardingCore.markTourSeen(page);
    window.removeEventListener('resize', _onResize);
    document.removeEventListener('keydown', _onKey);
    if (_scrollEl) { _scrollEl.style.overflow = ''; _scrollEl = null; }
    document.body.classList.remove('onb-tour-active');
    if (_hiddenFab) { _hiddenFab.style.display = ''; _hiddenFab = null; }
    var overlay = document.getElementById('onb-tour-overlay');
    if (overlay) overlay.remove();
  }

  // ── Public ──

  function _doStart(pageKey, stepArray) {
    page      = pageKey;
    steps     = stepArray;
    current   = 0;
    _scrollEl = document.querySelector('.page-body') || document.body;
    // Hide the FAB so it can't be tapped through the overlay or distract
    var fab = document.getElementById('new-sale-fab');
    if (fab) { _hiddenFab = fab; fab.style.display = 'none'; }
    document.body.classList.add('onb-tour-active');
    injectDOM();
    showStep(0);
  }

  function start(pageKey, stepArray) {
    if (OnboardingCore.isTourSeen(pageKey)) return;
    if (!stepArray || !stepArray.length) return;

    // If welcome modal is open, defer until it's removed from the DOM
    if (document.getElementById('onb-welcome-overlay')) {
      var observer = new MutationObserver(function (_, obs) {
        if (!document.getElementById('onb-welcome-overlay')) {
          obs.disconnect();
          _doStart(pageKey, stepArray);
        }
      });
      observer.observe(document.body, { childList: true });
      return;
    }

    _doStart(pageKey, stepArray);
  }

  return { start: start };

})();
