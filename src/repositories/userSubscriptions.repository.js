class UserSubscriptionsRepository {
  constructor(db) {
    this.db = db;
    this.collection = db ? db.collection('userSubscriptions') : null;
  }
}

module.exports = UserSubscriptionsRepository;
