// backend/controllers/admin.controller.js
//
// Phase 6.6 — platform OPERATOR side (super-admin only; routes add auth +
// requireSuperAdmin, never loadStore). Review manual GCash payment claims and
// manage the global receiving QR.
//
//   GET  /api/admin/claims?status=          list claims (pending first)
//   POST /api/admin/claims/:id/approve      activate the store (txn, anchored)
//   POST /api/admin/claims/:id/reject       reject with a note (no plan change)
//   GET  /api/admin/qr                      current GCash QR + name/number
//   POST /api/admin/qr                      replace QR image / name / number

const bcrypt         = require('bcrypt');
const crypto         = require('crypto');
const claimModel     = require('../models/claim.model');
const userModel      = require('../models/user.model');
const resetRequest   = require('../models/resetRequest.model');
const ticketModel    = require('../models/ticket.model');
const platformConfig = require('../models/platformConfig.model');
const pool           = require('../config/db.config');
const { resolveBilling, addOneMonth, cashierSeats, PLANS } = require('../config/plans');

// Phase 6.7 password recovery: temp code lifetime (must match the login expiry check).
const RESET_CODE_TTL_HOURS = 12;

// The QR is stored as a data-URL in the DB (platform_config.gcash_qr) so it
// survives redeploys on an ephemeral filesystem, and served as an image by the
// public GET /api/billing/qr route (billing.controller.qrImage).
const MAX_QR_BYTES = 500 * 1024;

// ── GET /api/admin/claims?status=pending|approved|rejected ─────────────────
const listClaims = async (req, res, next) => {
  try {
    const allowed = ['pending', 'approved', 'rejected'];
    const status  = allowed.includes(req.query.status) ? req.query.status : undefined;
    const rows = await claimModel.listForAdmin({ status });
    res.json({ success: true, data: rows });
  } catch (err) {
    next(err);
  }
};

// ── POST /api/admin/claims/:id/approve ─────────────────────────────────────
// Transactional + idempotent (FOR UPDATE on a still-pending claim) + anchored
// (renewal extends from the due date; a fresh upgrade starts now).
const approveClaim = async (req, res, next) => {
  const conn = await pool.getConnection();
  let released = false;
  let result = null;
  try {
    await conn.beginTransaction();

    const [claims] = await conn.query(
      "SELECT * FROM payment_claims WHERE id = ? AND status = 'pending' FOR UPDATE",
      [req.params.id]
    );
    const claim = claims[0];
    if (!claim) {
      await conn.rollback(); conn.release(); released = true;
      return res.status(409).json({ success: false, message: 'Claim is not pending (already reviewed?).' });
    }

    const [stores] = await conn.query('SELECT * FROM stores WHERE id = ? FOR UPDATE', [claim.store_id]);
    const store = stores[0];
    if (!store) {
      await conn.rollback(); conn.release(); released = true;
      return res.status(404).json({ success: false, message: 'Store not found.' });
    }

    // Anchor the new period.
    const now = new Date();
    const b   = resolveBilling(store, now);
    let base;
    if (b.state === 'active' || b.state === 'grace') base = new Date(store.paid_until);   // anchor to due date
    else                                             base = now;                           // free/lapsed: fresh start
    const periodEnd = addOneMonth(base);

    // Snapshot the store's billing BEFORE we overwrite it, so a mistaken approval
    // can be reverted exactly (incl. a tier change, where period_start alone can't
    // recover the prior plan). Stored on the claim as prev_billing JSON.
    const prevBilling = JSON.stringify({
      plan:                store.plan,
      subscription_status: store.subscription_status,
      paid_until:          store.paid_until,
      trial_ends_at:       store.trial_ends_at,
    });

    await conn.query(
      "UPDATE stores SET plan = ?, subscription_status = 'active', paid_until = ?, trial_ends_at = NULL WHERE id = ?",
      [claim.plan, periodEnd, store.id]
    );
    await conn.query(
      "UPDATE payment_claims SET status = 'approved', reviewed_by = ?, reviewed_at = NOW(), period_start = ?, period_end = ?, prev_billing = ? WHERE id = ?",
      [req.user.id, base, periodEnd, prevBilling, claim.id]
    );

    await conn.commit();
    result = { storeId: store.id, plan: claim.plan, paidUntil: periodEnd };
  } catch (err) {
    try { await conn.rollback(); } catch (_) {}
    conn.release(); released = true;
    return next(err);
  }
  if (!released) conn.release();

  // Reconcile cashier seats to the now-effective plan (re-upgrade reactivates
  // suspended seats). POST-commit + outside the connection: a failure here must
  // NOT 500 the already-approved billing change — log and continue. The
  // owner-admin is never touched.
  try {
    await userModel.reconcileCashierSeats(result.storeId, cashierSeats(result.plan));
  } catch (e) {
    console.error('[admin] seat reconcile after approve failed:', e.message);
  }

  res.json({ success: true, data: result });
};

