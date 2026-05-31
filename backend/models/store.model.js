const db = require('../config/db.config');

// Store (tenant) row access. Every request resolves its store via findById in
// tenant.middleware; the Lemon Squeezy lookups + updateBilling back the billing
// webhook (Phase 6.5 §6). name/address/timezone live here now (per-store).

const findById = async (storeId) => {
  const [rows] = await db.query('SELECT * FROM stores WHERE id = ?', [storeId]);
  return rows[0] || null;
};

const findByLsCustomer = async (customerId) => {
  const [rows] = await db.query(
    'SELECT * FROM stores WHERE ls_customer_id = ?', [String(customerId)]
  );
  return rows[0] || null;
};

const findByLsSubscription = async (subscriptionId) => {
  const [rows] = await db.query(
    'SELECT * FROM stores WHERE ls_subscription_id = ?', [String(subscriptionId)]
  );
  return rows[0] || null;
};

// Partial update of billing columns from the LS webhook. Only the keys actually
// supplied are written (a webhook event may carry just a status change), so we
// never blank a column we didn't mean to touch. Column names come from a fixed
// allowlist — never from request data — so interpolating them is safe.
const updateBilling = async (storeId, fields) => {
  const ALLOWED = ['plan', 'subscription_status', 'trial_ends_at',
                   'ls_customer_id', 'ls_subscription_id'];
  const sets = [], vals = [];
  for (const key of ALLOWED) {
    if (key in fields) { sets.push(`${key} = ?`); vals.push(fields[key] ?? null); }
  }
  if (!sets.length) return findById(storeId);
  vals.push(storeId);
  await db.query(`UPDATE stores SET ${sets.join(', ')} WHERE id = ?`, vals);
  return findById(storeId);
};

const updateInfo = async (storeId, { name, address }) => {
  await db.query('UPDATE stores SET name = ?, address = ? WHERE id = ?',
    [name, address, storeId]);
  return findById(storeId);
};

const updateTimezone = async (storeId, timezone) => {
  await db.query('UPDATE stores SET timezone = ? WHERE id = ?', [timezone, storeId]);
  return findById(storeId);
};

module.exports = {
  findById, findByLsCustomer, findByLsSubscription,
  updateBilling, updateInfo, updateTimezone,
};
