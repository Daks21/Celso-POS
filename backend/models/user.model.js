const db = require('../config/db.config');

const findByEmail = async (email) => {
  const [rows] = await db.query(
    `SELECT id, full_name AS fullName, email, password, role,
            store_id AS storeId, is_active AS isActive,
            must_change_password AS mustChangePassword, created_at AS createdAt
       FROM users WHERE email = ?`,
    [email]
  );
  return rows[0] || null;
};

const findById = async (id) => {
  const [rows] = await db.query(
    `SELECT id, full_name AS fullName, email, role, store_id AS storeId,
            is_active AS isActive, must_change_password AS mustChangePassword,
            created_at AS createdAt
       FROM users WHERE id = ?`,
    [id]
  );
  return rows[0] || null;
};

// Create a user scoped to a store. storeId is required (every user belongs to a
// store). Used by the Team page (cashiers) and any non-transactional creation;
// owner-admin signup creates its store + user together in auth.controller.
const createUser = async ({ fullName, email, password, role = 'cashier',
                            storeId, mustChangePassword = 0 }) => {
  const [result] = await db.query(
    `INSERT INTO users (full_name, email, password, role, store_id, is_active, must_change_password)
     VALUES (?, ?, ?, ?, ?, 1, ?)`,
    [fullName, email, password, role, storeId, mustChangePassword ? 1 : 0]
  );
  return findById(result.insertId);
};

// Total account count. Used at registration to detect the very first account
// (the store owner), who is auto-promoted to admin.
const countUsers = async () => {
  const [rows] = await db.query('SELECT COUNT(*) AS count FROM users');
  return rows[0].count;
};

const getPreferences = async (userId) => {
  const [rows] = await db.query(
    'SELECT preferences FROM users WHERE id = ?',
    [userId]
  );
  if (!rows[0] || !rows[0].preferences) return {};
  const raw = rows[0].preferences;
  try {
    return typeof raw === 'object' ? raw : JSON.parse(raw);
  } catch {
    return {};
  }
};

const savePreferences = async (userId, prefs) => {
  await db.query(
    'UPDATE users SET preferences = ? WHERE id = ?',
    [JSON.stringify(prefs), userId]
  );
};

// ── Single active session (Phase 6.5) ──

// Store the id of the user's most recent login (rotated on every login). Used by
// auth.middleware to reject tokens from a device that's been superseded.
const setSessionId = async (userId, sessionId) => {
  await db.query('UPDATE users SET session_id = ? WHERE id = ?', [sessionId, userId]);
};

// The fields auth.middleware needs per request: the current session id + whether
// the account is still active (so a just-suspended user is kicked immediately).
const getSessionInfo = async (userId) => {
  const [rows] = await db.query(
    'SELECT session_id AS sessionId, is_active AS isActive FROM users WHERE id = ?',
    [userId]
  );
  return rows[0] || null;
};

// ── Cashier seats (Phase 6.5) ──

const countActiveCashiers = async (storeId) => {
  const [rows] = await db.query(
    "SELECT COUNT(*) AS count FROM users WHERE store_id = ? AND role = 'cashier' AND is_active = 1",
    [storeId]
  );
  return rows[0].count;
};

// Reconcile a store's active cashiers to its current seat allowance after a
// billing change. Over the limit (downgrade) → suspend the most-recently-created
// excess (rows + history are KEPT, just is_active=0). Under the limit (re-upgrade)
// → reactivate the oldest suspended cashiers up to the allowance. The owner-admin
// is role='admin' and is never touched. Returns { suspended, reactivated }.
const reconcileCashierSeats = async (storeId, maxSeats) => {
  const seats = Math.max(0, Number(maxSeats) || 0);

  const [active] = await db.query(
    "SELECT id FROM users WHERE store_id = ? AND role = 'cashier' AND is_active = 1 ORDER BY created_at DESC, id DESC",
    [storeId]
  );

  if (active.length > seats) {
    const toSuspend = active.slice(0, active.length - seats).map(r => r.id);
    await db.query(
      `UPDATE users SET is_active = 0 WHERE id IN (${toSuspend.map(() => '?').join(',')})`,
      toSuspend
    );
    return { suspended: toSuspend.length, reactivated: 0 };
  }

  if (active.length < seats) {
    const room = seats - active.length;
    const [suspended] = await db.query(
      "SELECT id FROM users WHERE store_id = ? AND role = 'cashier' AND is_active = 0 ORDER BY created_at ASC, id ASC LIMIT ?",
      [storeId, room]
    );
    if (suspended.length) {
      const toReactivate = suspended.map(r => r.id);
      await db.query(
        `UPDATE users SET is_active = 1 WHERE id IN (${toReactivate.map(() => '?').join(',')})`,
        toReactivate
      );
      return { suspended: 0, reactivated: toReactivate.length };
    }
  }

  return { suspended: 0, reactivated: 0 };
};

module.exports = {
  findByEmail, findById, createUser, countUsers, getPreferences, savePreferences,
  setSessionId, getSessionInfo,
  countActiveCashiers, reconcileCashierSeats,
};
