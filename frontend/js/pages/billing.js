// frontend/js/pages/billing.js — Billing page (admin). Shows the current plan,
// status + trial countdown chips, and seat usage from /api/billing/state, with a
// clear per-plan CTA (Upgrade / Current / Included). Upgrade routes to the LS
// hosted checkout; Manage billing opens the LS customer portal.

(function () {
  if (typeof checkAuth === 'function') checkAuth();

  var RANK = { free: 0, plus: 1, pro: 2 };
  var planNowEl = document.getElementById('bill-plan-now');
  var chipsEl   = document.getElementById('bill-chips');
  var manageBtn = document.getElementById('bill-manage-btn');
  var noteEl    = document.getElementById('bill-note');

  function daysLeft(iso) {
    var e = new Date(iso).getTime();
    if (isNaN(e)) return 0;
    return Math.max(0, Math.ceil((e - Date.now()) / 86400000));
  }
  function cap(s)  { return s.charAt(0).toUpperCase() + s.slice(1); }
  function chip(t, k) { return '<span class="bill-chip' + (k ? ' bill-chip--' + k : '') + '">' + t + '</span>'; }

  function renderChips(d) {
    var statusMap = {
      active:   ['Active', 'ok'],
      trialing: ['Free trial', 'ok'],
      none:     ['No subscription', ''],
      past_due: ['Payment past due', 'bad'],
      canceled: ['Subscription ended', 'warn'],
    };
    var sm = statusMap[d.status] || [d.status, ''];
    var html = chip(sm[0], sm[1]);
    if (d.status === 'trialing' && d.trialEndsAt) {
      var n = daysLeft(d.trialEndsAt);
      html += chip(n + ' day' + (n === 1 ? '' : 's') + ' left', 'warn');
    }
    html += chip(d.seatsUsed + '/' + d.seatsTotal + ' cashier seat' + (d.seatsTotal === 1 ? '' : 's'), '');
    chipsEl.innerHTML = html;
  }

  function renderPlans(currentPlan) {
    var cur = RANK[currentPlan] != null ? RANK[currentPlan] : 0;
    ['free', 'plus', 'pro'].forEach(function (p) {
      var card  = document.getElementById('card-' + p);
      var badge = card.querySelector('[data-badge]');
      var foot  = card.querySelector('[data-foot]');
      var rank  = RANK[p];
      card.classList.toggle('is-current', p === currentPlan);
      if (p === currentPlan) {
        badge.style.display = 'inline-block';
        foot.innerHTML = '<span class="bill-current-note">✓ You’re on this plan</span>';
      } else if (rank > cur && p !== 'free') {
        badge.style.display = 'none';
        foot.innerHTML = '<button class="bill-btn" data-plan="' + p + '">Upgrade to ' + cap(p) + '</button>';
      } else {
        badge.style.display = 'none';
        foot.innerHTML = '<span class="bill-lower-note">Included in your plan</span>';
      }
    });
  }

  async function load() {
    var res = await getBillingState();
    if (!res || !res.success) { chipsEl.innerHTML = chip('Could not load billing', 'bad'); return; }
    var d = res.data;
    planNowEl.textContent = d.plan;
    renderChips(d);
    // Manage billing only makes sense once a real LS subscription exists.
    manageBtn.style.display = (d.status === 'active' || d.status === 'past_due' || d.status === 'canceled') ? '' : 'none';
    if (!d.configured) {
      noteEl.textContent = 'Billing isn’t connected yet — upgrades will work once Lemon Squeezy is configured on the server.';
    }
    renderPlans(d.plan);
  }

  document.querySelector('.bill-grid').addEventListener('click', async function (e) {
    var btn = e.target.closest('.bill-btn[data-plan]');
    if (!btn || btn.disabled) return;
    var plan = btn.getAttribute('data-plan');
    if (plan !== 'plus' && plan !== 'pro') return;
    var label = btn.textContent;
    btn.disabled = true; btn.textContent = 'Redirecting…';
    var res = await startCheckout(plan);
    if (res && res.success && res.url) {
      window.location.href = res.url;   // off to Lemon Squeezy hosted checkout
    } else {
      if (typeof showApiError === 'function') showApiError(res ? res.message : 'Could not start checkout.');
      btn.disabled = false; btn.textContent = label;
    }
  });

  manageBtn.addEventListener('click', async function () {
    manageBtn.disabled = true;
    var res = await openBillingPortal();
    if (res && res.success && res.url) {
      window.location.href = res.url;
    } else {
      if (typeof showApiError === 'function') showApiError(res ? res.message : 'Could not open the billing portal.');
      manageBtn.disabled = false;
    }
  });

  load();
})();
