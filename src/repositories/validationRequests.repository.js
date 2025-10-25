class ValidationRequestsRepository {
  constructor(db) {
    this.db = db;
    this.collection = db ? db.collection('validationRequests') : null;
  }
}

module.exports = ValidationRequestsRepository;
