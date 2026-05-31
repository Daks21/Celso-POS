const express = require('express');
const router  = express.Router();
const controller = require('../controllers/inventory.controller');
const { authMiddleware, adminMiddleware } = require('../middleware/auth.middleware');
const { loadStore } = require('../middleware/tenant.middleware');

// auth + loadStore on every route; no plan gate. Restock/adjust stays admin-only.
router.use(authMiddleware, loadStore);

router.get('/',                   controller.getAll);
router.get('/low-stock',          controller.getLowStock);
router.get('/summary',            controller.getSummary);
router.post('/:productId/adjust', adminMiddleware, controller.adjust);

module.exports = router;
