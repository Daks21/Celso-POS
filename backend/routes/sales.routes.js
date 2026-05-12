const express = require('express');
const router = express.Router();
const { getSales, createSale } = require('../controllers/sales.controller');

router.get('/', getSales);
router.post('/', createSale);

module.exports = router;
