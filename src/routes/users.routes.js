const express = require('express');
const controller = require('../controllers/users.controller');
const authenticateJWT = require('../middleware/authenticateJWT');
const rateLimit = require('../middleware/rateLimit');

const router = express.Router();

// GET /users/me
router.get('/me', rateLimit({ limit: 60 }), authenticateJWT, controller.me);

// PATCH /users/me (requires If-None-Match)
router.patch('/me', rateLimit({ limit: 60 }), authenticateJWT, controller.updateMe);

module.exports = router;
