const express    = require('express');
const router     = express.Router();
const controller = require('../controllers/sales.controller');
const { authMiddleware: auth, adminMiddleware: admin } = require('../middleware/auth.middleware');
const { loadStore } = require('../middleware/tenant.middleware');

// auth + loadStore on every route; no plan gate (POS + History are reachable by
// cashiers on any plan). The sale edit (PUT) stays admin-only.
router.use(auth, loadStore);

// /summary must be defined before /:id — otherwise 'summary' matches the wildcard first
router.get('/summary', controller.getSummary);
router.get('/',        controller.getSales);
router.get('/:id',     controller.getOne);
router.post('/',       controller.createSale);
router.put('/:id',     admin, controller.updateSale);

module.exports = router;
