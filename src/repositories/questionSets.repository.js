class QuestionSetsRepository {
  constructor(db) {
    this.db = db;
    this.collection = db ? db.collection('questionSets') : null;
  }
}

module.exports = QuestionSetsRepository;
