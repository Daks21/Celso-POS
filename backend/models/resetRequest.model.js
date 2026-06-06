const db = require('../config/db.config');

// password_reset_requests — the manual recovery ledger (Phase 6.7). Verify-first,
// mirroring claim.model: a request is created `pending` and only the platform
// super-admin advances it (admin.controller, in a transaction). We persist MATCH
// BOOLEANS (mobile_match / answer_match) and the free-text history answers — never
// the raw place-of-birth secret. Dedupe of OPEN requests is enforced in code
// (findOpenByEmail), not a UNIQUE index, since the same email may legitimately have
// several historical (closed) requests.
//
// 'expired' is DERIVED for display: a row stays status='approved' in the DB until an
// action touches it, but an approved code past its expiry is surfaced as expired via
// the effective_status CASE below (and login independently refuses it). This keeps
// the operator board honest without a cron job.

const EFFECTIVE_STATUS = `
  CASE
    WHEN r.status = 'approved' AND r.code_expires_at IS NOT NULL AND r.code_expires_at < NOW()
      THEN 'expired'
    ELSE r.status
  END`;

const findById = async (id) => {
  const [rows] = await db.query('SELECT * FROM password_reset_requests WHERE id = ?', [id]);
  return rows[0] || null;
};

const create = async ({ email, submitted_mobile, mobile_match, answer_match,
                        history_answers, user_id, store_id }) => {
  const [r] = await db.query(
    `INSERT INTO password_reset_requests
       (email, submitted_mobile, mobile_match, answer_match, history_answers, user_id, store_id)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [email, submitted_mobile, mobile_match ? 1 : 0, answer_match ? 1 : 0,
     history_answers || null, user_id || null, store_id || null]
  );
  return findById(r.insertId);
};

// The single OPEN request an email may have at a time (dedupe — blocks a second
// pending submission while one is still awaiting review).
const findOpenByEmail = async (email) => {
  const [rows] = await db.query(
    "SELECT * FROM password_reset_requests WHERE email = ? AND status = 'pending' ORDER BY id DESC LIMIT 1",
    [email]
  );
  return rows[0] || null;
};

// Count requests for an email since a cutoff — backs the per-email/day abuse cap on
// the public endpoint.
const countByEmailSince = async (email, since) => {
  const [rows] = await db.query(
    'SELECT COUNT(*) AS n FROM password_reset_requests WHERE email = ? AND submitted_at >= ?',
    [email, since]
  );
  return rows[0].n;
};

// Operator list: requests joined to the matched owner + store for display, with the
// ON-FILE mobile (the only number the operator may deliver to) and a 90-day
// frequency count (account-takeover signal). `status` filter:
//   'pending'  -> awaiting review
//   'approved' -> code issued AND still valid (the "Pending Login" board column)
//   'done'     -> completed | rejected | (approved but expired)
//   undefined  -> everything
const listForAdmin = async ({ status } = {}) => {
  let where = '';
  const params = [];
  if (status === 'pending') {
    where = "WHERE r.status = 'pending'";
  } else if (status === 'approved') {
    where = "WHERE r.status = 'approved' AND (r.code_expires_at IS NULL OR r.code_expires_at >= NOW())";
  } else if (status === 'done') {
    where = "WHERE r.status IN ('completed','rejected') OR (r.status = 'approved' AND r.code_expires_at < NOW())";
  }
  const [rows] = await db.query(
    `SELECT r.*, ${EFFECTIVE_STATUS} AS effective_status,
            u.full_name AS owner_name, u.email AS owner_email,
            u.role AS owner_role, u.mobile AS onfile_mobile,
            s.name AS store_name,
            (SELECT COUNT(*) FROM password_reset_requests r2
              WHERE r2.email = r.email AND r2.submitted_at >= NOW() - INTERVAL 90 DAY) AS freq90
       FROM password_reset_requests r
       LEFT JOIN users  u ON u.id = r.user_id
       LEFT JOIN stores s ON s.id = r.store_id
       ${where}
       ORDER BY (r.status = 'pending') DESC, r.submitted_at DESC`,
    params
  );
  return rows;
};

// Past requests for one email — the modal's frequency drill-down.
const historyForEmail = async (email) => {
  const [rows] = await db.query(
    `SELECT id, ${EFFECTIVE_STATUS} AS effective_status, status, submitted_at,
            reviewed_at, review_note, mobile_match, answer_match
       FROM password_reset_requests r
      WHERE r.email = ?
      ORDER BY r.submitted_at DESC
      LIMIT 50`,
    [email]
  );
  return rows;
};

// Stamp a review outcome (approve/regenerate/reject). Caller passes only the fields
// it sets; the rest stay as-is.
const markReviewed = async (id, { status, reviewed_by, review_note = null,
                                  code_issued_at = null, code_expires_at = null }) => {
  await db.query(
    `UPDATE password_reset_requests
        SET status = ?, reviewed_by = ?, reviewed_at = NOW(),
            review_note = ?, code_issued_at = ?, code_expires_at = ?
      WHERE id = ?`,
    [status, reviewed_by, review_note, code_issued_at, code_expires_at, id]
  );
  return findById(id);
};

// Advance the user's most recent APPROVED request to 'completed' once they finish the
// forced password change. No-op if none is open. Returns affected row count.
const markCompletedForUser = async (userId) => {
  const [r] = await db.query(
    `UPDATE password_reset_requests
        SET status = 'completed', completed_at = NOW()
      WHERE user_id = ? AND status = 'approved'
      ORDER BY id DESC
      LIMIT 1`,
    [userId]
  );
  return r.affectedRows;
};

const countPending = async () => {
  const [rows] = await db.query("SELECT COUNT(*) AS n FROM password_reset_requests WHERE status = 'pending'");
  return rows[0].n;
};

module.exports = {
  findById, create, findOpenByEmail, countByEmailSince,
  listForAdmin, historyForEmail, markReviewed, markCompletedForUser, countPending,
};
