const express = require('express');
const router = express.Router();
const { getSummary } = require('../controllers/analytics.controller');

router.get('/summary', getSummary);

module.exports = router;
