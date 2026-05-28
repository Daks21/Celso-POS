const express = require('express');
const router  = express.Router();
const { getSettings, updateTimezone } = require('../controllers/settings.controller');
const { authMiddleware: auth, adminMiddleware: admin } = require('../middleware/auth.middleware');

router.get('/',          auth,        getSettings);
router.put('/timezone',  auth, admin, updateTimezone);

module.exports = router;
