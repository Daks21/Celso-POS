// backend/routes/ai.routes.js
const express            = require('express');
const router             = express.Router();
const ai                 = require('../controllers/ai.controller');
const { authMiddleware } = require('../middleware/auth.middleware');

router.post('/chat',        authMiddleware, ai.chat);
router.post('/chat/stream', authMiddleware, ai.chatStream);
router.get('/summary',      authMiddleware, ai.dailySummary);
router.get('/restock',      authMiddleware, ai.restockAdvice);
router.get('/forecast',     authMiddleware, ai.forecast);
router.get('/profit',       authMiddleware, ai.profitCoaching);

module.exports = router;
