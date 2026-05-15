const express    = require('express');
const router     = express.Router();
const { login, register } = require('../controllers/auth.controller');
const { authMiddleware: auth } = require('../middleware/auth.middleware');
const { findById } = require('../models/user.model');

router.post('/register', register);
router.post('/login',    login);

router.get('/me', auth, async (req, res, next) => {
  try {
    const user = await findById(req.user.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    res.json({
      success: true,
      user: { id: user.id, fullName: user.fullName, email: user.email, role: user.role }
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
