const NotificationsRepository = require('../repositories/notifications.repository');
const UsersRepository = require('../repositories/users.repository');
const logger = require('../utils/logger');

/**
 * Map MongoDB document to API DTO
 */
function mapId(doc) {
  if (!doc) return null;
  const { _id, __v, ...rest } = doc;
  return { id: String(_id || rest.id), ...rest };
}

/**
 * NotificationsService - Business logic for in-app notifications
 * Handles creating, reading, and managing user notifications
 */
class NotificationsService {
  constructor() {
    this.repo = new NotificationsRepository();
    this.usersRepo = new UsersRepository();
  }

  /**
   * Create in-app notification for a user
   * @param {object} payload - { userId, title, message, type, relatedEntityType, relatedEntityId }
   * @returns {Promise<object>} - Created notification
   */
  async createNotification(payload) {
    const { userId, title, message, type, relatedEntityType, relatedEntityId } = payload;

    // Verify user exists
    const user = await this.usersRepo.findById(userId);
    if (!user) {
      throw {
        code: 'NotFound',
        message: 'User not found',
        status: 404,
      };
    }

    const notification = {
      userId,
      title,
      message,
      type: type || 'info',
      isRead: false,
      relatedEntityType: relatedEntityType || null,
      relatedEntityId: relatedEntityId || null,
    };

    const created = await this.repo.create(notification);

    logger.info(
      { notificationId: created._id, userId, type: notification.type },
      '[Notifications] In-app notification created'
    );

    return mapId(created);
  }

  /**
   * Get notification by ID with ownership check
   * @param {string} userId
   * @param {string} notificationId
   * @returns {Promise<object>}
   */
  async getById(userId, notificationId) {
    const notification = await this.repo.findByIdAndUser(notificationId, userId);
    if (!notification) {
      throw {
        code: 'NotFound',
        message: 'Notification not found or access denied',
        status: 404,
      };
    }

    return mapId(notification);
  }

  /**
   * List notifications for user with pagination
   * @param {string} userId
   * @param {object} options - { page, pageSize, isRead }
   * @returns {Promise<{items, meta, unreadCount}>}
   */
  async listByUser(userId, { page = 1, pageSize = 20, isRead } = {}) {
    const { items, totalItems, totalPages } = await this.repo.findByUser(userId, {
      page,
      pageSize,
      isRead,
    });

    const unreadCount = await this.repo.countUnread(userId);

    return {
      items: items.map(mapId),
      meta: {
        page,
        pageSize,
        totalItems,
        totalPages,
      },
      unreadCount,
    };
  }

  /**
   * Mark notification as read
   * @param {string} userId
   * @param {string} notificationId
   * @returns {Promise<object>}
   */
  async markAsRead(userId, notificationId) {
    const updated = await this.repo.markAsRead(notificationId, userId);
    if (!updated) {
      throw {
        code: 'NotFound',
        message: 'Notification not found or access denied',
        status: 404,
      };
    }

    logger.info(
      { notificationId, userId },
      '[Notifications] Notification marked as read'
    );

    return mapId(updated);
  }

  /**
   * Mark all notifications as read for user
   * @param {string} userId
   * @returns {Promise<{modifiedCount}>}
   */
  async markAllAsRead(userId) {
    const modifiedCount = await this.repo.markAllAsRead(userId);

    logger.info(
      { userId, modifiedCount },
      '[Notifications] All notifications marked as read'
    );

    return { modifiedCount };
  }

  /**
   * Get unread count for user
   * @param {string} userId
   * @returns {Promise<{unreadCount}>}
   */
  async getUnreadCount(userId) {
    const unreadCount = await this.repo.countUnread(userId);
    return { unreadCount };
  }

  /**
   * Delete notification (soft delete - just remove from DB)
   * @param {string} userId
   * @param {string} notificationId
   * @returns {Promise<void>}
   */
  async deleteNotification(userId, notificationId) {
    // Verify ownership
    const notification = await this.repo.findByIdAndUser(notificationId, userId);
    if (!notification) {
      throw {
        code: 'NotFound',
        message: 'Notification not found or access denied',
        status: 404,
      };
    }

    await this.repo.deleteById(notificationId);

    logger.info(
      { notificationId, userId },
      '[Notifications] Notification deleted'
    );
  }

  /**
   * Cleanup old read notifications (maintenance job)
   * @param {number} daysOld - Delete notifications older than X days
   * @returns {Promise<{deletedCount}>}
   */
  async cleanupOldNotifications(daysOld = 30) {
    const deletedCount = await this.repo.deleteOldRead(daysOld);

    logger.info(
      { deletedCount, daysOld },
      '[Notifications] Old notifications cleaned up'
    );

    return { deletedCount };
  }
}

module.exports = NotificationsService;
