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

const claimModel     = require('../models/claim.model');
const userModel      = require('../models/user.model');
const platformConfig = require('../models/platformConfig.model');
const pool           = require('../config/db.config');
const { resolveBilling, addOneMonth, cashierSeats } = require('../config/plans');

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
// (renewal extends from the due date; pay-during-trial preserves trial days).
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
    else if (b.state === 'trial')                    base = new Date(store.trial_ends_at); // keep remaining trial days
    else                                             base = now;                           // free/lapsed: fresh start
    const periodEnd = addOneMonth(base);

    await conn.query(
      "UPDATE stores SET plan = ?, subscription_status = 'active', paid_until = ?, trial_ends_at = NULL WHERE id = ?",
      [claim.plan, periodEnd, store.id]
    );
    await conn.query(
      "UPDATE payment_claims SET status = 'approved', reviewed_by = ?, reviewed_at = NOW(), period_start = ?, period_end = ? WHERE id = ?",
      [req.user.id, base, periodEnd, claim.id]
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

module.exports = { listClaims, approveClaim, rejectClaim, getQr, uploadQr };
