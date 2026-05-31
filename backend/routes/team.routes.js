const express = require('express');
const router  = express.Router();
const controller = require('../controllers/team.controller');
const { authMiddleware, adminMiddleware } = require('../middleware/auth.middleware');
const { loadStore } = require('../middleware/tenant.middleware');

// Team management is owner-only: auth + loadStore + admin on every route
// (cashiers get 403). Seat limits are enforced per-plan inside the controller.
router.use(authMiddleware, loadStore, adminMiddleware);

router.get('/',            controller.list);
router.post('/',           controller.create);
router.patch('/:id/active', controller.setActive);
router.delete('/:id',      controller.remove);

module.exports = router;
