const express = require('express');
const router  = express.Router();
const controller = require('../controllers/billing.controller');
const { authMiddleware, adminMiddleware } = require('../middleware/auth.middleware');
const { loadStore } = require('../middleware/tenant.middleware');

// Billing is owner-only: auth + loadStore + admin on every route. No plan gate —
// a Free owner must reach /state and /claim to upgrade. (Phase 6.6 manual GCash
// bridge; the Lemon Squeezy checkout/portal/webhook routes are removed.)
router.use(authMiddleware, loadStore, adminMiddleware);

router.get('/state',    controller.state);
router.post('/claim',   controller.claim);
// Edit (fix a typo'd ref / switch plan) or withdraw the still-pending claim. Both
// are covered by the claimLimiter in server.js (it mounts on /api/billing/claim
// for every method).
router.patch('/claim',  controller.editClaim);
router.delete('/claim', controller.cancelClaim);

module.exports = router;
