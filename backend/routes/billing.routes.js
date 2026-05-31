const express = require('express');
const router  = express.Router();
const controller = require('../controllers/billing.controller');
const { authMiddleware, adminMiddleware } = require('../middleware/auth.middleware');
const { loadStore } = require('../middleware/tenant.middleware');

// Billing is owner-only: auth + loadStore + admin on every route. No plan gate —
// a Free owner must be able to reach checkout to upgrade. (The webhook is NOT
// here; it's mounted in server.js before express.json with raw-body HMAC.)
router.use(authMiddleware, loadStore, adminMiddleware);

router.post('/checkout', controller.checkout);
router.post('/portal',   controller.portal);
router.get('/state',     controller.state);

module.exports = router;
