// scripts/cleanup-test-cashiers.js — remove leftover test cashiers from store 1.
//
// Deletes cashier accounts in store 1 that have NO sales (so the FK from
// sales.cashier_id is never violated, and any cashier with real history — e.g.
// the seed cashier — is preserved). One-off dev cleanup.

const fs = require('fs');
const path = require('path');

// Load backend/.env into process.env so db.config can connect.
const envPath = path.join(__dirname, '..', 'backend', '.env');
fs.readFileSync(envPath, 'utf8').split(/\r?\n/).forEach(line => {
  if (/^\s*#/.test(line)) return;
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
  if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
});

const db = require(path.join(__dirname, '..', 'backend', 'config', 'db.config'));

(async () => {
  const [[before]] = await db.query(
    "SELECT COUNT(*) AS c FROM users WHERE store_id = 1 AND role = 'cashier'"
  );
  const [res] = await db.query(
    "DELETE FROM users WHERE store_id = 1 AND role = 'cashier' " +
    "AND id NOT IN (SELECT DISTINCT cashier_id FROM sales)"
  );
  const [[after]]  = await db.query("SELECT COUNT(*) AS c FROM users WHERE store_id = 1 AND role = 'cashier'");
  const [[active]] = await db.query("SELECT COUNT(*) AS c FROM users WHERE store_id = 1 AND role = 'cashier' AND is_active = 1");
  console.log(`cashiers before: ${before.c} | deleted (no sales): ${res.affectedRows} | remaining: ${after.c} | active: ${active.c}`);
  await db.end();
})().catch(e => { console.error('cleanup error:', e.message); process.exit(1); });
