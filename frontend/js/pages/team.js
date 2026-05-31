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
    seatsEl.textContent = used + ' of ' + total + ' seat' + (total === 1 ? '' : 's');
    seatsEl.classList.toggle('is-full', total > 0 && used >= total);
    addBtn.disabled = used >= total;
  }

  function rowHtml(c) {
    var status = c.isActive
      ? '<span class="team-status team-status--active">Active</span>'
      : '<span class="team-status team-status--suspended">Suspended</span>';
    var toggleLabel = c.isActive ? 'Deactivate' : 'Reactivate';
    var toggleClass = c.isActive ? 'team-btn team-btn--ghost' : 'team-btn';
    return '<tr>' +
      '<td>' + esc(c.fullName) + '</td>' +
      '<td>' + esc(c.email) + '</td>' +
      '<td>' + status + '</td>' +
      '<td><div class="team-actions">' +
        '<button class="' + toggleClass + '" data-action="toggle" data-id="' + c.id + '" data-active="' + (c.isActive ? '0' : '1') + '">' + toggleLabel + '</button>' +
        '<button class="team-btn team-btn--ghost" data-action="resetpw" data-id="' + c.id + '" data-name="' + esc(c.fullName) + '">Reset password</button>' +
        '<button class="team-btn team-btn--danger" data-action="delete" data-id="' + c.id + '" data-name="' + esc(c.fullName) + '">Delete</button>' +
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
    } else if (action === 'resetpw') {
      btn.disabled = false; // it's just opening a dialog
      openResetModal(id, btn.getAttribute('data-name') || 'this cashier');
    } else if (action === 'delete') {
      var name = btn.getAttribute('data-name') || 'this cashier';
      if (!window.confirm('Delete ' + name + '? This permanently removes their account.')) { btn.disabled = false; return; }
      var resd = await deleteCashier(id);
      if (resd && resd.success) {
        if (typeof showApiSuccess === 'function') showApiSuccess('Cashier deleted.');
        load();
      } else {
        // 409 = has sales history → guided to deactivate instead.
        if (typeof showApiError === 'function') showApiError(resd ? resd.message : 'Could not delete the cashier.');
        btn.disabled = false;
      }
    }
  });

  // ── Reset-password modal (admin sets a cashier's password) ──
  var rpModal  = document.getElementById('reset-pw-modal');
  var rpFor    = document.getElementById('reset-pw-for');
  var rpInput  = document.getElementById('reset-pw-input');
  var rpError  = document.getElementById('reset-pw-error');
  var rpSave   = document.getElementById('reset-pw-save');
  var rpTarget = null;

  function openResetModal(id, name) {
    rpTarget = id;
    rpFor.textContent = 'Set a new password for ' + name + '.';
    rpInput.value = '';
    rpError.textContent = '';
    rpModal.style.display = 'flex';
    rpInput.focus();
  }
  function closeResetModal() { rpModal.style.display = 'none'; rpTarget = null; }

  document.getElementById('reset-pw-close').addEventListener('click', closeResetModal);
  document.getElementById('reset-pw-cancel').addEventListener('click', closeResetModal);
  rpModal.addEventListener('click', function (e) { if (e.target === rpModal) closeResetModal(); });

  rpSave.addEventListener('click', async function () {
    rpError.textContent = '';
    var pw = rpInput.value;
    if (!pw || pw.length < 8) { rpError.textContent = 'Password must be at least 8 characters.'; return; }
    rpSave.disabled = true;
    var res = await resetCashierPassword(rpTarget, pw);
    rpSave.disabled = false;
    if (res && res.success) {
      if (typeof showApiSuccess === 'function') showApiSuccess('Password updated.');
      closeResetModal();
    } else {
      rpError.textContent = res ? res.message : 'Could not update the password.';
    }
  });

  load();
})();
