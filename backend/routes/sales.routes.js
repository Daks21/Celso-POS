const express    = require('express');
const router     = express.Router();
const controller = require('../controllers/sales.controller');
const { authMiddleware: auth, adminMiddleware: admin } = require('../middleware/auth.middleware');

// /summary must be defined before /:id — otherwise 'summary' matches the wildcard first
router.get('/summary', auth, controller.getSummary);
router.get('/',        auth, controller.getSales);
router.get('/:id',     auth, controller.getOne);
router.post('/',       auth, controller.createSale);
router.put('/:id',     auth, admin, controller.updateSale);

module.exports = router;
