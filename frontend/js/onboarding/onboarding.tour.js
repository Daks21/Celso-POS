const OnboardingTour = (() => {

  let steps        = [];
  let current      = 0;
  let page         = '';
  let _resizeTimer = null;
  let _scrollEl    = null;

  // ── DOM injection ──

  function injectDOM() {
    if (document.getElementById('onb-tour-overlay')) return;

    document.body.insertAdjacentHTML('beforeend',
      '<div id="onb-tour-overlay" class="onb-tour-overlay">' +
        '<svg id="onb-spotlight-svg" xmlns="http://www.w3.org/2000/svg"' +
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
        '<div id="onb-tooltip" class="onb-tooltip">' +
          '<div class="onb-tooltip-title" id="onb-tip-title"></div>' +
          '<div class="onb-tooltip-body"  id="onb-tip-body"></div>' +
          '<div class="onb-tooltip-footer">' +
            '<button class="onb-btn-ghost"   id="onb-tour-skip">Skip Tour</button>' +
            '<button class="onb-btn-primary" id="onb-tour-next">Next →</button>' +
          '</div>' +
          '<div class="onb-tooltip-step-counter" id="onb-step-counter"></div>' +
        '</div>' +
      '</div>'
    );

    document.getElementById('onb-tour-skip').addEventListener('click', skip);
    document.getElementById('onb-tour-next').addEventListener('click', next);
    window.addEventListener('resize', _onResize);
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

    var el = document.querySelector(step.target);
    if (!el) { next(); return; }

    el.scrollIntoView({ behavior: 'smooth', block: 'center' });

    setTimeout(function () {
      var rect = el.getBoundingClientRect();
      updateSpotlight(rect);
      updateTooltip(step, index, rect);
    }, 350);
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
    var maxW = Math.min(320, window.innerWidth * 0.9);

    // 180px threshold accounts for typical tooltip rendered height (~160px) + gap
    if (rect.top    < 180)                       pos = 'bottom';
    if (rect.bottom > window.innerHeight - 180)  pos = 'top';

    if (pos === 'right' && rect.right + GAP + maxW > window.innerWidth - 8)  pos = 'bottom';
    if (pos === 'left'  && rect.left  - GAP - maxW < 8)                      pos = 'bottom';

    return pos;
  }

  function updateTooltip(step, index, rect) {
    // Set content first so offsetHeight reflects actual rendered height
    document.getElementById('onb-tip-title').textContent    = step.title;
    document.getElementById('onb-tip-body').textContent     = step.body;
    document.getElementById('onb-step-counter').textContent =
      'Step ' + (index + 1) + ' of ' + steps.length;

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
  }

  // ── Flow control ──

  function next() {
    current++;
    if (current >= steps.length) {
      finish();
    } else {
      showStep(current);
    }
  }

  function skip() {
    finish();
  }

  function finish() {
    OnboardingCore.markTourSeen(page);
    window.removeEventListener('resize', _onResize);
    if (_scrollEl) { _scrollEl.style.overflow = ''; _scrollEl = null; }
    var overlay = document.getElementById('onb-tour-overlay');
    if (overlay) overlay.remove();
  }

  // ── Public ──

  function _doStart(pageKey, stepArray) {
    page      = pageKey;
    steps     = stepArray;
    current   = 0;
    _scrollEl = document.querySelector('.page-body') || document.body;
    _scrollEl.style.overflow = 'hidden';
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
