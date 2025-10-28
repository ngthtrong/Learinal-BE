const express = require('express');
const Joi = require('joi');
const controller = require('../controllers/notifications.controller');
const authenticateJWT = require('../middleware/authenticateJWT');
const rateLimit = require('../middleware/rateLimit');
const inputValidation = require('../middleware/inputValidation');

const router = express.Router();

// Validation schemas
const listNotificationsSchema = Joi.object({
  query: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    pageSize: Joi.number().integer().min(1).max(100).default(20),
    isRead: Joi.string().valid('true', 'false').optional(),
  }),
}).unknown(true);

const notificationIdSchema = Joi.object({
  params: Joi.object({
    id: Joi.string().required(),
  }),
}).unknown(true);

/**
 * Notifications Routes
 * Base: /api/v1/notifications
 */

// GET /api/v1/notifications/unread-count - Get unread count (must be before /:id)
router.get(
  '/unread-count',
  rateLimit({ limit: 60 }),
  authenticateJWT,
  controller.getUnreadCount
);

// POST /api/v1/notifications/mark-all-read - Mark all as read
router.post(
  '/mark-all-read',
  rateLimit({ limit: 30 }),
  authenticateJWT,
  controller.markAllAsRead
);

// GET /api/v1/notifications - List notifications
router.get(
  '/',
  rateLimit({ limit: 60 }),
  authenticateJWT,
  inputValidation(listNotificationsSchema),
  controller.list
);

// GET /api/v1/notifications/:id - Get notification details
router.get(
  '/:id',
  rateLimit({ limit: 60 }),
  authenticateJWT,
  inputValidation(notificationIdSchema),
  controller.getNotification
);

// PATCH /api/v1/notifications/:id - Mark as read
router.patch(
  '/:id',
  rateLimit({ limit: 30 }),
  authenticateJWT,
  inputValidation(notificationIdSchema),
  controller.markAsRead
);

// DELETE /api/v1/notifications/:id - Delete notification
router.delete(
  '/:id',
  rateLimit({ limit: 30 }),
  authenticateJWT,
  inputValidation(notificationIdSchema),
  controller.deleteNotification
);

module.exports = router;
