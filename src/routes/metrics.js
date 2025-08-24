const express = require('express');
const metricsController = require('../controllers/metricsController');

const router = express.Router();

router.get('/url', metricsController.getUrlMetrics);
router.get('/urls', metricsController.getUrlList);

module.exports = router;