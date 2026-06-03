// frontend/js/pages/admin.js — platform operator console (Phase 6.6; super-admin).
// Review manual GCash payment claims (approve/reject) and manage the global
// receiving QR. All endpoints 404 for non-super-admins; auth.guardCurrentPage
// keeps tenant users off this page.

checkAuth();

(function () {
  var PLAN_LABEL = { basic: 'Basic', plus: 'Plus', pro: 'Pro' };
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

  Array.prototype.forEach.call(document.querySelectorAll('.op-tab'), function (t) {
    t.addEventListener('click', function () {
      Array.prototype.forEach.call(document.querySelectorAll('.op-tab'), function (x) { x.classList.remove('is-active'); });
      t.classList.add('is-active');
      currentStatus = t.getAttribute('data-status');
      loadClaims();
    });
  });

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

  loadClaims();
  loadQr();
})();
