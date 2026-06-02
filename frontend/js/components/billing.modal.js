// frontend/js/components/billing.modal.js — shared Upgrade modal (Phase 6.6).
//
// Opened from the Billing page AND from locked nav links on any page, so it is
// self-contained: it injects its own overlay + scoped styles once, fetches
// /api/billing/state on open, and walks the owner through:
//   choose a paid plan -> scan the GCash QR + pay -> paste the reference number.
// Verify-first: submitting records a `pending` claim (POST /billing/claim); the
// plan only turns on after the operator approves it. If a claim is already
// pending, the modal opens straight into the "under review" state.
//
// UI-only: the server enforces everything. All dynamic/operator-set strings are
// rendered with textContent / <img src> (never interpolated into HTML).

window.BillingModal = (function () {
  var RANK  = { free: 0, basic: 1, plus: 2, pro: 3 };
  var ORDER = ['basic', 'plus', 'pro'];
  var LABELS = { free: 'Free', basic: 'Basic', plus: 'Plus', pro: 'Pro' };
  var FEATURES = {
    basic: ['Finance & cashflow', 'Analytics + charts', 'No cashier seats'],
    plus:  ['Everything in Basic', 'Advanced Analytics', 'Os AI Assistant', '1 cashier seat'],
    pro:   ['Everything in Plus', '2 cashier seats'],
  };

  var _built = false;
  var _state = null;
  var _selected = null;

  function peso(n) { return '₱' + Number(n || 0).toLocaleString('en-PH'); }

  function injectStyles() {
    if (document.getElementById('bm-styles')) return;
    var css = ''
      + '.bm-card{max-width:560px}'
      + '.bm-plans{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:18px}'
      + '.bm-plan{border:1px solid var(--color-border);border-radius:var(--radius-md);padding:12px;cursor:pointer;background:var(--color-background);text-align:left}'
      + '.bm-plan:disabled{opacity:.5;cursor:default}'
      + '.bm-plan.is-sel{border-color:var(--color-primary);box-shadow:0 0 0 1px var(--color-primary)}'
      + '.bm-plan h4{margin:0;font-size:14px}'
      + '.bm-plan .bm-price{font-size:18px;font-weight:700;margin:4px 0}'
      + '.bm-plan .bm-price span{font-size:11px;font-weight:500;color:var(--color-text-muted)}'
      + '.bm-plan ul{list-style:none;padding:0;margin:6px 0 0;font-size:11.5px;color:var(--color-text-muted)}'
      + '.bm-plan li{padding:1px 0}'
      + '.bm-plan .bm-cur{display:inline-block;font-size:10px;font-weight:700;text-transform:uppercase;color:var(--color-primary)}'
      + '.bm-pay{border-top:1px solid var(--color-border);padding-top:16px}'
      + '.bm-qr{display:flex;gap:16px;align-items:center;flex-wrap:wrap}'
      + '.bm-qr img{width:160px;height:160px;object-fit:contain;border:1px solid var(--color-border);border-radius:var(--radius-md);background:#fff}'
      + '.bm-paymeta{font-size:13px;color:var(--color-text)}'
      + '.bm-paymeta b{display:block;font-size:20px}'
      + '.bm-steps{font-size:13px;color:var(--color-text-muted);margin:14px 0 8px;padding-left:18px}'
      + '.bm-input{width:100%;padding:11px 12px;border:1px solid var(--color-border);border-radius:var(--radius-sm);font-family:inherit;font-size:15px;background:var(--color-surface);color:var(--color-text)}'
      + '.bm-submit{width:100%;margin-top:12px;padding:12px;border:none;border-radius:var(--radius-sm);background:var(--color-primary);color:#fff;font-family:inherit;font-size:15px;font-weight:600;cursor:pointer}'
      + '.bm-submit:disabled{opacity:.6;cursor:default}'
      + '.bm-err{color:var(--color-error);font-size:13px;margin-top:8px;min-height:1em}'
      + '.bm-note{font-size:12px;color:var(--color-text-muted);margin-top:14px;text-align:center}'
      + '.bm-pending{text-align:center;padding:8px 0}'
      + '.bm-pending .bm-check{font-size:40px;color:var(--color-primary)}'
      + '@media(max-width:560px){.bm-plans{grid-template-columns:1fr}}';
    var s = document.createElement('style');
    s.id = 'bm-styles';
    s.textContent = css;
    document.head.appendChild(s);
  }

  function build() {
    if (_built) return;
    injectStyles();
    var overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = 'bm-overlay';
    overlay.innerHTML =
      '<div class="modal-card bm-card">' +
        '<div class="modal-header"><h2 id="bm-title">Upgrade your plan</h2>' +
        '<button type="button" class="modal-close-button" id="bm-close">&times;</button></div>' +
        '<div id="bm-body"></div>' +
      '</div>';
    document.body.appendChild(overlay);

    overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
    overlay.querySelector('#bm-close').addEventListener('click', close);
    _built = true;
  }

  function close() {
    var o = document.getElementById('bm-overlay');
    if (o) o.style.display = 'none';
  }

  async function open(planHint) {
    build();
    var overlay = document.getElementById('bm-overlay');
    var body = document.getElementById('bm-body');
    overlay.style.display = 'flex';
    body.innerHTML = '<p class="bm-note">Loading…</p>';

    var res = await getBillingState();
    if (!res || !res.success) {
      body.innerHTML = '<p class="bm-err">Could not load billing. Please try again.</p>';
      return;
    }
    _state = res.data;
    if (_state.pendingClaim) { renderPending(_state.pendingClaim); return; }

    // Default selection: the hint (if it's an upgrade) else the next tier up.
    var cur = RANK[_state.plan] != null ? RANK[_state.plan] : 0;
    if (planHint && RANK[planHint] > cur) _selected = planHint;
    else _selected = ORDER.find(function (p) { return RANK[p] > cur; }) || 'pro';
    renderChooser();
  }

  function renderChooser() {
    document.getElementById('bm-title').textContent = 'Upgrade your plan';
    var cur = RANK[_state.plan] != null ? RANK[_state.plan] : 0;
    var body = document.getElementById('bm-body');

    var cards = ORDER.map(function (p) {
      var isCurrent = p === _state.plan;
      var isDowngrade = RANK[p] < cur;
      var sel = p === _selected ? ' is-sel' : '';
      var price = (_state.prices && _state.prices[p]) || 0;
      var feats = FEATURES[p].map(function (f) { return '<li>' + f + '</li>'; }).join('');
      return '<button type="button" class="bm-plan' + sel + '" data-plan="' + p + '"' +
        ((isCurrent || isDowngrade) ? ' disabled' : '') + '>' +
        '<h4>' + LABELS[p] + (isCurrent ? ' <span class="bm-cur">Current</span>' : '') + '</h4>' +
        '<div class="bm-price">' + peso(price) + '<span>/mo</span></div>' +
        '<ul>' + feats + '</ul></button>';
    }).join('');

    body.innerHTML =
      '<div class="bm-plans">' + cards + '</div>' +
      '<div id="bm-payslot"></div>';

    body.querySelector('.bm-plans').addEventListener('click', function (e) {
      var btn = e.target.closest('.bm-plan[data-plan]');
      if (!btn || btn.disabled) return;
      _selected = btn.getAttribute('data-plan');
      renderChooser();
    });

    renderPay();
  }

  function renderPay() {
    var slot = document.getElementById('bm-payslot');
    var g = _state.gcash || {};
    var amount = (_state.prices && _state.prices[_selected]) || 0;

    if (!g.qrUrl) {
      slot.innerHTML = '<div class="bm-pay"><p class="bm-err">Online payments aren’t set ' +
        'up yet. Please contact support to upgrade.</p></div>';
      return;
    }

    slot.innerHTML =
      '<div class="bm-pay">' +
        '<div class="bm-qr">' +
          '<img id="bm-qrimg" alt="GCash QR code">' +
          '<div class="bm-paymeta">Pay this amount via GCash:' +
            '<b id="bm-amount"></b>' +
            '<span id="bm-gname"></span><br><span id="bm-gnumber"></span>' +
          '</div>' +
        '</div>' +
        '<ol class="bm-steps">' +
          '<li>Scan the QR in your GCash app and pay the exact amount.</li>' +
          '<li>Copy the GCash <b>reference number</b> from your receipt.</li>' +
          '<li>Paste it below and submit.</li>' +
        '</ol>' +
        '<input class="bm-input" id="bm-ref" inputmode="numeric" autocomplete="off" ' +
          'placeholder="GCash reference number">' +
        '<div class="bm-err" id="bm-err"></div>' +
        '<button type="button" class="bm-submit" id="bm-submit">I’ve paid — submit for review</button>' +
        '<p class="bm-note">We’ll verify your payment and activate ' + LABELS[_selected] +
          ' (usually within a day). You’ll keep your current access until then.</p>' +
      '</div>';

    // textContent for dynamic/operator-set values.
    slot.querySelector('#bm-qrimg').src = g.qrUrl;
    slot.querySelector('#bm-amount').textContent = peso(amount);
    slot.querySelector('#bm-gname').textContent = g.name || '';
    slot.querySelector('#bm-gnumber').textContent = g.number || '';

    slot.querySelector('#bm-submit').addEventListener('click', submit);
    slot.querySelector('#bm-ref').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') submit();
    });
  }

  async function submit() {
    var refEl = document.getElementById('bm-ref');
    var errEl = document.getElementById('bm-err');
    var btn = document.getElementById('bm-submit');
    var ref = (refEl.value || '').trim();
    errEl.textContent = '';
    if (!/^\d{6,20}$/.test(ref)) {
      errEl.textContent = 'Enter the numeric reference number from your GCash receipt.';
      return;
    }
    btn.disabled = true; btn.textContent = 'Submitting…';
    var res = await submitClaim(_selected, ref);
    if (res && res.success) {
      renderPending({ plan: _selected, amountPhp: (_state.prices && _state.prices[_selected]) || 0, gcashRef: ref });
    } else {
      errEl.textContent = (res && res.message) || 'Could not submit. Please try again.';
      btn.disabled = false; btn.textContent = 'I’ve paid — submit for review';
    }
  }

  function renderPending(claim) {
    document.getElementById('bm-title').textContent = 'Payment under review';
    var body = document.getElementById('bm-body');
    body.innerHTML =
      '<div class="bm-pending">' +
        '<div class="bm-check">✓</div>' +
        '<p>Thanks! Your payment for <b id="bm-pp"></b> is being verified. ' +
        'We’ll activate it shortly — you’ll keep your current access in the meantime.</p>' +
        '<p class="bm-note">Reference <span id="bm-pr"></span>' +
          '<span id="bm-pa"></span></p>' +
        '<button type="button" class="bm-submit" id="bm-done" style="max-width:160px;margin:8px auto 0">Done</button>' +
      '</div>';
    body.querySelector('#bm-pp').textContent = LABELS[claim.plan] || claim.plan;
    body.querySelector('#bm-pr').textContent = claim.gcashRef || '';
    body.querySelector('#bm-pa').textContent = claim.amountPhp ? ('  ·  ' + peso(claim.amountPhp)) : '';
    body.querySelector('#bm-done').addEventListener('click', close);
  }

  return { open: open, close: close };
})();
