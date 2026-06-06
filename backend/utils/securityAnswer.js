// backend/utils/securityAnswer.js — Phase 6.7 helpers for the manual password
// recovery bridge. Single source of truth for (a) the security-question answer
// (place of birth) and (b) PH mobile-number handling.
//
// SECURITY: the security answer is a STORED SECRET, so it is bcrypt-hashed exactly
// like a password and NEVER kept in clear. We normalize before hashing/comparing
// (lowercase + trim + collapse inner whitespace) so harmless variations like
// "Cebu  City " and "cebu city" still match, without weakening the hash.

const bcrypt = require('bcrypt');

// Normalize a free-text answer for stable hashing/comparison.
function normalizeAnswer(s) {
  return String(s == null ? '' : s).trim().toLowerCase().replace(/\s+/g, ' ');
}

// Hash a normalized answer (same cost factor as passwords elsewhere: 10).
async function hashAnswer(answer) {
  return bcrypt.hash(normalizeAnswer(answer), 10);
}

// Compare a submitted answer against a stored hash. Returns false (never throws)
// when the hash is missing/blank so callers can treat it as a failed signal.
async function compareAnswer(answer, hash) {
  if (!hash) return false;
  try {
    return await bcrypt.compare(normalizeAnswer(answer), hash);
  } catch (_) {
    return false;
  }
}

// PH mobile: accept "09XXXXXXXXX" (11 digits) or "+639XXXXXXXXX". Strips spaces,
// dashes and parentheses first. Returns true/false.
function isValidPhMobile(input) {
  const digits = String(input == null ? '' : input).replace(/[\s()\-]/g, '');
  return /^09\d{9}$/.test(digits) || /^\+639\d{9}$/.test(digits);
}

// Canonical form for storage + matching: always "09XXXXXXXXX". Converts a valid
// "+639XXXXXXXXX" to its "09XXXXXXXXX" equivalent; returns null if not a valid PH
// mobile (so callers can reject). Used both at registration (store) and at request
// time (compare submitted vs on-file on equal footing).
function normalizePhMobile(input) {
  const digits = String(input == null ? '' : input).replace(/[\s()\-]/g, '');
  if (/^09\d{9}$/.test(digits)) return digits;
  if (/^\+639\d{9}$/.test(digits)) return '0' + digits.slice(3); // +639XXXXXXXXX -> 09XXXXXXXXX
  return null;
}

module.exports = {
  normalizeAnswer,
  hashAnswer,
  compareAnswer,
  isValidPhMobile,
  normalizePhMobile,
};
