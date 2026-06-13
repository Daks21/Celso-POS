// frontend/js/components/billing.modal.js — GCash payment modal (Phase 6.6).
//
// Payment-only. Plan SELECTION lives on the Billing page (billing.html); every
// "choose a plan" entry point (locked-page overlay, dashboard promo, deep-link
// fallback) routes there. The Billing page's plan buttons are the only thing
// that opens this modal, and always with a concrete plan — so the modal never
// renders a plan list. It fetches /api/billing/state and walks the owner
// through: scan the GCash QR + pay -> paste the reference number. Verify-first:
// submitting records a `pending` claim (POST /billing/claim); the plan only
// turns on after the operator approves it. If a claim is already pending, the
// modal opens straight into the "under review" state.
//
// UI-only: the server enforces everything. All dynamic/operator-set strings are
// rendered with textContent / <img src> (never interpolated into HTML).

window.BillingModal = (function () {
  var LABELS = { free: 'Free', plus: 'Plus', pro: 'Pro' };

  var _built = false;
  var _state = null;
  var _plan = null;
  var _editing = false;   // true when the pay form is correcting an existing pending claim

  function peso(n) { return '₱' + Number(n || 0).toLocaleString('en-PH'); }

  function build() {
    if (_built) return;
    var overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = 'bm-overlay';
    overlay.innerHTML =
      '<div class="modal-card bm-card">' +
        '<div class="modal-header"><h2 id="bm-title">Complete your upgrade</h2>' +
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

  // Always called with the plan the owner already picked on the Billing page.
  // Without a valid paid plan there's nothing to pay for, so send them to the
  // Billing page to choose — the modal itself never shows a chooser.
  async function open(plan) {
    if (!plan || !LABELS[plan] || plan === 'free') {
      window.location.href = 'billing.html';
      return;
    }
    _plan = plan;
    _editing = false;
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
    renderPay();
  }

  // prefillRef: pre-populate the reference field (used when editing a pending claim).
  function renderPay(prefillRef) {
    document.getElementById('bm-title').textContent = _editing
      ? 'Update your payment reference'
      : 'Pay for ' + (LABELS[_plan] || _plan);
    var body = document.getElementById('bm-body');
    var g = _state.gcash || {};
    var amount = (_state.prices && _state.prices[_plan]) || 0;

    if (!g.qrUrl) {
      body.innerHTML = '<div class="bm-pay"><p class="bm-err">Online payments aren’t set ' +
        'up yet. Please contact support to upgrade.</p></div>';
      return;
    }

    body.innerHTML =
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
        '<button type="button" class="bm-submit" id="bm-submit">' +
          (_editing ? 'Update reference' : 'I’ve paid — submit for review') + '</button>' +
        '<p class="bm-note">We’ll verify your payment and activate ' + LABELS[_plan] +
          ' (usually within a day). You’ll keep your current access until then.</p>' +
      '</div>';

    // textContent for dynamic/operator-set values.
    body.querySelector('#bm-qrimg').src = g.qrUrl;
    body.querySelector('#bm-amount').textContent = peso(amount);
    body.querySelector('#bm-gname').textContent = g.name || '';
    body.querySelector('#bm-gnumber').textContent = g.number || '';
    if (prefillRef) body.querySelector('#bm-ref').value = prefillRef;

    body.querySelector('#bm-submit').addEventListener('click', submit);
    body.querySelector('#bm-ref').addEventListener('keydown', function (e) {
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
    var wasEditing = _editing;
    btn.disabled = true; btn.textContent = wasEditing ? 'Updating…' : 'Submitting…';
    var res = wasEditing ? await editClaim(_plan, ref) : await submitClaim(_plan, ref);
    if (res && res.success) {
      _editing = false;
      renderPending({ plan: _plan, amountPhp: (_state.prices && _state.prices[_plan]) || 0, gcashRef: ref });
    } else {
      errEl.textContent = (res && res.message) || 'Could not submit. Please try again.';
      btn.disabled = false;
      btn.textContent = wasEditing ? 'Update reference' : 'I’ve paid — submit for review';
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
        // Until the operator reviews it, the owner can still fix a wrong reference
        // or withdraw the request entirely.
        '<p class="bm-note">Wrong reference number? You can still correct it.</p>' +
        '<div class="bm-pending-actions">' +
          '<button type="button" class="bm-linkbtn" id="bm-edit">Edit reference</button>' +
          '<button type="button" class="bm-linkbtn bm-linkbtn--danger" id="bm-cancel">Cancel request</button>' +
        '</div>' +
        '<button type="button" class="bm-submit" id="bm-done" style="max-width:160px;margin:8px auto 0">Done</button>' +
      '</div>';
    body.querySelector('#bm-pp').textContent = LABELS[claim.plan] || claim.plan;
    body.querySelector('#bm-pr').textContent = claim.gcashRef || '';
    body.querySelector('#bm-pa').textContent = claim.amountPhp ? ('  ·  ' + peso(claim.amountPhp)) : '';
    body.querySelector('#bm-done').addEventListener('click', close);

    body.querySelector('#bm-edit').addEventListener('click', function () {
      _editing = true;
      _plan = claim.plan;            // keep the same plan; the owner is just fixing the ref
      renderPay(claim.gcashRef);
    });

    body.querySelector('#bm-cancel').addEventListener('click', async function () {
      if (!window.confirm('Cancel this payment request? You can submit a new one afterwards.')) return;
      var cancelBtn = document.getElementById('bm-cancel');
      cancelBtn.disabled = true; cancelBtn.textContent = 'Cancelling…';
      var res = await cancelClaim();
      if (res && res.success) {
        _editing = false;
        renderPay('');               // back to a fresh pay form so they can resubmit
      } else {
        cancelBtn.disabled = false; cancelBtn.textContent = 'Cancel request';
        window.alert((res && res.message) || 'Could not cancel. Please try again.');
      }
    });
  }

  return { open: open, close: close };
})();
