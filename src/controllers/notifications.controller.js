const NotificationsService = require('../services/notifications.service');

const service = new NotificationsService();

/**
 * NotificationsController - HTTP handlers for notifications endpoints
 * Delegates business logic to NotificationsService
 */
module.exports = {
  /**
   * GET /notifications
   * List user's notifications with pagination
   * Query: page, pageSize, isRead
   */
  list: async (req, res, next) => {
    try {
      const user = req.user;
      const { page, pageSize, isRead } = req.query;

      const options = {
        page: parseInt(page, 10) || 1,
        pageSize: parseInt(pageSize, 10) || 20,
        isRead: isRead === 'true' ? true : isRead === 'false' ? false : undefined,
      };

      const { items, meta, unreadCount } = await service.listByUser(user.id, options);
      return res.status(200).json({ items, meta, unreadCount });
    } catch (error) {
      next(error);
    }
  },

  /**
   * GET /notifications/:id
   * Get notification details
   */
  getNotification: async (req, res, next) => {
    try {
      const user = req.user;
      const notificationId = req.params.id;

      const notification = await service.getById(user.id, notificationId);
      return res.status(200).json(notification);
    } catch (error) {
      next(error);
    }
  },

  /**
   * PATCH /notifications/:id
   * Mark notification as read
   */
  markAsRead: async (req, res, next) => {
    try {
      const user = req.user;
      const notificationId = req.params.id;

      const notification = await service.markAsRead(user.id, notificationId);
      return res.status(200).json(notification);
    } catch (error) {
      next(error);
    }
  },

  /**
   * POST /notifications/mark-all-read
   * Mark all notifications as read
   */
  markAllAsRead: async (req, res, next) => {
    try {
      const user = req.user;

      const result = await service.markAllAsRead(user.id);
      return res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  },

  /**
   * GET /notifications/unread-count
   * Get unread notifications count
   */
  getUnreadCount: async (req, res, next) => {
    try {
      const user = req.user;

      const result = await service.getUnreadCount(user.id);
      return res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  },

  /**
   * DELETE /notifications/:id
   * Delete notification
   */
  deleteNotification: async (req, res, next) => {
    try {
      const user = req.user;
      const notificationId = req.params.id;

      await service.deleteNotification(user.id, notificationId);
      return res.status(204).send();
    } catch (error) {
      next(error);
    }
  },
};
