const storeModel = require('../models/store.model');
const { effectivePlan, hasFeature } = require('../config/plans');

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
