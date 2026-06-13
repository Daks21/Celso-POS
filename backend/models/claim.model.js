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

// The store's most recent claim, ANY status — powers the owner-facing outcome
// banner (e.g. "your last payment was rejected: <note>"), which findPendingByStore
// can't show because a reviewed claim is no longer pending.
const findLatestByStore = async (storeId) => {
  const [rows] = await db.query(
    'SELECT * FROM payment_claims WHERE store_id = ? ORDER BY id DESC LIMIT 1',
    [storeId]
  );
  return rows[0] || null;
};

// Update the store's single PENDING claim in place — lets the owner fix a typo'd
// reference (or switch plan) before the operator reviews it, without burning the
// one-pending-claim slot. Scoped to status='pending' so a claim the operator just
// approved can't be edited out from under them (affectedRows 0 = lost that race).
const updatePending = async (storeId, { plan, amount_php, gcash_ref }) => {
  const [r] = await db.query(
    "UPDATE payment_claims SET plan = ?, amount_php = ?, gcash_ref = ? WHERE store_id = ? AND status = 'pending'",
    [plan, amount_php, gcash_ref, storeId]
  );
  return r.affectedRows;
};

// Withdraw the store's pending claim. Hard delete (not a status flip) so the
// gcash_ref is freed for reuse — the status enum has no 'canceled', and a
// withdrawn-before-review claim has no audit value. Scoped to status='pending'.
const deletePending = async (storeId) => {
  const [r] = await db.query(
    "DELETE FROM payment_claims WHERE store_id = ? AND status = 'pending'",
    [storeId]
  );
  return r.affectedRows;
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

module.exports = {
  findById, create, findPendingByStore, findByRef, findLatestByStore,
  updatePending, deletePending, listForAdmin,
};
