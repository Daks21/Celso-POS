// backend/scripts/migrate-staff-handles.js
//
// One-off migration (Phase 7 identity hardening): convert EXISTING cashiers who
// still hold a real email into store-scoped login handles (username@s<storeId>.celso),
// freeing those real emails so the people who own them can register their own store.
//
// Safe by design:
//   • Only touches role='cashier' rows whose email is NOT already a handle.
//   • UPDATE only (never DELETE) — sales.cashier_id ON DELETE RESTRICT is irrelevant.
//   • Per-store username uniqueness; on a collision it appends -2, -3, …
//   • Prints an OLD -> NEW table so the owner can re-share each staffer's new login.
//   • Cashier passwords are unchanged; only the login id (email column) changes.
//
// USAGE (from backend/, with the target DB in .env / env):
//   node scripts/migrate-staff-handles.js --dry-run     # preview, write nothing
//   node scripts/migrate-staff-handles.js               # apply
//
// Re-runnable: already-migrated cashiers are skipped (idempotent).

require('dotenv').config();
const pool = require('../config/db.config');
const { isStaffHandle, buildStaffHandle, sanitizeUsername } = require('../utils/staffHandle');

const DRY_RUN = process.argv.includes('--dry-run');

// Turn an arbitrary email local-part (or full name) into a valid username, using
// the same sanitizer the live create path uses. Falls back to the full name, then
// to 'cashier', so there is always a usable >=2-char base.
function deriveUsername(localPart, fullName) {
  let u = sanitizeUsername(localPart);
  if (u.length < 2) u = sanitizeUsername(fullName);
  if (u.length < 2) u = 'cashier';
  return u;
}

(async () => {
  try {
    const [cashiers] = await pool.query(
      "SELECT id, full_name, email, store_id FROM users WHERE role = 'cashier' ORDER BY store_id, id"
    );

    const toMigrate = cashiers.filter((c) => !isStaffHandle(c.email));
    if (!toMigrate.length) {
      console.log('Nothing to migrate — every cashier already uses a store handle.');
      return process.exit(0);
    }

    console.log(`${DRY_RUN ? '[DRY RUN] ' : ''}Migrating ${toMigrate.length} cashier login(s):\n`);
    const rows = [];

    for (const c of toMigrate) {
      const base = deriveUsername(String(c.email).split('@')[0], c.full_name);
      // Find a free handle in this store (base, base-2, base-3, …).
      let username = base, handle = buildStaffHandle(username, c.store_id), n = 1;
      // eslint-disable-next-line no-await-in-loop
      while ((await pool.query('SELECT id FROM users WHERE email = ?', [handle]))[0].length) {
        n += 1;
        username = `${base}-${n}`.slice(0, 30);
        handle = buildStaffHandle(username, c.store_id);
      }

      if (!DRY_RUN) {
        // eslint-disable-next-line no-await-in-loop
        await pool.query('UPDATE users SET email = ? WHERE id = ?', [handle, c.id]);
      }
      rows.push({ id: c.id, store: c.store_id, name: c.full_name, oldEmail: c.email, newLogin: handle });
    }

    console.table(rows);
    console.log(`\n${DRY_RUN ? '[DRY RUN] no changes written.' : 'Done. Share each new login with the matching staffer.'}`);
    process.exit(0);
  } catch (err) {
    console.error('Migration failed:', err.message);
    process.exit(1);
  }
})();
