const express    = require('express');
const router     = express.Router();
const controller = require('../controllers/finance.controller');
const { authMiddleware, adminMiddleware } = require('../middleware/auth.middleware');
const { loadStore, requireFeature } = require('../middleware/tenant.middleware');

// Finance is a FREE-tier feature (every paid plan has it too): auth + loadStore
// + requireFeature('finance') on every route. The gate stays as defense-in-depth
// (402 only if a future plan drops it, or for a cashier). Writes require admin.
router.use(authMiddleware, loadStore, requireFeature('finance'));

router.get('/',        controller.getAll);
router.get('/summary', controller.getSummary);
router.get('/profit',  controller.getProfit);
router.post('/',      adminMiddleware, controller.create);
router.put('/:id',    adminMiddleware, controller.update);
router.delete('/:id', adminMiddleware, controller.remove);

module.exports = router;
