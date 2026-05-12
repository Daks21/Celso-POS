const express    = require('express');
const router     = express.Router();
const controller = require('../controllers/analytics.controller');
const auth       = require('../middleware/auth.middleware');

// Specific named routes must come before any wildcard (:param) routes
router.get('/summary', auth, controller.getSummary);
router.get('/heatmap', auth, controller.getHeatmap);
router.get('/kpis',    auth, controller.getKPIs);
router.get('/charts',  auth, controller.getCharts);

module.exports = router;
