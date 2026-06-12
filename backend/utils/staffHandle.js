// Staff (cashier) login handles — Phase 7 identity hardening.
//
// Cashiers are STORE-LOCAL sub-accounts whose credentials are admin-managed (the
// owner sets/resets the password; no verification email is ever sent to them).
// They used to consume a real, GLOBALLY-UNIQUE email, which meant a cashier login
// could permanently squat on a real person's address and block THAT person from
// ever registering their own store. We instead give cashiers a store-scoped login
// HANDLE that lives in a reserved namespace a real email can never occupy:
//
//     <username>@s<storeId>.celso          e.g.  juan@s21.celso
//
// The handle is still stored in users.email, so login and UNIQUE(email) are
// unchanged. Because owner registration REJECTS the reserved suffix, the two
// namespaces can never collide again. Two different stores can each have a "juan"
// (juan@s21.celso vs juan@s32.celso) — uniqueness is per-store by construction.

const RESERVED_SUFFIX = '.celso';     // host suffix reserved for staff handles

// Allowed username: 2–30 chars, lowercase a–z / 0–9 plus . _ - , and it must
// start AND end alphanumeric (no leading/trailing punctuation, no '@', no spaces).
const USERNAME_RE = /^[a-z0-9](?:[a-z0-9._-]{0,28}[a-z0-9])?$/;

// Normalize free input to a candidate username: trim + lowercase.
function normalizeUsername(input) {
  return String(input == null ? '' : input).trim().toLowerCase();
}

function validateUsername(input) {
  const u = normalizeUsername(input);
  if (!u)              return { ok: false, message: 'Username is required.' };
  if (u.length < 2)    return { ok: false, message: 'Username must be at least 2 characters.' };
  if (u.length > 30)   return { ok: false, message: 'Username must be 30 characters or fewer.' };
  if (u.includes('@')) return { ok: false, message: "Username can't contain '@' — it's a name, not an email." };
  if (!USERNAME_RE.test(u)) {
    return { ok: false, message: 'Use letters, numbers, dot, underscore, or hyphen (start and end with a letter or number).' };
  }
  return { ok: true, username: u };
}

// Build the store-scoped login handle stored in users.email.
function buildStaffHandle(username, storeId) {
  return `${normalizeUsername(username)}@s${parseInt(storeId, 10)}${RESERVED_SUFFIX}`;
}

// True if an address is a reserved staff handle (its host ends with the reserved
// suffix). Used to (a) block owners from registering one, and (b) let the UI tell
// a handle apart from a legacy real-email cashier.
function isStaffHandle(email) {
  const at = String(email == null ? '' : email).lastIndexOf('@');
  if (at === -1) return false;
  return String(email).slice(at + 1).toLowerCase().endsWith(RESERVED_SUFFIX);
}

module.exports = {
  RESERVED_SUFFIX, normalizeUsername, validateUsername, buildStaffHandle, isStaffHandle,
};
