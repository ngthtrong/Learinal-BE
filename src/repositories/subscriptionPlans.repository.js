class SubscriptionPlansRepository {
  constructor(db) {
    this.db = db;
    this.collection = db ? db.collection('subscriptionPlans') : null;
  }
}

module.exports = SubscriptionPlansRepository;
