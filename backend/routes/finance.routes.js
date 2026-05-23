const express    = require('express');
const router     = express.Router();
const controller = require('../controllers/finance.controller');
const { authMiddleware, adminMiddleware } = require('../middleware/auth.middleware');

router.get('/',       authMiddleware,                controller.getAll);
router.get('/summary', authMiddleware,               controller.getSummary);
router.post('/',      authMiddleware, adminMiddleware, controller.create);
router.put('/:id',    authMiddleware, adminMiddleware, controller.update);
router.delete('/:id', authMiddleware, adminMiddleware, controller.remove);

module.exports = router;
