const express = require('express');
const rateLimit = require('../middleware/rateLimit');
const authenticateJWT = require('../middleware/authenticateJWT');
const controller = require('../controllers/userSubscriptions.controller');

const router = express.Router();

// GET /user-subscriptions/me
router.get('/me', rateLimit({ limit: 60 }), authenticateJWT, controller.me);

module.exports = router;
