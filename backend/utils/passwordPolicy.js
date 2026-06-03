// backend/utils/passwordPolicy.js — single source of truth for the password rule,
// enforced server-side on EVERY entry point that sets a password (register,
// self-service change, cashier create, cashier reset). The frontend mirrors this
// in js/core/password-policy.js for UX, but the server is authoritative.
//
// Policy (NIST 800-63B aligned): length is the lever, not composition. We require
// a 12-char minimum and screen against a common/breached blocklist, but do NOT
// mandate symbol/character-class mixes (those breed predictable patterns and hurt
// usability for our mobile MSME users). Existing accounts are grandfathered — the
// rule only runs when a password is set or changed.

const COMMON = require('../config/common-passwords');

const MIN_LENGTH = 12;
const TOO_SHORT  = `Password must be at least ${MIN_LENGTH} characters.`;
const TOO_COMMON = 'That password is too common — pick something less guessable.';

// Strip a trailing/leading run of non-letters so "Password123!" reduces to its
// guessable base "password" before we check the blocklist.
function baseOf(lower) {
  return lower.replace(/[^a-z]+$/, '').replace(/^[^a-z]+/, '');
}

function isCommon(pw) {
  const lower = pw.toLowerCase();
  if (COMMON.has(lower)) return true;
  const base = baseOf(lower);
  if (base.length >= 4 && COMMON.has(base)) return true;
  return /^(.)\1+$/.test(pw);   // all one repeated character (aaaaaaaaaaaa, 000000000000)
}

// Returns { ok:true } or { ok:false, message } — callers send the message as a 400.
function validatePassword(pw) {
  if (typeof pw !== 'string' || pw.length < MIN_LENGTH) {
    return { ok: false, message: TOO_SHORT };
  }
  if (isCommon(pw)) {
    return { ok: false, message: TOO_COMMON };
  }
  return { ok: true };
}

module.exports = { MIN_LENGTH, validatePassword };
