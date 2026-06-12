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
  // Latest seat usage, so the Add button can EXPLAIN (not silently no-op) when
  // there's no free seat. Set on every load().
  var seatState = { used: 0, total: 0 };

  function esc(s) { return (typeof escapeHtml === 'function') ? escapeHtml(s) : String(s == null ? '' : s); }

  // Show/hide an inline field error. main.css keeps .form-error at display:none
  // until its parent .form-group has .has-error, so setting textContent ALONE is
  // invisible — we must toggle the class too (matches auth.js / products.js).
  // Pass an empty/falsy msg to clear.
  function setFieldError(errEl, msg) {
    if (!errEl) return;
    errEl.textContent = msg || '';
    var group = errEl.closest ? errEl.closest('.form-group') : errEl.parentElement;
    if (group) group.classList.toggle('has-error', !!msg);
  }

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
    seatState.used = res.seatsUsed; seatState.total = res.seatsTotal;

    // Free plan has no cashier seats — show an upsell. The Add button stays
    // CLICKABLE on purpose: a tap explains why + routes to plans, instead of a
    // disabled button that does nothing and confuses the owner.
    if (res.seatsTotal === 0) {
      listEl.innerHTML = '';
      emptyEl.style.display = 'block';
      emptyEl.innerHTML = 'Cashier accounts are available on <strong>Plus</strong> and <strong>Pro</strong>. <a href="billing.html">See plans</a>.';
      return;
    }

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
  var cashierSubmitBtn = cashierForm.querySelector('button[type="submit"]');
  var nameErr  = document.getElementById('cashier-name-error');
  var emailErr = document.getElementById('cashier-email-error');
  var passErr  = document.getElementById('cashier-password-error');

  function clearCashierErrors() { setFieldError(nameErr, ''); setFieldError(emailErr, ''); setFieldError(passErr, ''); }
  function openCashierModal() { cashierForm.reset(); clearCashierErrors(); cashierModal.style.display = 'flex'; nameEl.focus(); }
  function closeCashierModal() { cashierModal.style.display = 'none'; cashierForm.reset(); }

  addBtn.addEventListener('click', function () {
    // Explain instead of doing nothing when there's no seat to fill.
    if (seatState.total === 0) {
      if (typeof showApiError === 'function') showApiError('Cashier accounts are on Plus and Pro — taking you to plans…');
      window.location.href = 'billing.html';
      return;
    }
    if (seatState.used >= seatState.total) {
      if (typeof showApiError === 'function') {
        showApiError('You\'re using all ' + seatState.total + ' cashier seat' +
          (seatState.total === 1 ? '' : 's') + '. Deactivate a cashier or upgrade your plan to add another.');
      }
      return;
    }
    openCashierModal();
  });
  document.getElementById('cashier-close-button').addEventListener('click', closeCashierModal);
  cashierModal.addEventListener('click', function (e) { if (e.target === cashierModal) closeCashierModal(); });

  // Live-sanitize the username field as the owner types: force lowercase and drop
  // anything not [a-z0-9._-], so the field physically can't hold an '@' or a full
  // email. Mirrors backend sanitizeUsername (the server still re-validates). Caret
  // is kept in place when characters are removed so typing isn't disrupted.
  if (emailEl) {
    emailEl.addEventListener('input', function () {
      var cleaned = emailEl.value.toLowerCase().replace(/[^a-z0-9._-]/g, '');
      if (cleaned !== emailEl.value) {
        var pos = emailEl.selectionStart || 0;
        var removed = emailEl.value.length - cleaned.length;
        emailEl.value = cleaned;
        try { emailEl.setSelectionRange(pos - removed, pos - removed); } catch (e) { /* unsupported */ }
      }
    });
  }

  cashierForm.addEventListener('submit', async function (e) {
    e.preventDefault();
    clearCashierErrors();
    var fullName = nameEl.value.trim(), username = emailEl.value.trim().toLowerCase(), password = passEl.value;
    var ok = true;
    if (!fullName) { setFieldError(nameErr, 'Name is required.'); ok = false; }
    if (!username) { setFieldError(emailErr, 'Username is required.'); ok = false; }
    else if (username.indexOf('@') !== -1) {
      // Most common mistake: typing a full email. Be explicit, don't show the
      // generic charset message.
      setFieldError(emailErr, "Enter just a username (no '@' or email) — we add the rest, e.g. maria.");
      ok = false;
    }
    else if (!/^[a-z0-9](?:[a-z0-9._-]{0,28}[a-z0-9])?$/.test(username)) {
      setFieldError(emailErr, 'Use letters, numbers, dot, underscore, or hyphen (start and end with a letter or number).');
      ok = false;
    }
    var pwChk = (typeof PasswordPolicy !== 'undefined')
      ? PasswordPolicy.validate(password)
      : { ok: password.length >= 12, message: 'Password must be at least 12 characters.' };
    if (!pwChk.ok) { setFieldError(passErr, pwChk.message); ok = false; }
    if (!ok) return;

    // Loading + double-submit guard. Target users are on slow networks — without
    // this the button looks dead during the request and gets tapped repeatedly.
    var origLabel = cashierSubmitBtn ? cashierSubmitBtn.textContent : '';
    if (cashierSubmitBtn) { cashierSubmitBtn.disabled = true; cashierSubmitBtn.textContent = 'Adding…'; }

    try {
      var res = await createCashier({ fullName: fullName, username: username, password: password });
      if (res && res.success) {
        // Show the generated login handle so the owner can copy it to the staffer.
        var handle = (res.data && (res.data.loginHandle || res.data.email)) || '';
        if (typeof showApiSuccess === 'function') {
          showApiSuccess(handle ? ('Cashier added. Their login: ' + handle) : 'Cashier added.');
        }
        closeCashierModal();
        load();
      } else {
        // Route the error to the right place: seat limit → toast; field-specific
        // → that field; anything else → a general toast (never silently, and never
        // dumped onto the password field where it reads as a password problem).
        var msg = res ? res.message : 'Could not add the cashier.';
        if (res && res.code === 'SEAT_LIMIT') { if (typeof showApiError === 'function') showApiError(msg); }
        else if (/username/i.test(msg)) { setFieldError(emailErr, msg); }
        else if (/password/i.test(msg)) { setFieldError(passErr, msg); }
        else if (typeof showApiError === 'function') { showApiError(msg); }
        else { setFieldError(passErr, msg); }
      }
    } catch (err) {
      if (typeof showApiError === 'function') showApiError('Network error — check your connection and try again.');
    } finally {
      if (cashierSubmitBtn) { cashierSubmitBtn.disabled = false; cashierSubmitBtn.textContent = origLabel || 'Add Cashier'; }
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
    rpInput.value = ''; setFieldError(rpError, '');
    rpModal.style.display = 'flex';
    rpInput.focus();
  }
  function closeResetModal() { rpModal.style.display = 'none'; rpTarget = null; }

  document.getElementById('reset-pw-close').addEventListener('click', closeResetModal);
  rpModal.addEventListener('click', function (e) { if (e.target === rpModal) closeResetModal(); });

  rpForm.addEventListener('submit', async function (e) {
    e.preventDefault();
    setFieldError(rpError, '');
    var pw = rpInput.value;
    var rpChk = (typeof PasswordPolicy !== 'undefined')
      ? PasswordPolicy.validate(pw)
      : { ok: (pw || '').length >= 12, message: 'Password must be at least 12 characters.' };
    if (!rpChk.ok) { setFieldError(rpError, rpChk.message); return; }

    var rpBtn = rpForm.querySelector('button[type="submit"]');
    var rpLabel = rpBtn ? rpBtn.textContent : '';
    if (rpBtn) { rpBtn.disabled = true; rpBtn.textContent = 'Saving…'; }
    try {
      var res = await resetCashierPassword(rpTarget, pw);
      if (res && res.success) {
        if (typeof showApiSuccess === 'function') showApiSuccess('Password updated.');
        closeResetModal();
      } else {
        setFieldError(rpError, res ? res.message : 'Could not update the password.');
      }
    } catch (err) {
      setFieldError(rpError, 'Network error — check your connection and try again.');
    } finally {
      if (rpBtn) { rpBtn.disabled = false; rpBtn.textContent = rpLabel || 'Save password'; }
    }
  });

  // ── Daily Sales (admin audit) ──────────────────────────────────────────────
  // Per-person breakdown of one store-local day + a receipts drill-down, so the
  // owner can reconcile each shift against the cash drawer. Read-only.
  var dsDate  = document.getElementById('ds-date');
  var dsTotal = document.getElementById('ds-total');
  var dsTxns  = document.getElementById('ds-txns');
  var dsAvg   = document.getElementById('ds-avg');
  var dsList  = document.getElementById('ds-list');
  var dsEmpty = document.getElementById('ds-empty');

  function peso(n) { return (typeof formatPeso === 'function') ? formatPeso(n) : '₱' + Number(n || 0).toFixed(2); }
  function clock(ts) { return formatTimeTz(ts, { hour: '2-digit', minute: '2-digit' }); }

  // Render a YYYY-MM-DD store-local day as "June 1, 2026". Interpreted as UTC so
  // the displayed calendar date never drifts with the viewer's device timezone.
  function prettyDay(dateStr) {
    var d = new Date(dateStr + 'T00:00:00Z');
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('en-PH', { timeZone: 'UTC', year: 'numeric', month: 'long', day: 'numeric' });
  }

  // "8:14 AM – 5:02 PM", or a single time when there's one sale, or — when none.
  function shiftWindow(firstAt, lastAt) {
    if (!firstAt) return '—';
    var f = clock(firstAt), l = clock(lastAt);
    return f === l ? f : (f + ' – ' + l);
  }

  function dsRowHtml(p) {
    var ownerTag = p.role === 'admin' ? '<span class="ds-owner-tag">Owner</span>' : '';
    var subline  = p.transactions + ' sale' + (p.transactions === 1 ? '' : 's') + ' · avg ' + peso(p.avgSale);
    return '<tr class="ds-row" data-id="' + p.userId + '" data-name="' + esc(p.name) + '">' +
      '<td><div class="cashier-cell">' +
        '<span class="cashier-name">' + esc(p.name) + ownerTag + '</span>' +
        '<span class="cashier-email">' + subline + '</span>' +
      '</div></td>' +
      '<td class="ds-shift">' + shiftWindow(p.firstAt, p.lastAt) + '</td>' +
      '<td class="ds-num-col">' + p.transactions + '</td>' +
      '<td class="ds-num-col"><strong>' + peso(p.total) + '</strong></td>' +
      '<td class="actions-cell"><button type="button" class="ds-view-btn" title="View receipts"><i data-lucide="chevron-right"></i></button></td>' +
    '</tr>';
  }

  async function loadDailySales() {
    var date = dsDate.value || (typeof todayStrTz === 'function' ? todayStrTz() : '');
    dsList.innerHTML = '<tr class="api-loading-row"><td colspan="5"><span class="api-spinner"></span>Loading...</td></tr>';
    dsEmpty.style.display = 'none';

    var res = await getDailySales(date);
    if (!res || !res.success) { dsList.innerHTML = '<tr><td colspan="5">Could not load daily sales.</td></tr>'; return; }

    var d = res.data;
    dsTotal.textContent = peso(d.store.total);
    dsTxns.textContent  = d.store.transactions;
    dsAvg.textContent   = peso(d.store.avgSale);

    var people = d.people || [];
    if (people.length === 0) {
      dsList.innerHTML = '';
      dsEmpty.style.display = 'block';
      dsEmpty.textContent = 'No sales were recorded on this day.';
      return;
    }
    dsList.innerHTML = people.map(dsRowHtml).join('');
    if (typeof lucide !== 'undefined') lucide.createIcons();
  }

  dsList.addEventListener('click', function (e) {
    var row = e.target.closest('.ds-row');
    if (!row) return;
    openReceiptsModal(row.getAttribute('data-id'), row.getAttribute('data-name') || 'this person');
  });
  dsDate.addEventListener('change', loadDailySales);
  // Open the native date picker on a click anywhere in the field — by default
  // only the small calendar icon opens it, which reads as "the filter is stuck".
  // showPicker() needs a user gesture (this is one) and throws if already open;
  // swallow that. Unsupported on older browsers — the icon still works there.
  dsDate.addEventListener('click', function () {
    if (typeof dsDate.showPicker === 'function') {
      try { dsDate.showPicker(); } catch (e) { /* already open / not allowed */ }
    }
  });

  // Receipts drill-down modal
  var rcModal = document.getElementById('ds-receipts-modal');
  var rcTitle = document.getElementById('ds-receipts-title');
  var rcSub   = document.getElementById('ds-receipts-sub');
  var rcList  = document.getElementById('ds-receipts-list');
  var rcEmpty = document.getElementById('ds-receipts-empty');

  async function openReceiptsModal(userId, name) {
    var date = dsDate.value || (typeof todayStrTz === 'function' ? todayStrTz() : '');
    rcTitle.textContent = name + ' — receipts';
    rcSub.textContent   = prettyDay(date);
    rcList.innerHTML = '<tr class="api-loading-row"><td colspan="4"><span class="api-spinner"></span>Loading...</td></tr>';
    rcEmpty.style.display = 'none';
    rcModal.style.display = 'flex';

    var res = await getPersonReceipts(userId, date);
    if (!res || !res.success) { rcList.innerHTML = '<tr><td colspan="4">Could not load receipts.</td></tr>'; return; }

    var rows = res.data || [];
    if (rows.length === 0) {
      rcList.innerHTML = '';
      rcEmpty.style.display = 'block';
      rcEmpty.textContent = 'No receipts for this person on this day.';
      return;
    }
    rcList.innerHTML = rows.map(function (r) {
      return '<tr>' +
        '<td>' + esc(r.receiptNo || ('#' + r.id)) + '</td>' +
        '<td>' + esc(clock(r.timestamp)) + '</td>' +
        '<td class="ds-num-col">' + r.itemCount + '</td>' +
        '<td class="ds-num-col"><strong>' + peso(r.total) + '</strong></td>' +
      '</tr>';
    }).join('');
  }

  function closeReceiptsModal() { rcModal.style.display = 'none'; }
  document.getElementById('ds-receipts-close').addEventListener('click', closeReceiptsModal);
  rcModal.addEventListener('click', function (e) { if (e.target === rcModal) closeReceiptsModal(); });

  // Default the date picker to today (store time), cap it there (no future
  // days to audit), and load both views.
  if (typeof todayStrTz === 'function') {
    var today = todayStrTz();
    dsDate.value = today;
    dsDate.max   = today;
  }
  loadDailySales();

  load();
})();
