const express    = require('express');
const router     = express.Router();
const controller = require('../controllers/analytics.controller');
const { authMiddleware: auth } = require('../middleware/auth.middleware');

// Specific named routes must come before any wildcard (:param) routes
router.get('/summary',          auth, controller.getSummary);
router.get('/heatmap',          auth, controller.getHeatmap);
router.get('/kpis',             auth, controller.getKPIs);
router.get('/charts',           auth, controller.getCharts);
router.get('/profit',           auth, controller.getProfit);
router.get('/inventory-health', auth, controller.getInventoryHealth);
router.get('/projection',       auth, controller.getGoalProjection);

module.exports = router;
