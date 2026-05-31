const express    = require('express');
const router     = express.Router();
const { login, register, getPreferencesHandler, savePreferencesHandler } = require('../controllers/auth.controller');
const { authMiddleware: auth } = require('../middleware/auth.middleware');
const { loadStore } = require('../middleware/tenant.middleware');
const { entitlements } = require('../config/plans');
const { findById } = require('../models/user.model');

router.post('/register', register);
router.post('/login',    login);

router.get('/me', auth, loadStore, async (req, res, next) => {
  try {
    const user = await findById(req.user.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    res.json({
      success: true,
      user: { id: user.id, fullName: user.fullName, email: user.email, role: user.role, createdAt: user.createdAt },
      timezone: req.store.timezone,
      ...entitlements(req.store, req.user.role)
    });
  } catch (err) {
    next(err);
  }
});

router.get('/preferences', auth, getPreferencesHandler);
router.put('/preferences', auth, savePreferencesHandler);

module.exports = router;
