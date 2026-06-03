const db = require('../config/db.config');

// platform_config — a single global row (id=1) holding the receiving GCash QR
// (stored as a data-URL in gcash_qr so it survives redeploys on an ephemeral
// filesystem) + the account name/number shown in the Upgrade modal. Managed by
// the platform super-admin in admin.html (Phase 6.6). Not tenant-scoped.

const get = async () => {
  const [rows] = await db.query('SELECT * FROM platform_config WHERE id = 1');
  return rows[0] || null;
};

// Partial update — only the supplied keys are written. Column names come from a
// fixed allowlist (never request data), so interpolating them is safe.
const update = async (fields) => {
  const ALLOWED = ['gcash_qr', 'gcash_name', 'gcash_number'];
  const sets = [], vals = [];
  for (const key of ALLOWED) {
    if (key in fields) { sets.push(`${key} = ?`); vals.push(fields[key] ?? null); }
  }
  if (sets.length) {
    await db.query(`UPDATE platform_config SET ${sets.join(', ')} WHERE id = 1`, vals);
  }
  return get();
};

// Public image URL for the stored QR (served by GET /api/billing/qr). Returns
// null when no QR is set. The ?v cache-buster changes when the QR is replaced
// (updated_at), so browsers refetch a new QR without a stale cache.
const qrUrl = (cfg) => {
  if (!cfg || !cfg.gcash_qr) return null;
  const v = cfg.updated_at ? new Date(cfg.updated_at).getTime() : 1;
  return '/api/billing/qr?v=' + v;
};

module.exports = { get, update, qrUrl };
