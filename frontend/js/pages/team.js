// frontend/js/pages/team.js — Team page (admin). Cashier list with a 3-dot
// (kebab) action menu, an Add Cashier modal, and a Reset password modal — styled
// to match the Products page. The server enforces admin-only, store scoping, and
// per-plan seat limits; this is the UI on top. All user text is HTML-escaped.

(function () {
  if (typeof checkAuth === 'function') checkAuth();

  var listEl  = document.getElementById('team-list');
  var emptyEl = document.getElementById('team-empty');
  var seatsEl = document.getElementById('team-seats');
  var addBtn  = document.getElementById('add-cashier-button');

  function esc(s) { return (typeof escapeHtml === 'function') ? escapeHtml(s) : String(s == null ? '' : s); }

  // ── Render ──
  function renderSeats(used, total) {
    seatsEl.textContent = used + ' of ' + total + ' seat' + (total === 1 ? '' : 's');
    seatsEl.classList.toggle('is-full', total > 0 && used >= total);
  }

  function rowHtml(c) {
    var status = c.isActive
      ? '<span class="team-status team-status--active">Active</span>'
      : '<span class="team-status team-status--suspended">Suspended</span>';
    var toggleLabel = c.isActive ? 'Deactivate' : 'Reactivate';
    var toggleIcon  = c.isActive ? 'user-x' : 'user-check';
    return '<tr>' +
      '<td><div class="cashier-cell">' +
        '<span class="cashier-name">' + esc(c.fullName) + '</span>' +
        '<span class="cashier-email">' + esc(c.email) + '</span>' +
      '</div></td>' +
      '<td>' + status + '</td>' +
      '<td class="actions-cell"><div class="kebab-wrapper">' +
        '<button type="button" class="kebab-btn" title="Actions"><i data-lucide="more-vertical"></i></button>' +
        '<div class="kebab-dropdown">' +
          '<button type="button" class="kebab-item" data-action="toggle" data-id="' + c.id + '" data-active="' + (c.isActive ? '0' : '1') + '"><i data-lucide="' + toggleIcon + '"></i> ' + toggleLabel + '</button>' +
          '<button type="button" class="kebab-item" data-action="resetpw" data-id="' + c.id + '" data-name="' + esc(c.fullName) + '"><i data-lucide="key-round"></i> Reset password</button>' +
          '<button type="button" class="kebab-item delete-btn" data-action="delete" data-id="' + c.id + '" data-name="' + esc(c.fullName) + '"><i data-lucide="trash-2"></i> Delete</button>' +
        '</div>' +
      '</div></td>' +
    '</tr>';
  }

  async function load() {
    var res = await getTeam();
    if (!res || !res.success) { listEl.innerHTML = '<tr><td colspan="3">Could not load your team.</td></tr>'; return; }
    renderSeats(res.seatsUsed, res.seatsTotal);

    // Free plan has no cashier seats — disable add and show an upsell.
    if (res.seatsTotal === 0) {
      addBtn.disabled = true;
      listEl.innerHTML = '';
      emptyEl.style.display = 'block';
      emptyEl.innerHTML = 'Cashier accounts are available on <strong>Plus</strong> and <strong>Pro</strong>. <a href="billing.html">See plans</a>.';
      return;
    }

    addBtn.disabled = res.seatsUsed >= res.seatsTotal;

    var rows = res.data || [];
    if (rows.length === 0) {
      listEl.innerHTML = '';
      emptyEl.style.display = 'block';
      emptyEl.textContent = 'No cashiers yet. Add one so staff can ring up sales on this store.';
    } else {
      emptyEl.style.display = 'none';
      listEl.innerHTML = rows.map(rowHtml).join('');
      if (typeof lucide !== 'undefined') lucide.createIcons();
    }
  }

  // ── Kebab dropdown (open/close + outside click), like the Products page ──
  function closeAllDropdowns() {
    document.querySelectorAll('.kebab-dropdown.open').forEach(function (d) { d.classList.remove('open'); });
  }

  listEl.addEventListener('click', function (e) {
    var kebab = e.target.closest('.kebab-btn');
    if (kebab) {
      e.stopPropagation();
      var dd = kebab.nextElementSibling;
      var isOpen = dd.classList.contains('open');
      closeAllDropdowns();
      if (!isOpen) dd.classList.add('open');
      return;
    }
    var item = e.target.closest('.kebab-item[data-action]');
    if (!item) return;
    closeAllDropdowns();
    handleAction(item);
  });

  document.addEventListener('click', function (e) {
    if (!e.target.closest('.kebab-wrapper')) closeAllDropdowns();
  });

  async function handleAction(btn) {
    var id     = btn.getAttribute('data-id');
    var action = btn.getAttribute('data-action');

    if (action === 'toggle') {
      var active = btn.getAttribute('data-active') === '1';
      var res = await setCashierActive(id, active);
      if (res && res.success) load();
      else if (typeof showApiError === 'function') showApiError(res ? res.message : 'Could not update the cashier.');
    } else if (action === 'resetpw') {
      openResetModal(id, btn.getAttribute('data-name') || 'this cashier');
    } else if (action === 'delete') {
      var name = btn.getAttribute('data-name') || 'this cashier';
      if (!window.confirm('Delete ' + name + '? This permanently removes their account.')) return;
      var resd = await deleteCashier(id);
      if (resd && resd.success) { if (typeof showApiSuccess === 'function') showApiSuccess('Cashier deleted.'); load(); }
      else if (typeof showApiError === 'function') showApiError(resd ? resd.message : 'Could not delete the cashier.');
    }
  }

  // ── Add cashier modal ──
  var cashierModal = document.getElementById('cashier-modal');
  var cashierForm  = document.getElementById('cashier-form');
  var nameEl  = document.getElementById('cashier-name');
  var emailEl = document.getElementById('cashier-email');
  var passEl  = document.getElementById('cashier-password');
  var nameErr  = document.getElementById('cashier-name-error');
  var emailErr = document.getElementById('cashier-email-error');
  var passErr  = document.getElementById('cashier-password-error');

  function clearCashierErrors() { nameErr.textContent = ''; emailErr.textContent = ''; passErr.textContent = ''; }
  function openCashierModal() { cashierForm.reset(); clearCashierErrors(); cashierModal.style.display = 'flex'; nameEl.focus(); }
  function closeCashierModal() { cashierModal.style.display = 'none'; cashierForm.reset(); }

  addBtn.addEventListener('click', openCashierModal);
  document.getElementById('cashier-close-button').addEventListener('click', closeCashierModal);
  cashierModal.addEventListener('click', function (e) { if (e.target === cashierModal) closeCashierModal(); });

  cashierForm.addEventListener('submit', async function (e) {
    e.preventDefault();
    clearCashierErrors();
    var fullName = nameEl.value.trim(), email = emailEl.value.trim(), password = passEl.value;
    var ok = true;
    if (!fullName) { nameErr.textContent = 'Name is required.'; ok = false; }
    if (!email)    { emailErr.textContent = 'Email is required.'; ok = false; }
    if (password.length < 8) { passErr.textContent = 'Password must be at least 8 characters.'; ok = false; }
    if (!ok) return;

    var res = await createCashier({ fullName: fullName, email: email, password: password });
    if (res && res.success) {
      if (typeof showApiSuccess === 'function') showApiSuccess('Cashier added.');
      closeCashierModal();
      load();
    } else {
      var msg = res ? res.message : 'Could not add the cashier.';
      if (res && res.code === 'SEAT_LIMIT') { if (typeof showApiError === 'function') showApiError(msg); }
      else if (/email/i.test(msg)) { emailErr.textContent = msg; }
      else { passErr.textContent = msg; }
    }
  });

  // ── Reset password modal ──
  var rpModal  = document.getElementById('reset-pw-modal');
  var rpForm   = document.getElementById('reset-pw-form');
  var rpFor    = document.getElementById('reset-pw-for');
  var rpInput  = document.getElementById('reset-pw-input');
  var rpError  = document.getElementById('reset-pw-error');
  var rpTarget = null;

  function openResetModal(id, name) {
    rpTarget = id;
    rpFor.textContent = 'Set a new password for ' + name + '.';
    rpInput.value = ''; rpError.textContent = '';
    rpModal.style.display = 'flex';
    rpInput.focus();
  }
  function closeResetModal() { rpModal.style.display = 'none'; rpTarget = null; }

  document.getElementById('reset-pw-close').addEventListener('click', closeResetModal);
  rpModal.addEventListener('click', function (e) { if (e.target === rpModal) closeResetModal(); });

  rpForm.addEventListener('submit', async function (e) {
    e.preventDefault();
    rpError.textContent = '';
    var pw = rpInput.value;
    if (!pw || pw.length < 8) { rpError.textContent = 'Password must be at least 8 characters.'; return; }
    var res = await resetCashierPassword(rpTarget, pw);
    if (res && res.success) {
      if (typeof showApiSuccess === 'function') showApiSuccess('Password updated.');
      closeResetModal();
    } else {
      rpError.textContent = res ? res.message : 'Could not update the password.';
    }
  });

  load();
})();
