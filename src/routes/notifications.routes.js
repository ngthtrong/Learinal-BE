const express = require('express');
const controller = require('../controllers/notifications.controller');
const authenticateJWT = require('../middleware/authenticateJWT');
const rateLimit = require('../middleware/rateLimit');

const router = express.Router();

router.get('/', rateLimit({ limit: 60 }), authenticateJWT, controller.list);
router.patch('/:id', rateLimit({ limit: 30 }), authenticateJWT, controller.update);

module.exports = router;
