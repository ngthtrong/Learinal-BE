const BaseRepository = require('./base.repository');
const { CommissionRecord } = require('../models');

class CommissionRecordsRepository extends BaseRepository {
  constructor() { super(CommissionRecord); }
}

module.exports = CommissionRecordsRepository;
