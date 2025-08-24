const express = require('express');

const router = express.Router();

router.get('/health', async (req, res) => {
  // Mode stateless - juste vérifier que le service répond
  res.json({
    success: true,
    status: 'healthy',
    timestamp: new Date().toISOString(),
    mode: 'stateless',
    version: '1.0.0',
    uptime: Math.floor(process.uptime())
  });
});

router.get('/ready', async (req, res) => {
  // Mode stateless - toujours prêt
  res.json({
    success: true,
    status: 'ready',
    timestamp: new Date().toISOString(),
    message: 'Stateless service is ready'
  });
});

router.get('/metrics', (req, res) => {
  res.json({
    success: true,
    uptime: Math.floor(process.uptime()),
    memory: process.memoryUsage(),
    timestamp: new Date().toISOString()
  });
});

module.exports = router;