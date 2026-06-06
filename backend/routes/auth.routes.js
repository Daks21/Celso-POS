const express    = require('express');
const router     = express.Router();
const { login, register, getPreferencesHandler, savePreferencesHandler, changePassword,
        forgotPassword, updateRecovery } = require('../controllers/auth.controller');
const { authMiddleware: auth, adminMiddleware: admin } = require('../middleware/auth.middleware');
const { loadStore } = require('../middleware/tenant.middleware');
const { entitlements } = require('../config/plans');
const { findById } = require('../models/user.model');

router.post('/register', register);
router.post('/login',    login);
// Phase 6.7 manual password recovery: public request funnel (rate-limited in
// server.js) + owner self-service recovery-details update.
router.post('/forgot-password', forgotPassword);

router.get('/me', auth, loadStore, async (req, res, next) => {
  try {
    const user = await findById(req.user.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    res.json({
      success: true,
      user: { id: user.id, fullName: user.fullName, email: user.email, role: user.role, mobile: user.mobile || null, createdAt: user.createdAt },
      timezone: req.store.timezone,
      storeName:    req.store.name || '',
      storeAddress: req.store.address || '',
      ...entitlements(req.store, req.user.role)
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
