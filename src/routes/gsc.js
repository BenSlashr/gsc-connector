const express = require('express');
const gscController = require('../controllers/gscController');

const router = express.Router();

router.get('/properties', gscController.getProperties);
router.get('/check-access', gscController.checkAccess);
router.post('/import', gscController.importData);

module.exports = router;