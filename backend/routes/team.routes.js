const express = require('express');
const router  = express.Router();
const controller = require('../controllers/team.controller');
const { authMiddleware, adminMiddleware } = require('../middleware/auth.middleware');
const { loadStore } = require('../middleware/tenant.middleware');

// Team management is owner-only: auth + loadStore + admin on every route
// (cashiers get 403). Seat limits are enforced per-plan inside the controller.
router.use(authMiddleware, loadStore, adminMiddleware);

router.get('/',             controller.list);
// Read-only daily-sales audit (admin-only via the router.use guard above).
// Declared before the parameterized mutation routes; '/daily-sales' is a literal
// segment so it never shadows '/:id/...'.
router.get('/daily-sales',         controller.dailySales);
router.get('/daily-sales/:userId', controller.personReceipts);
router.post('/',            controller.create);
router.patch('/:id/active', controller.setActive);
router.put('/:id/password', controller.resetPassword);
router.delete('/:id',       controller.remove);

module.exports = router;
