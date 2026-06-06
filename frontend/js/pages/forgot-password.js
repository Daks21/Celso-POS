// frontend/js/pages/forgot-password.js — public password-recovery request (Phase 6.7).
// Collects email + mobile + place of birth (+ optional history) and posts to the
// public endpoint. The server ALWAYS returns the same generic message regardless of
// whether the account exists, so we just show that message and swap to the done
// panel — we never reveal a hit/miss to the visitor.

(function () {
  var form  = document.getElementById('forgot-form');
  if (!form) return;

  var email = document.getElementById('fp-email');
  var mobile = document.getElementById('fp-mobile');
  var pob   = document.getElementById('fp-pob');
  var history = document.getElementById('fp-history');
  var err   = document.getElementById('fp-error');
  var btn   = document.getElementById('fp-submit');
  var done  = document.getElementById('fp-done');
  var doneMsg = document.getElementById('fp-done-msg');

  var emailErr  = document.getElementById('fp-email-error');
  var mobileErr = document.getElementById('fp-mobile-error');
  var pobErr    = document.getElementById('fp-pob-error');

  function clearErrors() {
    err.textContent = '';
    emailErr.textContent = '';
    mobileErr.textContent = '';
    pobErr.textContent = '';
  }

  function isValidPhMobile(m) {
    var d = String(m).replace(/[\s()\-]/g, '');
    return /^09\d{9}$/.test(d) || /^\+639\d{9}$/.test(d);
  }

  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    clearErrors();

    var emailVal  = email.value.trim();
    var mobileVal = mobile.value.trim();
    var pobVal    = pob.value.trim();
    var hist      = history.value.trim();

    var bad = false;
    if (!emailVal || emailVal.indexOf('@') === -1) { emailErr.textContent = 'Enter a valid email address.'; bad = true; }
    if (!mobileVal) { mobileErr.textContent = 'Mobile number is required.'; bad = true; }
    else if (!isValidPhMobile(mobileVal)) { mobileErr.textContent = 'Enter a valid mobile number (e.g. 09171234567).'; bad = true; }
    if (!pobVal) { pobErr.textContent = 'Place of birth is required.'; bad = true; }
    if (bad) return;

    btn.disabled = true;
    var res;
    try {
      res = await forgotPassword({ email: emailVal, mobile: mobileVal, securityAnswer: pobVal, historyAnswers: hist });
    } catch (_) {
      err.textContent = "Couldn't reach the server — check your connection and try again.";
      btn.disabled = false;
      return;
    }

    // Server always responds generic on success; show the message and the done panel.
    if (res && res.success) {
      doneMsg.textContent = res.message || "If that account exists, we'll contact your registered mobile number.";
      form.style.display = 'none';
      done.style.display = 'block';
    } else {
      err.textContent = (res && res.message) || 'Something went wrong. Please try again.';
      btn.disabled = false;
    }
  });
})();
