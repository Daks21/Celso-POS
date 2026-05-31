// backend/routes/ai.routes.js
const express            = require('express');
const router             = express.Router();
const ai                 = require('../controllers/ai.controller');
const { authMiddleware } = require('../middleware/auth.middleware');
const { loadStore, requireFeature } = require('../middleware/tenant.middleware');

// Os (AI) is a Pro-only feature: auth + loadStore + requireFeature('ai') on
// every route (402 for Free/Plus and for cashiers).
router.use(authMiddleware, loadStore, requireFeature('ai'));

router.post('/chat',        ai.chat);
router.post('/chat/stream', ai.chatStream);
router.get('/summary',      ai.dailySummary);
router.get('/restock',      ai.restockAdvice);
router.get('/forecast',     ai.forecast);
router.get('/profit',       ai.profitCoaching);

module.exports = router;
