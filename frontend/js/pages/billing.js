// frontend/js/pages/billing.js — Billing page (admin). Shows the current plan,
// billing state (active / grace / free) + seat usage from /api/billing/state,
// and three plan cards. Upgrade/Renew opens the shared GCash Upgrade modal
// (billing.modal.js); there is no hosted checkout/portal (manual GCash bridge).

(function () {
  if (typeof checkAuth === 'function') checkAuth();

  var RANK   = { free: 0, plus: 1, pro: 2 };
  var ORDER  = ['free', 'plus', 'pro'];
  var LABELS = { free: 'Free', plus: 'Plus', pro: 'Pro' };

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
    else                           html += chip('Free plan', '');

    // Active = a calm renewal date (no countdown). The grace day-count lives in
    // the countdown bar instead (see renderCountdown).
    if (d.state === 'active' && d.paidUntil) html += chip('Renews ' + shortDate(d.paidUntil), '');

    html += chip(d.seatsUsed + '/' + d.seatsTotal + ' cashier seat' + (d.seatsTotal === 1 ? '' : 's'), '');
    if (d.pendingClaim) html += chip('Payment under review', 'warn');
    chipsEl.innerHTML = html;
  }

  // State-aware countdown: a prominent bar for the one ACTIONABLE state — grace
  // (days before features pause, of 3). Active paid shows no countdown (just the
  // calm "Renews" chip); free shows nothing.
  var GRACE_TOTAL_DAYS = 3;
  function renderCountdown(d) {
    var el = document.getElementById('bill-countdown');
    if (!el) return;
    var textEl = document.getElementById('bill-cd-text');
    var daysEl = document.getElementById('bill-cd-days');
    var fillEl = document.getElementById('bill-cd-fill');
    el.classList.remove('is-warn', 'is-bad');

    function fillPct(remaining, total) {
      return Math.max(4, Math.min(100, Math.round((remaining / total) * 100)));
    }

    if (d.state === 'grace' && d.graceEndsAt) {
      var g = daysLeft(d.graceEndsAt);
      textEl.textContent = 'Features pause in';
      daysEl.textContent = g + ' day' + (g === 1 ? '' : 's');
      fillEl.style.width = fillPct(g, GRACE_TOTAL_DAYS) + '%';
      el.classList.add('is-bad');
      el.style.display = '';
    } else {
      el.style.display = 'none';
    }
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

  // Deep-link from a locked page / dashboard promo: ?plan=plus highlights and
  // scrolls to that card so the suggested plan isn't lost in the grid.
  function highlightSuggested() {
    var plan;
    try { plan = new URLSearchParams(window.location.search).get('plan'); } catch (_) { return; }
    if (!plan || !RANK.hasOwnProperty(plan)) return;
    var card = document.getElementById('card-' + plan);
    if (!card) return;
    card.classList.add('is-suggested');
    try { card.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (_) {}
  }

  async function load() {
    var res = await getBillingState();
    if (!res || !res.success) { chipsEl.innerHTML = chip('Could not load billing', 'bad'); return; }
    var d = res.data;
    planNowEl.textContent = LABELS[d.plan] || d.plan;
    renderChips(d);
    renderCountdown(d);
    renderPlans(d);
    if (!d.gcash || !d.gcash.qrUrl) {
      noteEl.textContent = 'Online payments aren’t set up yet — upgrades will be available once the GCash QR is configured.';
    } else {
      noteEl.textContent = 'Pay via GCash, then submit your reference number — we verify and activate (usually within a day). Prices in PHP, billed monthly.';
    }
    highlightSuggested();
  }

  document.querySelector('.bill-grid').addEventListener('click', function (e) {
    var btn = e.target.closest('.bill-btn[data-plan]');
    if (!btn) return;
    if (typeof BillingModal !== 'undefined') BillingModal.open(btn.getAttribute('data-plan'));
  });

  load();
})();
