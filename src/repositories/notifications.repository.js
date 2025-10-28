const BaseRepository = require('./base.repository');
const { Notification } = require('../models');

/**
 * NotificationsRepository - Data access for in-app notifications
 * Handles user-specific notifications with read/unread tracking
 */
class NotificationsRepository extends BaseRepository {
  constructor() {
    super(Notification);
  }

  /**
   * Find notifications for a user with pagination
   * @param {string} userId
   * @param {object} options - { page, pageSize, isRead }
   */
  async findByUser(userId, { page = 1, pageSize = 20, isRead } = {}) {
    const filter = { userId };
    if (typeof isRead === 'boolean') {
      filter.isRead = isRead;
    }

    return this.paginate(filter, {
      page,
      pageSize,
      sort: { createdAt: -1 },
    });
  }

  /**
   * Mark notification as read
   * @param {string} notificationId
   * @param {string} userId - For ownership check
   */
  async markAsRead(notificationId, userId) {
    return this.Model.findOneAndUpdate(
      { _id: notificationId, userId },
      { $set: { isRead: true } },
      { new: true, runValidators: true }
    ).lean();
  }

  /**
   * Mark all notifications as read for a user
   * @param {string} userId
   */
  async markAllAsRead(userId) {
    const result = await this.Model.updateMany(
      { userId, isRead: false },
      { $set: { isRead: true } }
    );
    return result.modifiedCount;
  }

  /**
   * Count unread notifications for a user
   * @param {string} userId
   */
  async countUnread(userId) {
    return this.Model.countDocuments({ userId, isRead: false });
  }

  /**
   * Delete old read notifications (cleanup)
   * @param {number} daysOld - Delete notifications older than X days
   */
  async deleteOldRead(daysOld = 30) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);

    const result = await this.Model.deleteMany({
      isRead: true,
      createdAt: { $lt: cutoffDate },
    });

    return result.deletedCount;
  }

  /**
   * Find notification by ID with user ownership check
   * @param {string} notificationId
   * @param {string} userId
   */
  async findByIdAndUser(notificationId, userId) {
    return this.Model.findOne({ _id: notificationId, userId }).lean();
  }
}

module.exports = NotificationsRepository;
