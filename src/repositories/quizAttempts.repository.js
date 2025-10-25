class QuizAttemptsRepository {
  constructor(db) {
    this.db = db;
    this.collection = db ? db.collection('quizAttempts') : null;
  }
}

module.exports = QuizAttemptsRepository;
