const db = require('../config/db.config');

// payment_claims — the manual GCash billing ledger (Phase 6.6). Verify-first: a
// claim is created `pending` and only the platform super-admin flips it to
// approved/rejected (admin.controller, in a transaction). A gcash_ref is globally
// unique (claimed once, ever) — the UNIQUE index is the hard guard; findByRef is
// a friendly pre-check.

const findById = async (id) => {
  const [rows] = await db.query('SELECT * FROM payment_claims WHERE id = ?', [id]);
  return rows[0] || null;
};

const create = async ({ store_id, plan, amount_php, gcash_ref, submitted_by }) => {
  const [r] = await db.query(
    `INSERT INTO payment_claims (store_id, plan, amount_php, gcash_ref, submitted_by)
     VALUES (?, ?, ?, ?, ?)`,
    [store_id, plan, amount_php, gcash_ref, submitted_by]
  );
  return findById(r.insertId);
};

// The single open claim a store may have at a time (verify-first blocks a second
// submission while one is still pending).
const findPendingByStore = async (storeId) => {
  const [rows] = await db.query(
    "SELECT * FROM payment_claims WHERE store_id = ? AND status = 'pending' ORDER BY id DESC LIMIT 1",
    [storeId]
  );
  return rows[0] || null;
};

const findByRef = async (gcashRef) => {
  const [rows] = await db.query('SELECT * FROM payment_claims WHERE gcash_ref = ?', [gcashRef]);
  return rows[0] || null;
};

// Operator list: claims joined to their store + submitting owner for display.
// Optional status filter; pending first, then newest first.
const listForAdmin = async ({ status } = {}) => {
  const where  = status ? 'WHERE c.status = ?' : '';
  const params = status ? [status] : [];
  const [rows] = await db.query(
    `SELECT c.*, s.name AS store_name,
            u.email AS owner_email, u.full_name AS owner_name
       FROM payment_claims c
       JOIN stores s     ON s.id = c.store_id
       LEFT JOIN users u ON u.id = c.submitted_by
       ${where}
       ORDER BY (c.status = 'pending') DESC, c.submitted_at DESC`,
    params
  );
  return rows;
};

module.exports = { findById, create, findPendingByStore, findByRef, listForAdmin };
