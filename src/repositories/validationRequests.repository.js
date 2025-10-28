const BaseRepository = require('./base.repository');
const { ValidationRequest } = require('../models');

/**
 * ValidationRequestsRepository - Data access for validation requests
 * Handles CRUD with unique constraint (1 open request per set)
 */
class ValidationRequestsRepository extends BaseRepository {
  constructor() {
    super(ValidationRequest);
  }

  /**
   * Find validation requests by status with pagination
   * @param {string} status - PendingAssignment, Assigned, Completed
   * @param {object} options - { page, pageSize, sort }
   */
  async findByStatus(status, { page = 1, pageSize = 20, sort = { requestTime: -1 } } = {}) {
    return this.paginate({ status }, { page, pageSize, sort });
  }

  /**
   * Find validation requests assigned to an expert
   * @param {string} expertId
   * @param {object} options - { page, pageSize, status }
   */
  async findByExpert(expertId, { page = 1, pageSize = 20, status } = {}) {
    const filter = { expertId };
    if (status) filter.status = status;

    return this.paginate(filter, {
      page,
      pageSize,
      sort: { requestTime: -1 },
    });
  }

  /**
   * Find validation requests by learner
   * @param {string} learnerId
   * @param {object} options - { page, pageSize, status }
   */
  async findByLearner(learnerId, { page = 1, pageSize = 20, status } = {}) {
    const filter = { learnerId };
    if (status) filter.status = status;

    return this.paginate(filter, {
      page,
      pageSize,
      sort: { requestTime: -1 },
    });
  }

  /**
   * Find validation request by set ID
   * @param {string} setId
   */
  async findBySetId(setId) {
    return this.Model.findOne({ setId }).lean();
  }

  /**
   * Find open validation request for a set (PendingAssignment or Assigned)
   * @param {string} setId
   */
  async findOpenRequestBySet(setId) {
    return this.Model.findOne({
      setId,
      status: { $in: ['PendingAssignment', 'Assigned'] },
    }).lean();
  }

  /**
   * Assign expert to a pending request
   * @param {string} requestId
   * @param {string} expertId
   * @param {string} adminId
   */
  async assignExpert(requestId, expertId, adminId) {
    return this.Model.findOneAndUpdate(
      { _id: requestId, status: 'PendingAssignment' },
      {
        $set: {
          expertId,
          adminId,
          status: 'Assigned',
        },
      },
      { new: true, runValidators: true }
    ).lean();
  }

  /**
   * Complete validation request
   * @param {string} requestId
   */
  async complete(requestId) {
    return this.Model.findOneAndUpdate(
      { _id: requestId, status: 'Assigned' },
      {
        $set: {
          status: 'Completed',
          completionTime: new Date(),
        },
      },
      { new: true, runValidators: true }
    ).lean();
  }

  /**
   * Count requests by status
   * @param {string} status
   */
  async countByStatus(status) {
    return this.Model.countDocuments({ status });
  }

  /**
   * Count requests by expert and status
   * @param {string} expertId
   * @param {string} status
   */
  async countByExpertAndStatus(expertId, status) {
    return this.Model.countDocuments({ expertId, status });
  }
}

module.exports = ValidationRequestsRepository;
