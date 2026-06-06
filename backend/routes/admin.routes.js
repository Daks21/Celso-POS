const express = require('express');
const router  = express.Router();
const controller = require('../controllers/admin.controller');
const { authMiddleware } = require('../middleware/auth.middleware');
const { requireSuperAdmin } = require('../middleware/platform.middleware');

// Platform operator routes: auth + requireSuperAdmin on every route. NO loadStore
// — the super-admin has no tenant store. requireSuperAdmin 404s everyone else, so
// the surface is invisible to tenant users. (Phase 6.6.)
router.use(authMiddleware, requireSuperAdmin);

router.get('/stats',               controller.getStats);

router.get('/claims',              controller.listClaims);
router.post('/claims/:id/approve', controller.approveClaim);
router.post('/claims/:id/reject',  controller.rejectClaim);
router.post('/claims/:id/revert',  controller.revertApproval);

router.get('/qr', controller.getQr);
// The QR upload carries a base64 image — give it a 1mb body limit. The global
// express.json (10kb) skips this exact path (see server.js) so this parser is the
// one that runs here.
router.post('/qr', express.json({ limit: '1mb' }), controller.uploadQr);

// Phase 6.7 — manual password recovery review + support ticket inbox.
router.get('/reset-requests',                 controller.listResetRequests);
router.get('/reset-requests/:id/history',     controller.resetHistory);
router.post('/reset-requests/:id/approve',    controller.approveReset);
router.post('/reset-requests/:id/regenerate', controller.regenerateReset);
router.post('/reset-requests/:id/reject',     controller.rejectReset);
router.get('/tickets',                        controller.listTickets);
router.post('/tickets/:id/close',             controller.closeTicket);
router.get('/notifications',                  controller.notificationCounts);

module.exports = router;