// ── POST /api/admin/claims/:id/reject  { note } ────────────────────────────
const rejectClaim = async (req, res, next) => {
  try {
    const note  = (String((req.body && req.body.note) || '').trim().slice(0, 255)) || null;
    const claim = await claimModel.findById(req.params.id);
    if (!claim) return res.status(404).json({ success: false, message: 'Claim not found.' });
    if (claim.status !== 'pending') {
      return res.status(409).json({ success: false, message: 'Claim was already reviewed.' });
    }
    await pool.query(
      "UPDATE payment_claims SET status = 'rejected', reviewed_by = ?, reviewed_at = NOW(), review_note = ? WHERE id = ?",
      [req.user.id, note, claim.id]
    );
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
};

// ── POST /api/admin/claims/:id/revert ──────────────────────────────────────
// Undo a mistaken approval: roll the store's billing back to the snapshot taken
// at approve time, and return the claim to 'pending' (the operator then rejects
// it via the normal flow). Transactional + FOR UPDATE. Guarded: only undo if the
// store still matches THIS approval's output — if a later renewal/edit changed
// it, refuse rather than clobber newer state. Approvals made before prev_billing
// existed can't be auto-reverted.
const revertApproval = async (req, res, next) => {
  const conn = await pool.getConnection();
  let released = false;
  let result = null;
  try {
    await conn.beginTransaction();

    const [claims] = await conn.query(
      "SELECT * FROM payment_claims WHERE id = ? AND status = 'approved' FOR UPDATE",
      [req.params.id]
    );
    const claim = claims[0];
    if (!claim) {
      await conn.rollback(); conn.release(); released = true;
      return res.status(409).json({ success: false, message: 'Only an approved claim can be reverted.' });
    }
    if (!claim.prev_billing) {
      await conn.rollback(); conn.release(); released = true;
      return res.status(422).json({ success: false, message: "This approval predates undo support and can't be auto-reverted — adjust the store manually." });
    }

    const [stores] = await conn.query('SELECT * FROM stores WHERE id = ? FOR UPDATE', [claim.store_id]);
    const store = stores[0];
    if (!store) {
      await conn.rollback(); conn.release(); released = true;
      return res.status(404).json({ success: false, message: 'Store not found.' });
    }

    // Only undo if this approval is still the store's live state.
    const samePlan = store.plan === claim.plan;
    const samePaidUntil = store.paid_until && claim.period_end &&
      new Date(store.paid_until).getTime() === new Date(claim.period_end).getTime();
    if (!samePlan || !samePaidUntil) {
      await conn.rollback(); conn.release(); released = true;
      return res.status(409).json({ success: false, message: "The store's billing changed since this approval — revert it manually." });
    }

    const prev = typeof claim.prev_billing === 'object' ? claim.prev_billing : JSON.parse(claim.prev_billing);
    const restorePaidUntil   = prev.paid_until    ? new Date(prev.paid_until)    : null;
    const restoreTrialEndsAt = prev.trial_ends_at ? new Date(prev.trial_ends_at) : null;

    await conn.query(
      "UPDATE stores SET plan = ?, subscription_status = ?, paid_until = ?, trial_ends_at = ? WHERE id = ?",
      [prev.plan, prev.subscription_status, restorePaidUntil, restoreTrialEndsAt, store.id]
    );
    // Back to a pending request; clear the review + snapshot.
    await conn.query(
      "UPDATE payment_claims SET status = 'pending', reviewed_by = NULL, reviewed_at = NULL, period_start = NULL, period_end = NULL, prev_billing = NULL WHERE id = ?",
      [claim.id]
    );

    await conn.commit();
    result = { claimId: claim.id, storeId: store.id, restoredPlan: prev.plan };
  } catch (err) {
    try { await conn.rollback(); } catch (_) {}
    conn.release(); released = true;
    return next(err);
  }
  if (!released) conn.release();

  // Reconcile seats to the RESTORED effective plan (re-suspends any cashiers the
  // mistaken approval reactivated). Post-commit + non-fatal, mirroring approve.
  try {
    const [rows] = await pool.query('SELECT * FROM stores WHERE id = ?', [result.storeId]);
    if (rows[0]) await userModel.reconcileCashierSeats(result.storeId, cashierSeats(resolveBilling(rows[0]).plan));
  } catch (e) {
    console.error('[admin] seat reconcile after revert failed:', e.message);
  }

  res.json({ success: true, data: result });
};

// ── GET /api/admin/qr ──────────────────────────────────────────────────────
const getQr = async (req, res, next) => {
  try {
    const cfg = await platformConfig.get();
    res.json({
      success: true,
      data: {
        qrUrl:  platformConfig.qrUrl(cfg),
        name:   (cfg && cfg.gcash_name)   || null,
        number: (cfg && cfg.gcash_number) || null,
      },
    });
  } catch (err) {
    next(err);
  }
};

// Validate an image by MAGIC BYTES (never trust the data-URL prefix).
function sniffImage(buf) {
  if (buf.length >= 4 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'png';
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  return null;
}

// ── POST /api/admin/qr  { imageBase64?, name?, number? } ───────────────────
// Mounted with its own express.json({limit:'1mb'}) (the global parser is 10kb).
const uploadQr = async (req, res, next) => {
  try {
    const { imageBase64, name, number } = req.body || {};
    const fields = {};
    if (name   !== undefined) fields.gcash_name   = String(name).trim().slice(0, 120);
    if (number !== undefined) fields.gcash_number = String(number).trim().slice(0, 32);

    if (imageBase64) {
      const m   = /^data:image\/(png|jpeg);base64,(.+)$/.exec(String(imageBase64));
      const raw = m ? m[2] : String(imageBase64);
      let buf;
      try { buf = Buffer.from(raw, 'base64'); } catch (_) { buf = null; }
      if (!buf || !buf.length) {
        return res.status(400).json({ success: false, message: 'Invalid image data.' });
      }
      if (buf.length > MAX_QR_BYTES) {
        return res.status(413).json({ success: false, message: 'Image too large (max 500KB).' });
      }
      const ext = sniffImage(buf);
      if (!ext) {
        return res.status(400).json({ success: false, message: 'Only PNG or JPEG images are allowed.' });
      }

      // Store a normalized data-URL in the DB (no filesystem). re-encode from the
      // validated buffer so the stored mime matches the sniffed bytes.
      const mime = ext === 'png' ? 'image/png' : 'image/jpeg';
      fields.gcash_qr = 'data:' + mime + ';base64,' + buf.toString('base64');
    }

    const cfg = await platformConfig.update(fields);
    res.json({
      success: true,
      data: {
        qrUrl:  platformConfig.qrUrl(cfg),
        name:   cfg.gcash_name   || null,
        number: cfg.gcash_number || null,
      },
    });
  } catch (err) {
    next(err);
  }
};

// ── GET /api/admin/stats ───────────────────────────────────────────────────
// Platform-wide operator analytics. Plan/state counts are derived from the LIVE
// effective plan (resolveBilling per store — lazy date math), NOT the raw
// stores.plan column, so a store whose paid_until has lapsed counts as free —
// the same truth the rest of the app enforces. MRR sums the price of currently-
// entitled paid plans (active + grace). Activity is from users.last_login_at.
// Period windows for the period-driven figures (new signups + approved revenue).
// Calendar-aligned in UTC (created_at / reviewed_at are stored UTC). The current-
// state figures — stores/plans/MRR/active users — are always "now"; only signups
// and revenue move with the filter.
const STATS_PERIODS = ['this_month', 'last_month', 'last_3_months', 'all'];
function periodBounds(key, now) {
  const y = now.getUTCFullYear(), m = now.getUTCMonth();
  if (key === 'last_month')
    return { start: new Date(Date.UTC(y, m - 1, 1)), end: new Date(Date.UTC(y, m, 1)), label: 'Last month' };
  if (key === 'last_3_months')
    return { start: new Date(Date.UTC(y, m - 2, 1)), end: now, label: 'Last 3 months' };
  if (key === 'all')
    return { start: null, end: now, label: 'All-time' };
  return { start: new Date(Date.UTC(y, m, 1)), end: now, label: 'This month' };
}

const getStats = async (req, res, next) => {
  try {
    const now = new Date();
    const d7  = new Date(now.getTime() - 7  * 86400000);
    const d30 = new Date(now.getTime() - 30 * 86400000);

    const periodKey = STATS_PERIODS.includes(req.query.period) ? req.query.period : 'this_month';
    const { start, end, label } = periodBounds(periodKey, now);
    const inPeriod = (dt) => dt && (!start || dt >= start) && dt < end;

    const stats = {
      period: periodKey,
      periodLabel: label,
      stores:  { total: 0, paying: 0, free: 0 },
      plans:   { plus: 0, pro: 0 },                          // effective PAID tiers only
      mrrPhp:  0,                                            // paid plans only
      users:   { total: 0, owners: 0, cashiers: 0, suspended: 0, active7d: 0, active30d: 0 },
      periodSignups: 0,        // new stores created in the selected window
      periodRevenuePhp: 0,     // approved GCash claims in the selected window
      pendingClaims: 0,
    };

    const [stores] = await pool.query(
      'SELECT plan, subscription_status, trial_ends_at, paid_until, created_at FROM stores'
    );
    stats.stores.total = stores.length;
    for (const s of stores) {
      const b = resolveBilling(s, now);
      if (b.state === 'active' || b.state === 'grace') {
        stats.stores.paying++;
        if (stats.plans[b.plan] !== undefined) stats.plans[b.plan]++;
        stats.mrrPhp += (PLANS[b.plan] && PLANS[b.plan].pricePhp) || 0;
      } else {
        stats.stores.free++;
      }
      if (s.created_at && inPeriod(new Date(s.created_at))) stats.periodSignups++;
    }

    const [users] = await pool.query(
      "SELECT role, is_active, last_login_at FROM users WHERE role != 'superadmin'"
    );
    stats.users.total = users.length;
    for (const u of users) {
      if (u.role === 'admin')        stats.users.owners++;
      else if (u.role === 'cashier') stats.users.cashiers++;
      if (!u.is_active)              stats.users.suspended++;
      if (u.last_login_at) {
        const ll = new Date(u.last_login_at);
        if (ll >= d7)  stats.users.active7d++;
        if (ll >= d30) stats.users.active30d++;
      }
    }

    // Approved GCash revenue in the window (trials never create a claim).
    let revSql = "SELECT COALESCE(SUM(amount_php), 0) AS php FROM payment_claims WHERE status = 'approved'";
    const revParams = [];
    if (start) { revSql += ' AND reviewed_at >= ?'; revParams.push(start); }
    revSql += ' AND reviewed_at < ?'; revParams.push(end);
    const [[rev]]  = await pool.query(revSql, revParams);
    const [[pend]] = await pool.query("SELECT COUNT(*) AS n FROM payment_claims WHERE status = 'pending'");
    stats.periodRevenuePhp = Number(rev.php) || 0;
    stats.pendingClaims    = Number(pend.n) || 0;

    res.json({ success: true, data: stats });
  } catch (err) {
    next(err);
  }
};

// ════════════════════════════════════════════════════════════════════════════
// Phase 6.7 — MANUAL PASSWORD RECOVERY (operator side) + SUPPORT TICKETS
// All routes here run auth + requireSuperAdmin (admin.routes), never loadStore.
// ════════════════════════════════════════════════════════════════════════════

// Step-up auth: re-verify the SUPER-ADMIN's own password before a credential-issuing
// action (approve / regenerate). Server-side — a client-only prompt is bypassable.
// Returns true on success; on failure it has already sent the response.
async function _stepUpOk(req, res) {
  const pw = req.body && req.body.operatorPassword;
  if (!pw) {
    res.status(400).json({ success: false, message: 'Re-enter your operator password to continue.' });
    return false;
  }
  const [rows] = await pool.query('SELECT password FROM users WHERE id = ?', [req.user.id]);
  const hash = rows[0] && rows[0].password;
  const ok = hash && await bcrypt.compare(String(pw), hash);
  if (!ok) {
    res.status(401).json({ success: false, message: 'Incorrect operator password.' });
    return false;
  }
  return true;
}

// 12 hex chars = 48 bits — ample for a one-time, expiring, forced-change credential
// that is delivered out-of-band and used once.
function _genTempCode() {
  return crypto.randomBytes(6).toString('hex');
}

// Issue (or re-issue) a temp code for a request's user, INSIDE a transaction:
// overwrite the password with the code's bcrypt hash, force a change, stamp the
// expiry, and NULL session_id (kills any live session). Advance the request to
// 'approved' with the review stamps. Returns the PLAINTEXT code + expiry for the
// operator to read ONCE — it is never stored or logged.
async function _issueTempCode(conn, { userId, requestId, reviewedBy }) {
  const code = _genTempCode();
  const hash = await bcrypt.hash(code, 10);
  const expiresAt = new Date(Date.now() + RESET_CODE_TTL_HOURS * 60 * 60 * 1000);
  await conn.query(
    'UPDATE users SET password = ?, must_change_password = 1, pw_reset_expires_at = ?, session_id = NULL WHERE id = ?',
    [hash, expiresAt, userId]
  );
  await conn.query(
    `UPDATE password_reset_requests
        SET status = 'approved', reviewed_by = ?, reviewed_at = NOW(),
            code_issued_at = NOW(), code_expires_at = ?
      WHERE id = ?`,
    [reviewedBy, expiresAt, requestId]
  );
  return { code, expiresAt };
}

// ── GET /api/admin/reset-requests?status=pending|approved|done ────────────────
const listResetRequests = async (req, res, next) => {
  try {
    const allowed = ['pending', 'approved', 'done'];
    const status  = allowed.includes(req.query.status) ? req.query.status : undefined;
    const rows = await resetRequest.listForAdmin({ status });
    res.json({ success: true, data: rows });
  } catch (err) {
    next(err);
  }
};

// ── GET /api/admin/reset-requests/:id/history ─────────────────────────────────
// The submitter's past requests (frequency / takeover signal) for the modal.
const resetHistory = async (req, res, next) => {
  try {
    const reqRow = await resetRequest.findById(req.params.id);
    if (!reqRow) return res.status(404).json({ success: false, message: 'Request not found.' });
    const rows = await resetRequest.historyForEmail(reqRow.email);
    res.json({ success: true, data: rows });
  } catch (err) {
    next(err);
  }
};

// ── POST /api/admin/reset-requests/:id/approve  { operatorPassword } ──────────
// Step-up + transactional + FOR UPDATE on a still-pending request (idempotent).
// Only an owner-admin account can be reset here. Returns the temp code ONCE.
const approveReset = async (req, res, next) => {
  if (!(await _stepUpOk(req, res))) return;

  const conn = await pool.getConnection();
  let released = false, payload = null;
  try {
    await conn.beginTransaction();

    const [rows] = await conn.query(
      "SELECT * FROM password_reset_requests WHERE id = ? AND status = 'pending' FOR UPDATE",
      [req.params.id]
    );
    const reqRow = rows[0];
    if (!reqRow) {
      await conn.rollback(); conn.release(); released = true;
      return res.status(409).json({ success: false, message: 'Request is not pending (already reviewed?).' });
    }
    if (!reqRow.user_id) {
      await conn.rollback(); conn.release(); released = true;
      return res.status(422).json({ success: false, message: 'No matching account for this request — reject it instead.' });
    }

    const [us] = await conn.query('SELECT id, role, mobile FROM users WHERE id = ? FOR UPDATE', [reqRow.user_id]);
    const target = us[0];
    if (!target || target.role !== 'admin') {
      await conn.rollback(); conn.release(); released = true;
      return res.status(422).json({ success: false, message: 'This is not an owner account — recovery here is owners-only.' });
    }

    const { code, expiresAt } = await _issueTempCode(conn, {
      userId: reqRow.user_id, requestId: reqRow.id, reviewedBy: req.user.id,
    });

    await conn.commit();
    payload = { tempPassword: code, expiresAt, onfileMobile: target.mobile || null };
  } catch (err) {
    try { await conn.rollback(); } catch (_) {}
    conn.release(); released = true;
    return next(err);
  }
  if (!released) conn.release();

  res.json({ success: true, data: payload });
};

// ── POST /api/admin/reset-requests/:id/regenerate  { operatorPassword } ───────
// Re-issue a fresh code for an already-approved request (e.g. the operator lost the
// code before texting it). Invalidates the previous code (password overwritten).
const regenerateReset = async (req, res, next) => {
  if (!(await _stepUpOk(req, res))) return;

  const conn = await pool.getConnection();
  let released = false, payload = null;
  try {
    await conn.beginTransaction();

    const [rows] = await conn.query(
      "SELECT * FROM password_reset_requests WHERE id = ? AND status = 'approved' FOR UPDATE",
      [req.params.id]
    );
    const reqRow = rows[0];
    if (!reqRow || !reqRow.user_id) {
      await conn.rollback(); conn.release(); released = true;
      return res.status(409).json({ success: false, message: 'Only an approved request can be re-issued.' });
    }

    const [us] = await conn.query('SELECT id, role, mobile FROM users WHERE id = ? FOR UPDATE', [reqRow.user_id]);
    const target = us[0];
    if (!target || target.role !== 'admin') {
      await conn.rollback(); conn.release(); released = true;
      return res.status(422).json({ success: false, message: 'This is not an owner account.' });
    }

    const { code, expiresAt } = await _issueTempCode(conn, {
      userId: reqRow.user_id, requestId: reqRow.id, reviewedBy: req.user.id,
    });

    await conn.commit();
    payload = { tempPassword: code, expiresAt, onfileMobile: target.mobile || null };
  } catch (err) {
    try { await conn.rollback(); } catch (_) {}
    conn.release(); released = true;
    return next(err);
  }
  if (!released) conn.release();

  res.json({ success: true, data: payload });
};

// ── POST /api/admin/reset-requests/:id/reject  { note } ───────────────────────
const rejectReset = async (req, res, next) => {
  try {
    const note   = (String((req.body && req.body.note) || '').trim().slice(0, 255)) || null;
    const reqRow = await resetRequest.findById(req.params.id);
    if (!reqRow) return res.status(404).json({ success: false, message: 'Request not found.' });
    if (reqRow.status !== 'pending') {
      return res.status(409).json({ success: false, message: 'Request was already reviewed.' });
    }
    await resetRequest.markReviewed(req.params.id, {
      status: 'rejected', reviewed_by: req.user.id, review_note: note,
    });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
};

// ── GET /api/admin/tickets?status=open|closed ─────────────────────────────────
const listTickets = async (req, res, next) => {
  try {
    const status = ['open', 'closed'].includes(req.query.status) ? req.query.status : undefined;
    const rows = await ticketModel.listForAdmin({ status });
    res.json({ success: true, data: rows });
  } catch (err) {
    next(err);
  }
};

// ── POST /api/admin/tickets/:id/close ─────────────────────────────────────────
const closeTicket = async (req, res, next) => {
  try {
    const ticket = await ticketModel.findById(req.params.id);
    if (!ticket) return res.status(404).json({ success: false, message: 'Ticket not found.' });
    await ticketModel.close(req.params.id, req.user.id);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
};

// ── GET /api/admin/notifications ──────────────────────────────────────────────
// Counts for the operator topbar bell (pending resets + open tickets).
const notificationCounts = async (req, res, next) => {
  try {
    const [pendingResets, openTickets] = await Promise.all([
      resetRequest.countPending(),
      ticketModel.countOpen(),
    ]);
    res.json({ success: true, data: { pendingResets, openTickets } });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  listClaims, approveClaim, rejectClaim, revertApproval, getQr, uploadQr, getStats,
  listResetRequests, resetHistory, approveReset, regenerateReset, rejectReset,
  listTickets, closeTicket, notificationCounts,
};
