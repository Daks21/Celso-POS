// frontend/js/pages/team.js — Team page (admin). Lists cashier sub-accounts,
// adds new ones (within the plan's seat limit), and suspends/reactivates/removes
// them. The server enforces admin-only, store scoping, and seat limits; this is
// the UI on top. All user-provided text is HTML-escaped before render.

(function () {
  if (typeof checkAuth === 'function') checkAuth();

  var listEl  = document.getElementById('team-list');
  var emptyEl = document.getElementById('team-empty');
  var seatsEl = document.getElementById('team-seats');
  var form    = document.getElementById('team-add-form');
  var nameEl  = document.getElementById('cashier-name');
  var emailEl = document.getElementById('cashier-email');
  var passEl  = document.getElementById('cashier-password');
  var addBtn  = document.getElementById('cashier-add-btn');
  var errEl   = document.getElementById('team-error');

  function esc(s) { return (typeof escapeHtml === 'function') ? escapeHtml(s) : String(s == null ? '' : s); }

  function renderSeats(used, total) {
    seatsEl.textContent = used + ' of ' + total + ' seat' + (total === 1 ? '' : 's') + ' used';
    addBtn.disabled = used >= total;
  }

  function rowHtml(c) {
    var status = c.isActive
      ? '<span class="team-status team-status--active">Active</span>'
      : '<span class="team-status team-status--suspended">Suspended</span>';
    var toggleLabel = c.isActive ? 'Deactivate' : 'Reactivate';
    return '<tr>' +
      '<td>' + esc(c.fullName) + '</td>' +
      '<td>' + esc(c.email) + '</td>' +
      '<td>' + status + '</td>' +
      '<td><div class="team-actions">' +
        '<button class="team-btn team-btn--ghost" data-action="toggle" data-id="' + c.id + '" data-active="' + (c.isActive ? '0' : '1') + '">' + toggleLabel + '</button>' +
        '<button class="team-btn team-btn--danger" data-action="remove" data-id="' + c.id + '">Remove</button>' +
      '</div></td>' +
    '</tr>';
  }

  async function load() {
    var res = await getTeam();
    if (!res || !res.success) {
      listEl.innerHTML = '<tr><td colspan="4">Could not load your team.</td></tr>';
      return;
    }
    renderSeats(res.seatsUsed, res.seatsTotal);

    // Free plan has zero cashier seats — show an upsell and hide the add form.
    if (res.seatsTotal === 0) {
      form.style.display = 'none';
      listEl.innerHTML = '';
      emptyEl.style.display = 'block';
      emptyEl.innerHTML = 'Cashier accounts are available on <strong>Plus</strong> and <strong>Pro</strong>. ' +
        '<a href="billing.html">See plans</a>.';
      return;
    }

    form.style.display = '';
    var rows = res.data || [];
    if (rows.length === 0) {
      listEl.innerHTML = '';
      emptyEl.style.display = 'block';
      emptyEl.textContent = 'No cashiers yet. Add one above so staff can ring up sales on this store.';
    } else {
      emptyEl.style.display = 'none';
      listEl.innerHTML = rows.map(rowHtml).join('');
    }
  }

  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    errEl.textContent = '';
    var fullName = nameEl.value.trim();
    var email    = emailEl.value.trim();
    var password = passEl.value;
    if (!fullName || !email || !password) { errEl.textContent = 'Name, email, and a temporary password are required.'; return; }
    if (password.length < 8) { errEl.textContent = 'Temporary password must be at least 8 characters.'; return; }

    addBtn.disabled = true;
    var res = await createCashier({ fullName: fullName, email: email, password: password });
    addBtn.disabled = false;
    if (res && res.success) {
      if (typeof showApiSuccess === 'function') showApiSuccess('Cashier added.');
      nameEl.value = ''; emailEl.value = ''; passEl.value = '';
      load();
    } else {
      errEl.textContent = res ? res.message : 'Could not add the cashier.';
    }
  });

  listEl.addEventListener('click', async function (e) {
    var btn = e.target.closest('button[data-action]');
    if (!btn) return;
    var id     = btn.getAttribute('data-id');
    var action = btn.getAttribute('data-action');
    btn.disabled = true;

    if (action === 'toggle') {
      var active = btn.getAttribute('data-active') === '1';
      var res = await setCashierActive(id, active);
      if (res && res.success) { load(); }
      else { if (typeof showApiError === 'function') showApiError(res ? res.message : 'Could not update the cashier.'); btn.disabled = false; }
    } else if (action === 'remove') {
      if (!window.confirm('Remove this cashier? They keep their sales history but can no longer log in.')) { btn.disabled = false; return; }
      var res2 = await deleteCashier(id);
      if (res2 && res2.success) { if (typeof showApiSuccess === 'function') showApiSuccess('Cashier removed.'); load(); }
      else { if (typeof showApiError === 'function') showApiError('Could not remove the cashier.'); btn.disabled = false; }
    }
  });

  load();
})();
