// frontend/js/pages/billing.js — Billing page (admin). Shows the current plan,
// billing state (active / trial / grace) + seat usage from /api/billing/state,
// and four plan cards. Upgrade/Renew opens the shared GCash Upgrade modal
// (billing.modal.js); there is no hosted checkout/portal (manual GCash bridge).

(function () {
  if (typeof checkAuth === 'function') checkAuth();

  var RANK   = { free: 0, basic: 1, plus: 2, pro: 3 };
  var ORDER  = ['free', 'basic', 'plus', 'pro'];
  var LABELS = { free: 'Free', basic: 'Basic', plus: 'Plus', pro: 'Pro' };

  var planNowEl = document.getElementById('bill-plan-now');
  var chipsEl   = document.getElementById('bill-chips');
  var noteEl    = document.getElementById('bill-note');

  function peso(n)    { return '₱' + Number(n || 0).toLocaleString('en-PH'); }
  function daysLeft(iso) {
    var e = new Date(iso).getTime();
    if (isNaN(e)) return 0;
    return Math.max(0, Math.ceil((e - Date.now()) / 86400000));
  }
  function shortDate(iso) {
    var d = new Date(iso);
    return isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
  }
  function chip(t, k) { return '<span class="bill-chip' + (k ? ' bill-chip--' + k : '') + '">' + t + '</span>'; }

  function renderChips(d) {
    var html = '';
    if (d.state === 'active')      html += chip('Active', 'ok');
    else if (d.state === 'grace')  html += chip('Payment due', 'bad');
    else if (d.state === 'trial')  html += chip('Free trial', 'ok');
    else                           html += chip('Free plan', '');

    if (d.state === 'trial' && d.trialEndsAt) {
      var n = daysLeft(d.trialEndsAt);
      html += chip(n + ' day' + (n === 1 ? '' : 's') + ' left', 'warn');
    } else if (d.state === 'grace' && d.graceEndsAt) {
      var g = daysLeft(d.graceEndsAt);
      html += chip(g + ' day' + (g === 1 ? '' : 's') + ' grace', 'warn');
    } else if (d.state === 'active' && d.paidUntil) {
      html += chip('Renews ' + shortDate(d.paidUntil), '');
    }

    html += chip(d.seatsUsed + '/' + d.seatsTotal + ' cashier seat' + (d.seatsTotal === 1 ? '' : 's'), '');
    if (d.pendingClaim) html += chip('Payment under review', 'warn');
    chipsEl.innerHTML = html;
  }

  function renderPlans(d) {
    var cur = RANK[d.plan] != null ? RANK[d.plan] : 0;
    ORDER.forEach(function (p) {
      var card  = document.getElementById('card-' + p);
      if (!card) return;
      var badge = card.querySelector('[data-badge]');
      var foot  = card.querySelector('[data-foot]');
      var price = card.querySelector('[data-price]');

      if (price) {
        var amt = p === 'free' ? 0 : ((d.prices && d.prices[p]) || 0);
        price.innerHTML = peso(amt) + '<span>/mo</span>';
      }

      card.classList.toggle('is-current', p === d.plan);

      if (p === d.plan) {
        badge.style.display = 'inline-block';
        if (d.state === 'grace' && p !== 'free') {
          foot.innerHTML = '<button class="bill-btn" data-plan="' + p + '">Renew ' + LABELS[p] + '</button>';
        } else {
          foot.innerHTML = '<span class="bill-current-note">✓ You’re on this plan</span>';
        }
      } else if (RANK[p] > cur && p !== 'free') {
        badge.style.display = 'none';
        foot.innerHTML = '<button class="bill-btn" data-plan="' + p + '">Upgrade to ' + LABELS[p] + '</button>';
      } else {
        badge.style.display = 'none';
        foot.innerHTML = '<span class="bill-lower-note">' + (p === 'free' ? 'Always free' : 'Included') + '</span>';
      }
    });
  }

  async function load() {
    var res = await getBillingState();
    if (!res || !res.success) { chipsEl.innerHTML = chip('Could not load billing', 'bad'); return; }
    var d = res.data;
    planNowEl.textContent = LABELS[d.plan] || d.plan;
    renderChips(d);
    renderPlans(d);
    if (!d.gcash || !d.gcash.qrUrl) {
      noteEl.textContent = 'Online payments aren’t set up yet — upgrades will be available once the GCash QR is configured.';
    } else {
      noteEl.textContent = 'Pay via GCash, then submit your reference number — we verify and activate (usually within a day). Prices in PHP, billed monthly.';
    }
  }

  document.querySelector('.bill-grid').addEventListener('click', function (e) {
    var btn = e.target.closest('.bill-btn[data-plan]');
    if (!btn) return;
    if (typeof BillingModal !== 'undefined') BillingModal.open(btn.getAttribute('data-plan'));
  });

  load();
})();
