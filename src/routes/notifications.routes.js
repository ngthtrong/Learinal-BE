const express = require('express');
const controller = require('../controllers/notifications.controller');
const websocketController = require('../controllers/websocket.controller');
const authenticateJWT = require('../middleware/authenticateJWT');
const authorizeRole = require('../middleware/authorizeRole');
const rateLimit = require('../middleware/rateLimit');

const router = express.Router();

router.get('/', rateLimit({ limit: 60 }), authenticateJWT, controller.list);
router.patch('/:id', rateLimit({ limit: 30 }), authenticateJWT, controller.update);

// WebSocket testing endpoints (admin only)
router.post(
  '/test',
  authenticateJWT,
  authorizeRole('admin'),
  websocketController.sendTestNotification
);
router.post(
  '/broadcast',
  authenticateJWT,
  authorizeRole('admin'),
  websocketController.broadcastAnnouncement
);
router.get('/status', authenticateJWT, websocketController.getConnectionStatus);

module.exports = router;
