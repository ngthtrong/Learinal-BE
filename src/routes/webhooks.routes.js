const express = require('express');
const controller = require('../controllers/webhooks.controller');
const { webhookLimiter } = require('../config/rateLimits');
const router = express.Router();

// Sepay webhook endpoint
router.post('/sepay', webhookLimiter, controller.sepay);

module.exports = router;
