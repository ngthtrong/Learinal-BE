const express = require('express');
const rateLimit = require('../middleware/rateLimit');
const authenticateJWT = require('../middleware/authenticateJWT');
const idempotencyKey = require('../middleware/idempotencyKey');
const controller = require('../controllers/subscriptions.controller');

const router = express.Router();

// POST /subscriptions – start checkout / create subscription
router.post('/', rateLimit({ limit: 30 }), authenticateJWT, idempotencyKey, controller.create);

module.exports = router;