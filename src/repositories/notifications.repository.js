class NotificationsRepository {
  constructor(db) {
    this.db = db;
    this.collection = db ? db.collection('notifications') : null;
  }
}

module.exports = NotificationsRepository;
