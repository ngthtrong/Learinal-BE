const express = require('express');
const controller = require('../controllers/moderation.controller');
const authenticateJWT = require('../middleware/authenticateJWT');
const authorizeRole = require('../middleware/authorizeRole');

const router = express.Router();

// Public: Flag content (authenticated users only)
router.post('/flag', authenticateJWT, controller.flagContent);

// Admin only: Review flags
router.get(
  '/flags',
  authenticateJWT,
  authorizeRole('Admin'),
  controller.listFlags
);

router.patch(
  '/flags/:id/review',
  authenticateJWT,
  authorizeRole('Admin'),
  controller.reviewFlag
);

router.patch(
  '/flags/:id/dismiss',
  authenticateJWT,
  authorizeRole('Admin'),
  controller.dismissFlag
);

module.exports = router;
