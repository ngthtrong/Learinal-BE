const BaseRepository = require('./base.repository');
const { CommissionRecord } = require('../models');

class CommissionRecordsRepository extends BaseRepository {
  constructor() { super(CommissionRecord); }

  /**
   * Find commission records by expert ID and status
   */
  async findByExpertAndStatus(expertId, status) {
    return this.find({ expertId, status }, null, { lean: true });
  }
}

module.exports = CommissionRecordsRepository;
