// frontend/js/pages/admin.js — platform operator console (Phase 6.6; super-admin).
// Review manual GCash payment claims (approve/reject) and manage the global
// receiving QR. All endpoints 404 for non-super-admins; auth.guardCurrentPage
// keeps tenant users off this page.

checkAuth();

(function () {
  var PLAN_LABEL = { plus: 'Plus', pro: 'Pro' };
  var currentStatus = 'pending';
  var tbody = document.getElementById('op-claims-body');

  function peso(n) { return '₱' + Number(n || 0).toLocaleString('en-PH'); }
  function fmtDate(s) {
    var d = new Date(s);
    return isNaN(d.getTime()) ? '' : d.toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  }
  // Escape user-controlled values before building row HTML.
  function esc(s) { var t = document.createElement('span'); t.textContent = (s == null ? '' : String(s)); return t.innerHTML; }
  async function safe(p) { try { return await p; } catch (e) { return null; } }

  function updateBadge(n) {
    var b = document.getElementById('op-pending-count');
    if (!b) return;
    if (n > 0) { b.textContent = n; b.style.display = ''; } else { b.style.display = 'none'; }
  }

  async function loadClaims() {
    tbody.innerHTML = '<tr><td colspan="7" class="op-muted">Loading…</td></tr>';
    var res = await safe(getAdminClaims(currentStatus));
    if (!res || !res.success) {
      tbody.innerHTML = '<tr><td colspan="7" class="op-muted">Could not load claims.</td></tr>';
      return;
    }
    var rows = res.data || [];
    if (currentStatus === 'pending') updateBadge(rows.length);
    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="7" class="op-muted">No ' + currentStatus + ' claims.</td></tr>';
      return;
    }
    tbody.innerHTML = rows.map(function (c) {
      var action;
      if (c.status === 'pending') {
        action = '<button class="op-btn-sm op-approve" data-id="' + c.id + '">Approve</button>' +
                 '<button class="op-btn-sm op-reject" data-id="' + c.id + '">Reject</button>';
      } else if (c.status === 'approved') {
        action = '<span class="op-status op-status--approved">approved</span>' +
                 ' <button class="op-btn-sm op-revert" data-id="' + c.id + '">Undo</button>';
      } else {
        action = '<span class="op-status op-status--' + c.status + '">' + c.status + '</span>' +
                 (c.review_note ? (' <span class="op-muted">— ' + esc(c.review_note) + '</span>') : '');
      }
      return '<tr>' +
        '<td>' + esc(c.store_name || ('Store #' + c.store_id)) + '</td>' +
        '<td>' + esc(c.owner_email || '') + '</td>' +
        '<td>' + (PLAN_LABEL[c.plan] || esc(c.plan)) + '</td>' +
        '<td>' + peso(c.amount_php) + '</td>' +
        '<td>' + esc(c.gcash_ref) + '</td>' +
        '<td>' + fmtDate(c.submitted_at) + '</td>' +
        '<td class="op-actions-cell">' + action + '</td>' +
      '</tr>';
    }).join('');
  }

  tbody.addEventListener('click', async function (e) {
    var ap = e.target.closest('.op-approve');
    var rj = e.target.closest('.op-reject');
    var rv = e.target.closest('.op-revert');
    if (rv) {
      if (!window.confirm('Undo this approval? The store is rolled back to its pre-approval plan and the claim returns to Pending, where you can reject it.')) return;
      rv.disabled = true; rv.textContent = '…';
      var r3 = await safe(revertAdminClaim(rv.getAttribute('data-id')));
      if (r3 && r3.success) {
        if (typeof showApiSuccess === 'function') showApiSuccess('Approval reverted — claim is back in Pending.');
        loadClaims(); loadStats();
      } else {
        if (typeof showApiError === 'function') showApiError((r3 && r3.message) || 'Revert failed.');
        rv.disabled = false; rv.textContent = 'Undo';
      }
      return;
    }
    if (ap) {
      ap.disabled = true; ap.textContent = '…';
      var r1 = await safe(approveAdminClaim(ap.getAttribute('data-id')));
      if (r1 && r1.success) { if (typeof showApiSuccess === 'function') showApiSuccess('Plan activated.'); loadClaims(); }
      else { if (typeof showApiError === 'function') showApiError((r1 && r1.message) || 'Approve failed.'); ap.disabled = false; ap.textContent = 'Approve'; }
    } else if (rj) {
      var note = window.prompt('Reason for rejection (optional, shown to the owner):', '') ;
      if (note === null) return;   // cancelled
      rj.disabled = true;
      var r2 = await safe(rejectAdminClaim(rj.getAttribute('data-id'), note));
      if (r2 && r2.success) { if (typeof showApiSuccess === 'function') showApiSuccess('Claim rejected.'); loadClaims(); }
      else { if (typeof showApiError === 'function') showApiError((r2 && r2.message) || 'Reject failed.'); rj.disabled = false; }
    }
  });

  // Scoped tab init — each card's tabs toggle only within their own container, so
  // the claims / reset / tickets tab groups never cross-talk.
  function initTabs(containerId, onSelect) {
    var c = document.getElementById(containerId);
    if (!c) return;
    var tabs = c.querySelectorAll('.op-tab');
    Array.prototype.forEach.call(tabs, function (t) {
      t.addEventListener('click', function () {
        Array.prototype.forEach.call(tabs, function (x) { x.classList.remove('is-active'); });
        t.classList.add('is-active');
        onSelect(t.getAttribute('data-status'));
      });
    });
  }
  initTabs('op-claims-tabs', function (status) { currentStatus = status; loadClaims(); });

  // ── GCash QR settings ──
  async function loadQr() {
    var res = await safe(getAdminQr());
    if (!res || !res.success) return;
    var d = res.data || {};
    var img = document.getElementById('op-qr-img');
    var empty = document.getElementById('op-qr-empty');
    if (d.qrUrl) { img.src = d.qrUrl; img.style.display = ''; empty.style.display = 'none'; }
    else { img.style.display = 'none'; empty.style.display = ''; }
    document.getElementById('op-qr-name').value = d.name || '';
    document.getElementById('op-qr-number').value = d.number || '';
  }

  document.getElementById('op-qr-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var msg = document.getElementById('op-qr-msg');
    var name = document.getElementById('op-qr-name').value.trim();
    var number = document.getElementById('op-qr-number').value.trim();
    var file = document.getElementById('op-qr-file').files[0];
    msg.textContent = 'Saving…';

    function send(imageBase64) {
      saveAdminQr({ name: name, number: number, imageBase64: imageBase64 }).then(function (res) {
        if (res && res.success) { msg.textContent = 'Saved.'; document.getElementById('op-qr-file').value = ''; loadQr(); }
        else { msg.textContent = (res && res.message) || 'Save failed.'; }
      }).catch(function () { msg.textContent = 'Save failed.'; });
    }

    if (file) {
      if (file.size > 500 * 1024) { msg.textContent = 'Image too large (max 500 KB).'; return; }
      var reader = new FileReader();
      reader.onload = function () { send(reader.result); };       // data:image/...;base64,...
      reader.onerror = function () { msg.textContent = 'Could not read the image.'; };
      reader.readAsDataURL(file);
    } else {
      send(undefined);   // name/number only
    }
  });

  var logout = document.getElementById('op-logout');
  if (logout) logout.addEventListener('click', function () {
    if (typeof clearSession === 'function') clearSession();
    window.location.href = '../index.html';
  });

  // ── Platform overview ──
  function setText(id, val) { var el = document.getElementById(id); if (el) el.textContent = val; }
  function setBar(id, val, max) {
    var el = document.getElementById(id);
    if (el) el.style.width = (max > 0 ? Math.round((val / max) * 100) : 0) + '%';
  }

  var periodSel = document.getElementById('op-period');
  function currentPeriod() { return periodSel ? periodSel.value : 'this_month'; }

  async function loadStats() {
    var res = await safe(getAdminStats(currentPeriod()));
    if (!res || !res.success) return;
    var d = res.data || {};
    var s = d.stores || {}, u = d.users || {}, p = d.plans || {};

    // Current-state figures (always "now")
    setText('st-stores', s.total != null ? s.total : '—');
    setText('st-paying', s.paying || 0);
    setText('st-mrr', peso(d.mrrPhp) + '/mo');
    setText('st-free', s.free || 0);
    setText('st-active', u.active30d || 0);
    setText('st-active7', (u.active7d || 0) + ' in last 7d');
    setText('st-accounts', u.total || 0);
    setText('st-accounts-sub',
      (u.owners || 0) + ' owners · ' + (u.cashiers || 0) + ' cashiers' +
      (u.suspended ? ' · ' + u.suspended + ' suspended' : ''));

    // Period-driven figures (move with the selector)
    setText('st-signups', '+' + (d.periodSignups || 0) + ' new');
    setText('st-rev', peso(d.periodRevenuePhp));
    setText('st-rev-period', d.periodLabel || '');

    var maxPlan = Math.max(1, p.plus || 0, p.pro || 0);
    setText('st-plus',  p.plus  || 0); setBar('bar-plus',  p.plus  || 0, maxPlan);
    setText('st-pro',   p.pro   || 0); setBar('bar-pro',   p.pro   || 0, maxPlan);
  }

  if (periodSel) periodSel.addEventListener('change', loadStats);

  // ════════════════════════════════════════════════════════════════════════
  // Phase 6.7 — password reset requests + support tickets + notification bell
  // ════════════════════════════════════════════════════════════════════════

  function matchMark(ok) {
    return ok ? '<span class="op-match-yes">&#10003;</span>' : '<span class="op-match-no">&#10007;</span>';
  }

  // ── Reset requests board ──
  var resetStatus = 'pending';
  var resetBody = document.getElementById('op-reset-body');

  async function loadResets() {
    if (!resetBody) return;
    resetBody.innerHTML = '<tr><td colspan="8" class="op-muted">Loading…</td></tr>';
    var res = await safe(getResetRequests(resetStatus));
    if (!res || !res.success) { resetBody.innerHTML = '<tr><td colspan="8" class="op-muted">Could not load requests.</td></tr>'; return; }
    var rows = res.data || [];
    resetBody._rows = {};
    if (!rows.length) { resetBody.innerHTML = '<tr><td colspan="8" class="op-muted">No requests here.</td></tr>'; return; }
    resetBody.innerHTML = rows.map(function (r) {
      resetBody._rows[r.id] = r;
      var st = r.effective_status || r.status;
      var freq = Number(r.freq90) || 0;
      var freqCell = freq >= 3 ? '<span class="op-freq-flag">' + freq + ' &#9888;</span>' : String(freq);
      return '<tr class="op-row-click" data-id="' + r.id + '">' +
        '<td>' + esc(r.owner_name || (r.user_id ? ('User #' + r.user_id) : '—')) + '</td>' +
        '<td>' + esc(r.store_name || (r.store_id ? ('Store #' + r.store_id) : '—')) + '</td>' +
        '<td>' + esc(r.email) + '</td>' +
        '<td>' + esc(r.submitted_mobile || '') + ' ' + matchMark(r.mobile_match) + '</td>' +
        '<td>' + matchMark(r.answer_match) + '</td>' +
        '<td>' + freqCell + '</td>' +
        '<td>' + fmtDate(r.submitted_at) + '</td>' +
        '<td><span class="op-status op-status--' + st + '">' + esc(st) + '</span></td>' +
      '</tr>';
    }).join('');
  }

  initTabs('op-reset-tabs', function (status) { resetStatus = status; loadResets(); });

  if (resetBody) resetBody.addEventListener('click', function (e) {
    var tr = e.target.closest('tr.op-row-click');
    if (!tr) return;
    var row = resetBody._rows && resetBody._rows[tr.getAttribute('data-id')];
    if (row) openResetModal(row);
  });

  // ── Reset request modal ──
  var resetModal = document.getElementById('op-reset-modal');
  var resetModalBody = document.getElementById('op-reset-modal-body');

  function closeResetModal() { if (resetModal) resetModal.style.display = 'none'; }
  (function () {
    var closeBtn = document.getElementById('op-reset-modal-close');
    if (closeBtn) closeBtn.addEventListener('click', closeResetModal);
    if (resetModal) resetModal.addEventListener('click', function (e) { if (e.target === resetModal) closeResetModal(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeResetModal(); });
  })();

  function scLine(label, valueHtml) {
    return '<div class="sc-row"><span>' + label + '</span><span>' + valueHtml + '</span></div>';
  }

  function openResetModal(r) {
    if (!resetModal || !resetModalBody) return;
    var st = r.effective_status || r.status;

    var sc = '<div class="op-scorecard">' +
      scLine('Account', esc(r.owner_name || '—') + ' · ' + esc(r.email)) +
      scLine('Role', esc(r.owner_role || (r.user_id ? 'unknown' : 'no account'))) +
      scLine('Call this (on-file) number', r.onfile_mobile ? ('<b>' + esc(r.onfile_mobile) + '</b>') : '<span class="op-match-no">none on file</span>') +
      scLine('Submitted mobile', esc(r.submitted_mobile || '') + ' ' + matchMark(r.mobile_match)) +
      scLine('Place of birth', matchMark(r.answer_match)) +
      scLine('Requests (90d)', String(Number(r.freq90) || 0)) +
      scLine('Submitted', fmtDate(r.submitted_at)) +
      '</div>';

    var callout = '<div class="op-callout">Verify by calling the <b>on-file</b> number above — confirm they actually requested this and ask the place-of-birth question, then read them the code. Never deliver to a submitted number that differs from the on-file one.</div>';

    var hist = r.history_answers
      ? '<div class="op-history"><h4>What they told us</h4><div class="op-history-item"><span>' + esc(r.history_answers) + '</span></div></div>'
      : '';

    var actions;
    if (st === 'pending') {
      actions = '<button class="op-btn-sm op-approve" id="op-reset-approve">Approve &amp; issue code</button>' +
                '<button class="op-btn-sm op-reject" id="op-reset-reject">Reject</button>';
    } else if (st === 'approved') {
      actions = '<span class="op-status op-status--approved">code issued — awaiting login</span>' +
                ' <button class="op-btn-sm op-revert" id="op-reset-regen">Re-issue code</button>';
    } else if (st === 'expired') {
      actions = '<span class="op-status op-status--expired">code expired</span>' +
                ' <button class="op-btn-sm op-revert" id="op-reset-regen">Re-issue code</button>';
    } else {
      actions = '<span class="op-status op-status--' + st + '">' + esc(st) + '</span>' +
                (r.review_note ? (' <span class="op-muted">— ' + esc(r.review_note) + '</span>') : '');
    }

    resetModalBody.innerHTML = sc + callout + hist +
      '<div class="op-modal-actions" id="op-reset-modal-actions">' + actions + '</div>' +
      '<div id="op-reset-code-slot"></div>';

    // Frequency drill-down (append async; only when there's prior history).
    safe(getResetHistory(r.id)).then(function (h) {
      if (!h || !h.success || !h.data || h.data.length <= 1) return;
      var items = h.data.map(function (x) {
        return '<div class="op-history-item"><span>' + fmtDate(x.submitted_at) + '</span><span>' + esc(x.effective_status || x.status) + '</span></div>';
      }).join('');
      var wrap = document.createElement('div');
      wrap.className = 'op-history';
      wrap.innerHTML = '<h4>Past requests for this email (' + h.data.length + ')</h4>' + items;
      resetModalBody.appendChild(wrap);
    });

    var ap = document.getElementById('op-reset-approve');
    var rj = document.getElementById('op-reset-reject');
    var rg = document.getElementById('op-reset-regen');
    if (ap) ap.addEventListener('click', function () { issueCode(r.id, approveResetRequest, ap, 'Approve &amp; issue code'); });
    if (rg) rg.addEventListener('click', function () { issueCode(r.id, regenerateResetRequest, rg, 'Re-issue code'); });
    if (rj) rj.addEventListener('click', async function () {
      var note = window.prompt('Reason for rejecting (optional):', '');
      if (note === null) return;
      rj.disabled = true;
      var res = await safe(rejectResetRequest(r.id, note));
      if (res && res.success) {
        if (typeof showApiSuccess === 'function') showApiSuccess('Request rejected.');
        closeResetModal(); loadResets(); loadNotifications();
      } else {
        if (typeof showApiError === 'function') showApiError((res && res.message) || 'Reject failed.');
        rj.disabled = false;
      }
    });

    resetModal.style.display = 'flex';
  }

  // Shared by Approve + Re-issue: step-up prompt, call, then reveal the code once.
  async function issueCode(id, fn, btn, label) {
    var pw = window.prompt('Re-enter YOUR operator password to issue a code:');
    if (pw === null) return;
    if (!pw) { if (typeof showApiError === 'function') showApiError('Operator password required.'); return; }
    btn.disabled = true; btn.textContent = '…';
    var res = await safe(fn(id, pw));
    if (res && res.success && res.data) {
      var d = res.data;
      var slot = document.getElementById('op-reset-code-slot');
      if (slot) {
        slot.innerHTML = '<div class="op-codebox">' +
          '<p>Read this code to the owner on <b>' + esc(d.onfileMobile || 'their on-file number') + '</b>:</p>' +
          '<code>' + esc(d.tempPassword) + '</code>' +
          '<p class="op-muted">Works once, expires in 12 hours — they set a new password on first login. Confirm they requested this before sharing.</p>' +
        '</div>';
      }
      var box = document.getElementById('op-reset-modal-actions');
      if (box) box.innerHTML = '<span class="op-status op-status--approved">code issued</span>';
      loadResets(); loadNotifications();
    } else {
      if (typeof showApiError === 'function') showApiError((res && res.message) || 'Could not issue code.');
      btn.disabled = false; btn.innerHTML = label;
    }
  }

  // ── Support tickets ──
  var ticketStatus = 'open';
  var ticketsBody = document.getElementById('op-tickets-body');
  var TOPIC = { bug: 'Something broken', question: 'Question', billing: 'Billing', other: 'Other' };

  async function loadTickets() {
    if (!ticketsBody) return;
    ticketsBody.innerHTML = '<tr><td colspan="6" class="op-muted">Loading…</td></tr>';
    var res = await safe(getAdminTickets(ticketStatus));
    if (!res || !res.success) { ticketsBody.innerHTML = '<tr><td colspan="6" class="op-muted">Could not load tickets.</td></tr>'; return; }
    var rows = res.data || [];
    ticketsBody._rows = {};
    if (!rows.length) { ticketsBody.innerHTML = '<tr><td colspan="6" class="op-muted">No ' + ticketStatus + ' tickets.</td></tr>'; return; }
    ticketsBody.innerHTML = rows.map(function (t) {
      ticketsBody._rows[t.id] = t;
      var action = t.status === 'open'
        ? '<button class="op-btn-sm op-approve op-ticket-close" data-id="' + t.id + '">Close</button>'
        : '<span class="op-status op-status--completed">closed</span>';
      return '<tr class="op-row-click" data-id="' + t.id + '">' +
        '<td>' + esc(t.user_name || (t.user_id ? ('User #' + t.user_id) : '—')) + '</td>' +
        '<td>' + esc(t.store_name || (t.store_id ? ('Store #' + t.store_id) : '—')) + '</td>' +
        '<td>' + esc(TOPIC[t.category] || t.category) + '</td>' +
        '<td class="op-msg-cell">' + esc(t.message) + '</td>' +
        '<td>' + fmtDate(t.created_at) + '</td>' +
        '<td class="op-actions-cell">' + action + '</td>' +
      '</tr>';
    }).join('');
  }

  initTabs('op-tickets-tabs', function (status) { ticketStatus = status; loadTickets(); });

  if (ticketsBody) ticketsBody.addEventListener('click', async function (e) {
    var btn = e.target.closest('.op-ticket-close');
    if (btn) {
      btn.disabled = true; btn.textContent = '…';
      var res = await safe(closeAdminTicket(btn.getAttribute('data-id')));
      if (res && res.success) {
        if (typeof showApiSuccess === 'function') showApiSuccess('Ticket closed.');
        loadTickets(); loadNotifications();
      } else {
        if (typeof showApiError === 'function') showApiError((res && res.message) || 'Could not close ticket.');
        btn.disabled = false; btn.textContent = 'Close';
      }
      return;
    }
    var tr = e.target.closest('tr.op-row-click');
    if (!tr) return;
    var t = ticketsBody._rows && ticketsBody._rows[tr.getAttribute('data-id')];
    if (t) openTicketModal(t);
  });

  // ── Support ticket detail modal ──
  var ticketModal = document.getElementById('op-ticket-modal');
  var ticketModalBody = document.getElementById('op-ticket-modal-body');

  function closeTicketModal() { if (ticketModal) ticketModal.style.display = 'none'; }
  (function () {
    var closeBtn = document.getElementById('op-ticket-modal-close');
    if (closeBtn) closeBtn.addEventListener('click', closeTicketModal);
    if (ticketModal) ticketModal.addEventListener('click', function (e) { if (e.target === ticketModal) closeTicketModal(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeTicketModal(); });
  })();

  function openTicketModal(t) {
    if (!ticketModal || !ticketModalBody) return;
    var sc = '<div class="op-scorecard">' +
      scLine('User', esc(t.user_name || (t.user_id ? ('User #' + t.user_id) : '—'))) +
      scLine('Store', esc(t.store_name || (t.store_id ? ('Store #' + t.store_id) : '—'))) +
      scLine('Topic', esc(TOPIC[t.category] || t.category)) +
      scLine('Submitted', fmtDate(t.created_at)) +
      scLine('Status', '<span class="op-status op-status--' + (t.status === 'open' ? 'pending' : 'completed') + '">' + esc(t.status) + '</span>') +
      '</div>';
    var msg = '<div class="op-ticket-msg">' + esc(t.message || '') + '</div>';
    var actions = t.status === 'open'
      ? '<div class="op-modal-actions"><button class="op-btn-sm op-approve op-ticket-close" data-id="' + t.id + '">Close ticket</button></div>'
      : '';
    ticketModalBody.innerHTML = sc + msg + actions;

    var closeTicketBtn = ticketModalBody.querySelector('.op-ticket-close');
    if (closeTicketBtn) closeTicketBtn.addEventListener('click', async function () {
      closeTicketBtn.disabled = true; closeTicketBtn.textContent = '…';
      var res = await safe(closeAdminTicket(t.id));
      if (res && res.success) {
        if (typeof showApiSuccess === 'function') showApiSuccess('Ticket closed.');
        closeTicketModal(); loadTickets(); loadNotifications();
      } else {
        if (typeof showApiError === 'function') showApiError((res && res.message) || 'Could not close ticket.');
        closeTicketBtn.disabled = false; closeTicketBtn.textContent = 'Close ticket';
      }
    });

    ticketModal.style.display = 'flex';
  }

  // ── Notification bell + per-card badges ──
  function setCardBadge(id, n) {
    var b = document.getElementById(id);
    if (!b) return;
    if (n > 0) { b.textContent = n; b.style.display = ''; } else { b.style.display = 'none'; }
  }
  async function loadNotifications() {
    var res = await safe(getAdminNotifications());
    if (!res || !res.success || !res.data) return;
    var d = res.data;
    setCardBadge('op-bell-badge', (d.pendingResets || 0) + (d.openTickets || 0));
    setCardBadge('op-reset-pending-count', d.pendingResets || 0);
    setCardBadge('op-tickets-open-count', d.openTickets || 0);
  }
  var bellBtn = document.getElementById('op-bell');
  if (bellBtn) bellBtn.addEventListener('click', function () {
    var card = document.getElementById('op-reset-card');
    if (card) card.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  loadStats();
  loadClaims();
  loadQr();
  loadResets();
  loadTickets();
  loadNotifications();
})();
