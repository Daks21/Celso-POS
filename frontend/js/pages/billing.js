// frontend/js/pages/billing.js — Billing page (admin). Shows the current plan,
// trial countdown, and seat usage from /api/billing/state, and routes Upgrade /
// Manage actions to the Lemon Squeezy hosted checkout / customer portal. The
// server resolves the real plan; LS is the source of truth via webhooks.

(function () {
  if (typeof checkAuth === 'function') checkAuth();

  var RANK = { free: 0, plus: 1, pro: 2 };
  var planNowEl = document.getElementById('bill-plan-now');
  var subEl     = document.getElementById('bill-sub');
  var trialEl   = document.getElementById('bill-trial');
  var manageEl  = document.getElementById('bill-manage');
  var manageBtn = document.getElementById('bill-manage-btn');
  var noteEl    = document.getElementById('bill-note');

  function daysLeft(iso) {
    var end = new Date(iso).getTime();
    if (isNaN(end)) return 0;
    return Math.max(0, Math.ceil((end - Date.now()) / 86400000));
  }

  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  function renderButtons(currentPlan) {
    var cur = RANK[currentPlan] != null ? RANK[currentPlan] : 0;
    ['free', 'plus', 'pro'].forEach(function (p) {
      var card = document.getElementById('card-' + p);
      var btn  = card.querySelector('.bill-btn');
      card.classList.toggle('is-current', p === currentPlan);
      var rank = RANK[p];
      if (p === currentPlan) {
        btn.textContent = 'Current plan'; btn.disabled = true; btn.classList.add('bill-btn--ghost');
      } else if (rank > cur && p !== 'free') {
        btn.textContent = 'Upgrade to ' + cap(p); btn.disabled = false; btn.classList.remove('bill-btn--ghost');
      } else {
        // A lower tier than the current plan — downgrades go through the portal.
        btn.textContent = rank < cur ? 'Included' : '—'; btn.disabled = true; btn.classList.add('bill-btn--ghost');
      }
    });
  }

  async function load() {
    var res = await getBillingState();
    if (!res || !res.success) { subEl.textContent = 'Could not load your billing details.'; return; }
    var d = res.data;

    planNowEl.textContent = d.plan;
    var statusLabel = {
      active: 'Active subscription', trialing: 'Free trial', none: 'No subscription',
      past_due: 'Payment past due', canceled: 'Subscription ended',
    }[d.status] || d.status;
    subEl.textContent = statusLabel + ' · ' + d.seatsUsed + ' of ' + d.seatsTotal + ' cashier seat' + (d.seatsTotal === 1 ? '' : 's') + ' used';

    if (d.status === 'trialing' && d.trialEndsAt) {
      var n = daysLeft(d.trialEndsAt);
      trialEl.style.display = 'inline-block';
      trialEl.textContent = 'Pro trial: ' + n + ' day' + (n === 1 ? '' : 's') + ' left';
    } else {
      trialEl.style.display = 'none';
    }

    // Manage billing only makes sense once a real LS subscription exists.
    manageEl.style.display = (d.status === 'active' || d.status === 'past_due' || d.status === 'canceled') ? 'block' : 'none';

    if (!d.configured) {
      noteEl.textContent = 'Billing isn’t connected yet. Upgrades will work once the Lemon Squeezy keys are configured on the server.';
    }

    renderButtons(d.plan);
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
