const express = require('express');
const authController = require('../controllers/authController');

const router = express.Router();

router.get('/url', authController.getAuthUrl);
router.get('/callback', authController.handleCallback);
router.post('/callback', authController.handleCallback);
router.get('/status', authController.getStatus);

module.exports = router;