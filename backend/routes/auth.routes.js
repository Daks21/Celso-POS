const express    = require('express');
const router     = express.Router();
const { login, register, getPreferencesHandler, savePreferencesHandler, changePassword,
        forgotPassword, updateRecovery } = require('../controllers/auth.controller');
const { authMiddleware: auth, adminMiddleware: admin } = require('../middleware/auth.middleware');
const { loadStore } = require('../middleware/tenant.middleware');
const { entitlements } = require('../config/plans');
const { findById } = require('../models/user.model');
const settings = require('../models/settings.model');

// The platform super-admin has NO tenant store (store_id IS NULL), so loadStore
// would 401 it ("Store not found"). Skip loadStore for that single role and let
// the /me handler return a store-less identity. Tenant users still go through
// loadStore unchanged. Without this, any future getMe() call from the operator
// console (admin.html) would sign the super-admin straight out.
const loadStoreUnlessSuperAdmin = (req, res, next) =>
  (req.user && req.user.role === 'superadmin') ? next() : loadStore(req, res, next);

router.post('/register', register);
router.post('/login',    login);
// Phase 6.7 manual password recovery: public request funnel (rate-limited in
// server.js) + owner self-service recovery-details update.
router.post('/forgot-password', forgotPassword);

router.get('/me', auth, loadStoreUnlessSuperAdmin, async (req, res, next) => {
  try {
    const user = await findById(req.user.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    // Super-admin path: no store. Return a store-less identity (global timezone
    // fallback, no store name/address) with store-less entitlements so the call
    // succeeds instead of 401-ing the operator out. entitlements(null, role)
    // resolves to the free feature set, which the operator console ignores.
    const store = req.store || null;
    res.json({
      success: true,
      user: { id: user.id, fullName: user.fullName, email: user.email, role: user.role, mobile: user.mobile || null, createdAt: user.createdAt },
      timezone: store ? store.timezone : settings.getTimezone(),
      storeName:    store ? (store.name || '') : '',
      storeAddress: store ? (store.address || '') : '',
      ...entitlements(store, req.user.role)
    });
  } catch (err) {
    next(err);
  }
});

router.get('/preferences', auth, getPreferencesHandler);
router.put('/preferences', auth, savePreferencesHandler);
// Owner self-service only — cashiers don't manage their own password (the owner
// resets it from the Team page). Admin-gated so a cashier token can't use it.
router.put('/password',    auth, admin, changePassword);
// Owner recovery details (mobile + place-of-birth answer); admin-gated like /password.
router.put('/recovery',    auth, admin, updateRecovery);

module.exports = router;
