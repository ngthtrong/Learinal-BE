const BaseRepository = require('./base.repository');
const { QuizAttempt } = require('../models');

class QuizAttemptsRepository extends BaseRepository {
  constructor() { super(QuizAttempt); }
}

module.exports = QuizAttemptsRepository;
