const express = require('express');
const rateLimit = require('../middleware/rateLimit');
const controller = require('../controllers/webhooks.controller');

const router = express.Router();

// POST /webhooks/stripe – unauthenticated, verified inside controller if configured
router.post('/stripe', rateLimit({ limit: 120 }), express.json({ type: '*/*' }), controller.stripe);

module.exports = router;
