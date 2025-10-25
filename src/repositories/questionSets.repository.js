const BaseRepository = require('./base.repository');
const { QuestionSet } = require('../models');

class QuestionSetsRepository extends BaseRepository {
  constructor() { super(QuestionSet); }
}

module.exports = QuestionSetsRepository;
