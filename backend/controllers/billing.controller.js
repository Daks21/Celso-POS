// backend/controllers/billing.controller.js
//
// Phase 6.6 — manual GCash billing bridge (Lemon Squeezy retired). This is the
// TENANT side (owner-only; routes add auth + loadStore + admin):
//   GET  /api/billing/state  — plan/state/seats/prices + pending claim + the
//        global GCash QR. No external call — billing state is the store row,
//        resolved per request by config/plans.resolveBilling().
//   POST /api/billing/claim  — the owner pays the QR in GCash, then submits the
//        reference number. Verify-first: this records a `pending` claim and does
//        NOT change the plan. The super-admin approves it in admin.controller.

const userModel      = require('../models/user.model');
const claimModel     = require('../models/claim.model');
const platformConfig = require('../models/platformConfig.model');
const { PLANS, resolveBilling, cashierSeats } = require('../config/plans');

// GCash reference numbers are numeric (~13 digits); accept a tolerant range.
const GCASH_REF_RE = /^\d{6,20}$/;

// ── GET /api/billing/state ────────────────────────────────────────────────
const state = async (req, res, next) => {
  try {
    const b         = resolveBilling(req.store);
    const seatsUsed = await userModel.countActiveCashiers(req.user.storeId);
    const pending   = await claimModel.findPendingByStore(req.user.storeId);
    const cfg       = await platformConfig.get();
    res.json({
      success: true,
      data: {
        plan:        b.plan,
        state:       b.state,
        paidUntil:   b.paidUntil,
        graceEndsAt: b.graceEndsAt,
        trialEndsAt: b.trialEndsAt,
        seatsUsed,
        seatsTotal:  cashierSeats(b.plan),
        prices:      { basic: PLANS.basic.pricePhp, plus: PLANS.plus.pricePhp, pro: PLANS.pro.pricePhp },
        pendingClaim: pending ? {
          plan:        pending.plan,
          amountPhp:   pending.amount_php,
          gcashRef:    pending.gcash_ref,
          submittedAt: pending.submitted_at,
        } : null,
        gcash: {
          qrUrl:  platformConfig.qrUrl(cfg),
          name:   (cfg && cfg.gcash_name)   || null,
          number: (cfg && cfg.gcash_number) || null,
        },
      },
    });
  } catch (err) {
    next(err);
  }
};

// ── POST /api/billing/claim  { plan: 'basic' | 'plus' | 'pro', gcashRef } ──
const claim = async (req, res, next) => {
  try {
    const plan     = req.body && req.body.plan;
    const gcashRef = String((req.body && req.body.gcashRef) || '').trim();

    if (!['basic', 'plus', 'pro'].includes(plan)) {
      return res.status(400).json({ success: false, message: "plan must be 'basic', 'plus' or 'pro'" });
    }
    if (!GCASH_REF_RE.test(gcashRef)) {
      return res.status(400).json({
        success: false,
        message: 'Enter the numeric GCash reference number from your receipt.',
      });
    }

    // Verify-first: one open claim per store at a time.
    const existing = await claimModel.findPendingByStore(req.user.storeId);
    if (existing) {
      return res.status(409).json({ success: false, message: 'You already have a payment under review.' });
    }
    // A reference can be claimed once, ever (UNIQUE is the hard guard; this is the
    // friendly pre-check).
    const dup = await claimModel.findByRef(gcashRef);
    if (dup) {
      return res.status(409).json({ success: false, message: 'That GCash reference was already submitted.' });
    }

    // Price is snapshotted server-side — never trust an amount from the client.
    const amountPhp = PLANS[plan].pricePhp;
    await claimModel.create({
      store_id:     req.user.storeId,
      plan,
      amount_php:   amountPhp,
      gcash_ref:    gcashRef,
      submitted_by: req.user.id,
    });

    res.status(201).json({ success: true, data: { status: 'pending' } });
  } catch (err) {
    // UNIQUE(gcash_ref) race between the pre-check and INSERT -> friendly 409.
    if (err && err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ success: false, message: 'That GCash reference was already submitted.' });
    }
    next(err);
  }
};

// ── GET /api/billing/qr ───────────────────────────────────────────────────
// PUBLIC (no auth): serves the global receiving GCash QR as an image. The QR is
// public-by-design (it's shown to anyone paying), and an <img> tag can't send an
// auth header. Decodes the data-URL stored in platform_config.gcash_qr.
const qrImage = async (req, res, next) => {
  try {
    const cfg = await platformConfig.get();
    const data = cfg && cfg.gcash_qr;
    const m = data && /^data:(image\/(?:png|jpeg));base64,(.+)$/.exec(data);
    if (!m) return res.sendStatus(404);
    const buf = Buffer.from(m[2], 'base64');
    res.set('Content-Type', m[1]);
    res.set('Cache-Control', 'public, max-age=86400');   // ?v= busts this when the QR changes
    res.send(buf);
  } catch (err) {
    next(err);
  }
};

module.exports = { state, claim, qrImage };
