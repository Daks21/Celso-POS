const express    = require('express');
const router     = express.Router();
const controller = require('../controllers/products.controller');
const { authMiddleware: auth, adminMiddleware: admin } = require('../middleware/auth.middleware');
const { loadStore } = require('../middleware/tenant.middleware');

// Phase 6.5: product reads used to be public, but a product has no meaning
// without a store context, so every route is now auth + loadStore (no plan gate —
// the POS, reachable by cashiers, needs these reads). Writes stay admin-gated:
// catalog + pricing changes are owner-only, and since sale totals are recomputed
// from the DB price, a non-admin price edit would be financially material.
router.use(auth, loadStore);

router.get('/archived', controller.getArchived); // must precede '/:id'
router.get('/',         controller.getAll);
router.get('/:id',      controller.getOne);

router.post('/',            admin, controller.create);
router.post('/:id/restore', admin, controller.restore);
router.put('/:id',          admin, controller.update);
router.delete('/:id',       admin, controller.remove); // soft-delete is admin-only

module.exports = router;
