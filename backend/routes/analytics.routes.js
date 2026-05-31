const express    = require('express');
const router     = express.Router();
const controller = require('../controllers/analytics.controller');
const { authMiddleware: auth } = require('../middleware/auth.middleware');
const { loadStore, requireFeature } = require('../middleware/tenant.middleware');

// Every route is auth + loadStore. Then a tiered plan gate:
//   summary            -> no gate (dashboard_basic; Free dashboard uses it)
//   kpis/charts/heatmap/profit -> 'analytics'          (Plus)
//   inventory-health/projection -> 'advanced_analytics' (Pro)
// Specific named routes must come before any wildcard (:param) routes.
router.use(auth, loadStore);

router.get('/summary',          controller.getSummary);
router.get('/kpis',             requireFeature('analytics'),          controller.getKPIs);
router.get('/charts',           requireFeature('analytics'),          controller.getCharts);
router.get('/heatmap',          requireFeature('analytics'),          controller.getHeatmap);
router.get('/profit',           requireFeature('analytics'),          controller.getProfit);
router.get('/inventory-health', requireFeature('advanced_analytics'), controller.getInventoryHealth);
router.get('/projection',       requireFeature('advanced_analytics'), controller.getGoalProjection);

module.exports = router;
