// frontend/js/pages/change-password.js — forced first-login password change for
// new cashiers. The account is already authenticated (they logged in with the
// temp password), so we send only the new password; the server clears the
// must_change_password flag. On success we drop the local flag and route on.

(function () {
  if (typeof checkAuth === 'function') checkAuth();

  var form = document.getElementById('cp-form');
  var pw   = document.getElementById('cp-new');
  var cpw  = document.getElementById('cp-confirm');
  var err  = document.getElementById('cp-error');
  var btn  = document.getElementById('cp-btn');

  if (typeof PasswordPolicy !== 'undefined') {
    PasswordPolicy.attachMeter(pw, document.getElementById('pw-meter'));
  }

  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    err.textContent = '';
    var a = pw.value, b = cpw.value;
    var chk = (typeof PasswordPolicy !== 'undefined')
      ? PasswordPolicy.validate(a)
      : { ok: a.length >= 12, message: 'Password must be at least 12 characters.' };
    if (!chk.ok)  { err.textContent = chk.message; return; }
    if (a !== b)  { err.textContent = 'Passwords do not match.'; return; }

    btn.disabled = true;
    var res = await changePassword({ newPassword: a });
    if (res && res.success) {
      try { localStorage.setItem('mustChangePassword', '0'); } catch (_) {}
      var role = 'cashier';
      try { var ent = getEntitlements(); if (ent && ent.role) role = ent.role; } catch (_) {}
      window.location.href = role === 'cashier' ? 'order.html' : 'dashboard.html';
    } else {
      err.textContent = res ? res.message : 'Could not update your password.';
      btn.disabled = false;
    }
  });
})();
