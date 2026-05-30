const express    = require('express');
const router     = express.Router();
const controller = require('../controllers/products.controller');
const { authMiddleware: auth, adminMiddleware: admin } = require('../middleware/auth.middleware');

router.get('/',         controller.getAll);
router.get('/archived', auth, controller.getArchived); // must precede '/:id'
router.get('/:id',      controller.getOne);

router.post('/',            auth, controller.create);
router.post('/:id/restore', auth, controller.restore);
router.put('/:id',          auth, controller.update);
router.delete('/:id',       auth, admin, controller.remove); // soft-delete is admin-only

module.exports = router;
