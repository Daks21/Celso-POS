const db = require('../config/db.config');

const findByEmail = async (email) => {
  const [rows] = await db.query(
    `SELECT id, full_name AS fullName, email, password, role,
            store_id AS storeId, is_active AS isActive,
            must_change_password AS mustChangePassword,
            pw_reset_expires_at AS pwResetExpiresAt, created_at AS createdAt
       FROM users WHERE email = ?`,
    [email]
  );
  return rows[0] || null;
};

// Recovery lookup (Phase 6.7): like findByEmail but also returns the on-file mobile
// and the hashed security answer, so the forgot-password handler can compute the
// match scorecard. Separate from findByEmail to keep the recovery-only secret
// (security_answer_hash) out of the general-purpose read.
const findByEmailForRecovery = async (email) => {
  const [rows] = await db.query(
    `SELECT id, full_name AS fullName, email, role, store_id AS storeId,
            is_active AS isActive, mobile, security_answer_hash AS securityAnswerHash
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
// auth.middleware to reject tokens from a device that's been superseded. Also
// stamps last_login_at (NOW() is UTC — the pool pins the session tz) for the
// operator activity stats. Called once per successful login.
const setSessionId = async (userId, sessionId) => {
  await db.query('UPDATE users SET session_id = ?, last_login_at = NOW() WHERE id = ?', [sessionId, userId]);
};

// The fields auth.middleware needs per request: the current session id + whether
// the account is still active (so a just-suspended user is kicked immediately).
const getSessionInfo = async (userId) => {
  const [rows] = await db.query(
    'SELECT session_id AS sessionId, is_active AS isActive, must_change_password AS mustChangePassword FROM users WHERE id = ?',
    [userId]
  );
  return rows[0] || null;
};

// ── Password recovery (Phase 6.7) ──
// NOTE: issuing a temp code (operator approve/regenerate) updates BOTH users and
// password_reset_requests atomically, so it is done in a transaction inside
// admin.controller (mirroring approveClaim) rather than via a pool helper here.

// Finalize a password change (normal self-service OR the forced post-reset change):
// set the new hash and clear the forced-change flag + any reset expiry. The CURRENT
// session is left valid on purpose (the caller is authenticated on the device that's
// changing the password, so no token swap is needed); other sessions were already
// invalidated when the temp code was issued (setTempPassword NULLs session_id).
const setPassword = async (userId, passwordHash) => {
  await db.query(
    `UPDATE users
        SET password = ?, must_change_password = 0, pw_reset_expires_at = NULL
      WHERE id = ?`,
    [passwordHash, userId]
  );
};

// Update owner recovery details (Account → Security & Recovery). Only the supplied
// fields change; pass already-hashed answer. Used to backfill grandfathered owners.
const setRecoveryInfo = async (userId, { mobile, securityAnswerHash }) => {
  const sets = [];
  const params = [];
  if (mobile !== undefined)             { sets.push('mobile = ?');               params.push(mobile); }
  if (securityAnswerHash !== undefined) { sets.push('security_answer_hash = ?'); params.push(securityAnswerHash); }
  if (!sets.length) return;
  params.push(userId);
  await db.query(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`, params);
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
  findByEmail, findByEmailForRecovery, findById, createUser,
  getPreferences, savePreferences,
  setSessionId, getSessionInfo,
  setPassword, setRecoveryInfo,
  countActiveCashiers, reconcileCashierSeats,
};
