const BaseRepository = require('./base.repository');
const { Subject } = require('../models');

class SubjectsRepository extends BaseRepository {
  constructor() { super(Subject); }
}

module.exports = SubjectsRepository;
