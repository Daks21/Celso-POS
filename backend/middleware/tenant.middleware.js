const storeModel = require('../models/store.model');
const { effectivePlan, hasFeature, cashierSeats } = require('../config/plans');
const { reconcileCashierSeats } = require('../models/user.model');

// loadStore resolves the caller's store from the DB on every request and attaches
// it (plus the effective plan) to req. MUST run AFTER authMiddleware — it reads
// req.user.storeId. The plan is resolved from DB billing state PER REQUEST (never
// trusted from the JWT), so upgrades/downgrades and trial expiry take effect on
// the very next call with no re-login.
async function loadStore(req, res, next) {
  try {
    // Tokens minted before Phase 6.5 carry no storeId — treat them as a dead
    // session (401) so the client re-logs in rather than 500-ing on a NULL bind.
    if (!req.user || !req.user.storeId) {
      return res.status(401).json({ success: false, message: 'Store not found' });
    }
    const store = await storeModel.findById(req.user.storeId);
    if (!store) {
      return res.status(401).json({ success: false, message: 'Store not found' });
    }
    req.store = store;
    req.plan = effectivePlan(store);

    // Lazy lapse enforcement. An approved downgrade reconciles cashier seats in
    // admin.controller, but a LAPSE is lazy date-math with no event — so a store
    // that lapsed to Free from Plus/Pro would otherwise keep its cashiers able to
    // log in and ring up sales (the POS itself is a Free feature). A Free/Basic
    // plan allows 0 cashier seats, so suspend any still-active cashiers now. Both
    // owner and cashier requests hit loadStore, so either party's next action
    // triggers it; the suspended cashier is then signed out by authMiddleware's
    // is_active check on its following request. Re-upgrade reactivates them
    // (oldest-first) on approve. Fire-and-forget + a cheap no-op once none remain
    // — seat bookkeeping must never 500 a request.
    if (cashierSeats(req.plan) === 0) {
      reconcileCashierSeats(store.id, 0).catch((e) =>
        console.error('[loadStore] lapse seat reconcile failed:', e.message));
    }

    next();
  } catch (e) {
    next(e);
  }
}

// requireFeature gates a route behind a plan feature (and the cashier role cap).
// 402 = plan gate (show an upgrade CTA); role denials also surface here as 402
// since a cashier on Pro simply lacks the feature. Pure role-only blocks stay on
// adminMiddleware (403).
const requireFeature = (feature) => (req, res, next) =>
  hasFeature(req.plan, req.user.role, feature)
    ? next()
    : res.status(402).json({
        success: false,
        code: 'UPGRADE_REQUIRED',
        message: 'This feature needs a higher plan.',
      });

module.exports = { loadStore, requireFeature };
