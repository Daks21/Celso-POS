const express    = require('express');
const router     = express.Router();
const controller = require('../controllers/finance.controller');
const { authMiddleware, adminMiddleware } = require('../middleware/auth.middleware');
const { loadStore, requireFeature } = require('../middleware/tenant.middleware');

// Finance is a Plus+ feature: auth + loadStore + requireFeature('finance') on
// every route (402 for Free / cashier). Writes additionally require admin.
router.use(authMiddleware, loadStore, requireFeature('finance'));

router.get('/',        controller.getAll);
router.get('/summary', controller.getSummary);
router.get('/profit',  controller.getProfit);
router.post('/',      adminMiddleware, controller.create);
router.put('/:id',    adminMiddleware, controller.update);
router.delete('/:id', adminMiddleware, controller.remove);

module.exports = router;
