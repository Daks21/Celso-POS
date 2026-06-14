const db = require('../config/db.config');

// support_tickets — a one-way issue inbox (Phase 6.7). An owner submits free text
// from Account Settings; the row is AUTO-TAGGED with the submitting user_id +
// store_id (taken from the session, never the client body). The platform
// super-admin reads them in admin.html and can mark them closed. No reply thread
// for v1.

const findById = async (id) => {
  const [rows] = await db.query('SELECT * FROM support_tickets WHERE id = ?', [id]);
  return rows[0] || null;
};

const create = async ({ store_id, user_id, category, message }) => {
  const [r] = await db.query(
    `INSERT INTO support_tickets (store_id, user_id, category, message)
     VALUES (?, ?, ?, ?)`,
    [store_id, user_id, category || 'other', message]
  );
  return findById(r.insertId);
};

// Operator list: tickets joined to the submitter + store for display. Optional
// status filter; newest first. Also pulls the store's billing columns (so the
// controller can resolve the live paid tier for the priority inbox) and the
// store OWNER's contact (full_name/email/mobile) — the call-back target, since a
// submitting cashier usually has no reachable number / only a fake store handle.
const listForAdmin = async ({ status } = {}) => {
  const where  = (status === 'open' || status === 'closed') ? 'WHERE t.status = ?' : '';
  const params = where ? [status] : [];
  const [rows] = await db.query(
    `SELECT t.*,
            u.full_name AS user_name, u.email AS user_email,
            s.name AS store_name,
            s.plan AS store_plan, s.subscription_status AS store_sub_status,
            s.paid_until AS store_paid_until,
            o.full_name AS owner_name, o.email AS owner_email, o.mobile AS owner_mobile
       FROM support_tickets t
       LEFT JOIN users  u ON u.id = t.user_id
       LEFT JOIN stores s ON s.id = t.store_id
       LEFT JOIN users  o ON o.id = s.owner_user_id
       ${where}
       ORDER BY t.created_at DESC`,
    params
  );
  return rows;
};

const close = async (id, closedBy) => {
  await db.query(
    "UPDATE support_tickets SET status = 'closed', closed_by = ?, closed_at = NOW() WHERE id = ?",
    [closedBy, id]
  );
  return findById(id);
};

// Open-ticket count for the operator bell badge.
const countOpen = async () => {
  const [rows] = await db.query("SELECT COUNT(*) AS n FROM support_tickets WHERE status = 'open'");
  return rows[0].n;
};

// Open tickets for one store — backs the per-store submission cap (anti-spam).
const countOpenByStore = async (storeId) => {
  const [rows] = await db.query(
    "SELECT COUNT(*) AS n FROM support_tickets WHERE store_id = ? AND status = 'open'",
    [storeId]
  );
  return rows[0].n;
};

// Tickets a store created since a cutoff — backs the per-store/day total cap, which
// (unlike the open cap) also bounds churn from repeatedly close→reopen flooding.
const countByStoreSince = async (storeId, since) => {
  const [rows] = await db.query(
    'SELECT COUNT(*) AS n FROM support_tickets WHERE store_id = ? AND created_at >= ?',
    [storeId, since]
  );
  return rows[0].n;
};

// Whether the store already submitted an IDENTICAL message recently — guards
// against accidental double-taps and rapid duplicate spam.
const existsRecentDuplicate = async (storeId, message, since) => {
  const [rows] = await db.query(
    'SELECT id FROM support_tickets WHERE store_id = ? AND message = ? AND created_at >= ? LIMIT 1',
    [storeId, message, since]
  );
  return rows.length > 0;
};

module.exports = {
  findById, create, listForAdmin, close, countOpen, countOpenByStore,
  countByStoreSince, existsRecentDuplicate,
};
