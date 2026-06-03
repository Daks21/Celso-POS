// frontend/js/core/password-policy.js — client mirror of the server password
// policy (backend/utils/passwordPolicy.js). UX only: instant inline validation +
// an optional strength meter. The server re-validates every submission with the
// full blocklist and is the real authority; this just avoids a round-trip and
// gives live feedback while typing.

window.PasswordPolicy = (function () {
  var MIN_LENGTH = 12;

  // Compact subset of the server blocklist (lowercase bases) — enough for live
  // feedback on the obvious weak ones; the server catches the rest on submit.
  var COMMON = {};
  [
    'password', 'passw0rd', 'p@ssword', 'p@ssw0rd', 'passpass', 'qwerty',
    'qwertyuiop', 'qwerty123', 'qweasdzxc', 'qazwsx', '1q2w3e4r', 'asdfghjkl',
    'zxcvbnm', '123456', '12345678', '123456789', '1234567890', '123456789012',
    '11111111', '00000000', '121212', '123123', 'abc123', 'abcd1234', 'iloveyou',
    'letmein', 'welcome', 'hello', 'whatever', 'trustno1', 'sunshine', 'princess',
    'monkey', 'dragon', 'master', 'shadow', 'superman', 'batman', 'football',
    'baseball', 'basketball', 'admin', 'administrator', 'root', 'guest', 'login',
    'changeme', 'default', 'test', 'testing', 'computer', 'internet', 'google',
    'facebook', 'pilipinas', 'philippines', 'mahalkita', 'tindahan', 'jollibee',
    'pinoy', 'manila'
  ].forEach(function (w) { COMMON[w] = true; });

  function baseOf(lower) {
    return lower.replace(/[^a-z]+$/, '').replace(/^[^a-z]+/, '');
  }

  function isCommon(pw) {
    var lower = pw.toLowerCase();
    if (COMMON[lower]) return true;
    var base = baseOf(lower);
    if (base.length >= 4 && COMMON[base]) return true;
    return /^(.)\1+$/.test(pw);
  }

  // { ok:true } | { ok:false, message }
  function validate(pw) {
    if (typeof pw !== 'string' || pw.length < MIN_LENGTH) {
      return { ok: false, message: 'Password must be at least ' + MIN_LENGTH + ' characters.' };
    }
    if (isCommon(pw)) {
      return { ok: false, message: 'That password is too common — pick something less guessable.' };
    }
    return { ok: true, message: '' };
  }

  // 0..4 score for the meter. Length carries the most weight; variety nudges it
  // up but is never required. A common/breached password is capped at "Weak".
  function strength(pw) {
    pw = pw || '';
    if (!pw) return { score: 0, label: '', pct: 0 };
    var score = 0;
    if (pw.length >= MIN_LENGTH) score++;
    if (pw.length >= 16) score++;
    if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++;
    if (/\d/.test(pw)) score++;
    if (/[^A-Za-z0-9]/.test(pw)) score++;
    if (isCommon(pw)) score = Math.min(score, 1);
    if (pw.length < MIN_LENGTH) score = Math.min(score, 1);
    score = Math.max(0, Math.min(score, 4));
    var labels = ['Very weak', 'Weak', 'Fair', 'Good', 'Strong'];
    return { score: score, label: labels[score], pct: (score / 4) * 100 };
  }

  // Wire a password <input> to a meter element built by ensureMeter(). No-op if
  // either is missing, so it's safe to call on pages without a meter.
  function attachMeter(input, meter) {
    if (!input || !meter) return;
    var fill  = meter.querySelector('.pw-meter-fill');
    var label = meter.querySelector('.pw-meter-label');
    input.addEventListener('input', function () {
      var v = input.value || '';
      if (!v) { meter.classList.remove('is-on'); return; }
      var s = strength(v);
      meter.classList.add('is-on');
      meter.className = 'pw-meter is-on pw-meter--' + s.score;
      if (fill)  fill.style.width = s.pct + '%';
      if (label) label.textContent = s.label;
    });
  }

  return {
    MIN_LENGTH: MIN_LENGTH,
    validate: validate,
    strength: strength,
    attachMeter: attachMeter,
  };
})();
