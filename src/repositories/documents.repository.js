class DocumentsRepository {
  constructor(db) {
    this.db = db;
    this.collection = db ? db.collection('documents') : null;
  }
}

module.exports = DocumentsRepository;
