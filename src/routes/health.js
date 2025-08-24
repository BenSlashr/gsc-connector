const express = require('express');
const healthController = require('../controllers/healthController');

const router = express.Router();

router.get('/health', healthController.getHealth.bind(healthController));
router.get('/ready', healthController.getReady.bind(healthController));
router.get('/metrics', healthController.getMetrics.bind(healthController));

module.exports = router;