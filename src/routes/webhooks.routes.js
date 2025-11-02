const express = require('express');
const controller = require('../controllers/webhooks.controller');
const router = express.Router();

// Sepay webhook endpoint
router.post('/sepay', controller.sepay);

module.exports = router;
