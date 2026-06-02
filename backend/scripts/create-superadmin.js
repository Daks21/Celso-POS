// backend/scripts/create-superadmin.js — one-off: create THE platform super-admin.
//
// The super-admin is a user with NO tenant store (store_id NULL, role 'superadmin')
// who reviews manual GCash payment claims in admin.html. There is deliberately no
// signup path to this role — you seed it once with this script.
//
// Usage (PowerShell, run from the backend/ directory so deps + .env resolve):
//   $env:SUPERADMIN_EMAIL="you@example.com"; $env:SUPERADMIN_PASSWORD="a-long-random-password"; node scripts/create-superadmin.js
//   — or pass them as args —
//   node scripts/create-superadmin.js you@example.com "a-long-random-password"
//
// Refuses to run if a super-admin already exists. Log in normally afterwards;
// the client routes a superadmin to admin.html.

require('dotenv').config();
const bcrypt = require('bcrypt');
const pool   = require('../config/db.config');

(async () => {
  const email    = String(process.argv[2] || process.env.SUPERADMIN_EMAIL || '').trim().toLowerCase();
  const password = String(process.argv[3] || process.env.SUPERADMIN_PASSWORD || '');

  if (!email || !password) {
    console.error('Provide an email + password via args or SUPERADMIN_EMAIL / SUPERADMIN_PASSWORD.');
    process.exit(1);
  }
  if (password.length < 12) {
    console.error('Use a password of at least 12 characters for the platform operator.');
    process.exit(1);
  }

  try {
    const [existing] = await pool.query("SELECT id, email FROM users WHERE role = 'superadmin' LIMIT 1");
    if (existing.length) {
      console.error(`A super-admin already exists (id=${existing[0].id}, ${existing[0].email}). Refusing to create another.`);
      process.exit(1);
    }
    const [dupe] = await pool.query('SELECT id FROM users WHERE email = ?', [email]);
    if (dupe.length) {
      console.error('That email is already registered to another account.');
      process.exit(1);
    }

    const hash = await bcrypt.hash(password, 10);
    const [r] = await pool.query(
      `INSERT INTO users (store_id, full_name, email, password, role, is_active)
       VALUES (NULL, 'Platform Admin', ?, ?, 'superadmin', 1)`,
      [email, hash]
    );
    console.log(`Super-admin created: id=${r.insertId}, ${email}.`);
    console.log('Log in through the normal login form — you will land on admin.html.');
    process.exit(0);
  } catch (e) {
    console.error('Failed:', e.message);
    process.exit(1);
  }
})();
