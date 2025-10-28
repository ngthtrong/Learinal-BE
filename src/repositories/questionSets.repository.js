const BaseRepository = require('./base.repository');
const { QuestionSet } = require('../models');

class QuestionSetsRepository extends BaseRepository {
  constructor() {
    super(QuestionSet);
  }

  /**
   * Find question sets by userId with pagination
   * @param {string} userId
   * @param {object} options - { page, pageSize, sort, status }
   * @returns {Promise<{items, totalItems, totalPages}>}
   */
  async findByUserId(userId, { page = 1, pageSize = 20, sort = { createdAt: -1 }, status } = {}) {
    const filter = { userId };
    if (status) filter.status = status;
    return this.paginate(filter, { page, pageSize, sort });
  }

  /**
   * Find question set by ID and userId (ownership check)
   * @param {string} id
   * @param {string} userId
   * @returns {Promise<object|null>}
   */
  async findByIdAndUser(id, userId) {
    return this.findOne({ _id: id, userId });
  }

  /**
   * Find question sets by subject
   * @param {string} subjectId
   * @param {object} options - { page, pageSize, sort }
   * @returns {Promise<{items, totalItems, totalPages}>}
   */
  async findBySubject(subjectId, { page = 1, pageSize = 20, sort = { createdAt: -1 } } = {}) {
    return this.paginate({ subjectId }, { page, pageSize, sort });
  }

  /**
   * Update question set by ID with ownership check
   * @param {string} id
   * @param {string} userId
   * @param {object} updateData
   * @returns {Promise<object|null>}
   */
  async updateByIdAndUser(id, userId, updateData) {
    const updated = await this.Model.findOneAndUpdate(
      { _id: id, userId },
      { $set: updateData },
      { new: true, runValidators: true }
    ).lean();
    return updated;
  }

  /**
   * Delete question set by ID with ownership check
   * @param {string} id
   * @param {string} userId
   * @returns {Promise<boolean>}
   */
  async deleteByIdAndUser(id, userId) {
    const result = await this.Model.deleteOne({ _id: id, userId });
    return result.deletedCount > 0;
  }

  /**
   * Find shared question set by sharedUrl (public access)
   * @param {string} sharedUrl
   * @returns {Promise<object|null>}
   */
  async findBySharedUrl(sharedUrl) {
    return this.findOne({ sharedUrl, isShared: true });
  }

  /**
   * Count question sets by status for a user
   * @param {string} userId
   * @param {string} status
   * @returns {Promise<number>}
   */
  async countByUserAndStatus(userId, status) {
    return this.Model.countDocuments({ userId, status });
  }
}

module.exports = QuestionSetsRepository;
