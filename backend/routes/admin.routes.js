const express = require('express');
const router  = express.Router();
const controller = require('../controllers/admin.controller');
const { authMiddleware } = require('../middleware/auth.middleware');
const { requireSuperAdmin } = require('../middleware/platform.middleware');

// Platform operator routes: auth + requireSuperAdmin on every route. NO loadStore
// — the super-admin has no tenant store. requireSuperAdmin 404s everyone else, so
// the surface is invisible to tenant users. (Phase 6.6.)
router.use(authMiddleware, requireSuperAdmin);

router.get('/claims',              controller.listClaims);
router.post('/claims/:id/approve', controller.approveClaim);
router.post('/claims/:id/reject',  controller.rejectClaim);

router.get('/qr', controller.getQr);
// The QR upload carries a base64 image — give it a 1mb body limit. The global
// express.json (10kb) skips this exact path (see server.js) so this parser is the
// one that runs here.
router.post('/qr', express.json({ limit: '1mb' }), controller.uploadQr);

module.exports = router;
