const express    = require('express');
const router     = express.Router();
const controller = require('../controllers/sales.controller');
const auth       = require('../middleware/auth.middleware');

router.get('/',    auth, controller.getSales);
router.get('/:id', auth, controller.getOne);
router.post('/',   auth, controller.createSale);

module.exports = router;
