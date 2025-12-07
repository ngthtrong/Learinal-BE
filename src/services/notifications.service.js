class NotificationsService {
  constructor({ notificationsRepository }) {
    this.notificationsRepository = notificationsRepository;
  }

  async createNotification({ userId, title, message, type = 'info', relatedEntityType, relatedEntityId }) {
    return await this.notificationsRepository.create({
      userId,
      title,
      message,
      type,
      relatedEntityType,
      relatedEntityId,
      isRead: false,
    });
  }
}

module.exports = NotificationsService;
