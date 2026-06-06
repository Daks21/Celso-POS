const express = require('express');
const router  = express.Router();
const controller = require('../controllers/support.controller');
const { authMiddleware } = require('../middleware/auth.middleware');
const { loadStore } = require('../middleware/tenant.middleware');

// Support tickets (Phase 6.7). auth + loadStore: any logged-in tenant user (owner or
// cashier) may submit; loadStore 401s the no-store super-admin. The submission is
// rate-limited in server.js. No plan gate — support must be reachable on any plan.
router.post('/tickets', authMiddleware, loadStore, controller.submit);

module.exports = router;
