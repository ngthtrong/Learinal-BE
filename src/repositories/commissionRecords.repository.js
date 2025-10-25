class CommissionRecordsRepository {
  constructor(db) {
    this.db = db;
    this.collection = db ? db.collection('commissionRecords') : null;
  }
}

module.exports = CommissionRecordsRepository;
