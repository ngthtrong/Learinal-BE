const BaseRepository = require('./base.repository');
const { QuizAttempt } = require('../models');

class QuizAttemptsRepository extends BaseRepository {
  constructor() {
    super(QuizAttempt);
  }

  /**
   * Find quiz attempts by userId with pagination
   * @param {string} userId
   * @param {object} options - { page, pageSize, sort }
   * @returns {Promise<{items, totalItems, totalPages}>}
   */
  async findByUserId(userId, { page = 1, pageSize = 20, sort = { endTime: -1 } } = {}) {
    return this.paginate({ userId }, { page, pageSize, sort });
  }

  /**
   * Find quiz attempts by setId with pagination
   * @param {string} setId
   * @param {object} options - { page, pageSize, sort }
   * @returns {Promise<{items, totalItems, totalPages}>}
   */
  async findBySetId(setId, { page = 1, pageSize = 20, sort = { endTime: -1 } } = {}) {
    return this.paginate({ setId }, { page, pageSize, sort });
  }

  /**
   * Find quiz attempt by ID and userId (ownership check)
   * @param {string} id
   * @param {string} userId
   * @returns {Promise<object|null>}
   */
  async findByIdAndUser(id, userId) {
    return this.findOne({ _id: id, userId });
  }

  /**
   * Count completed quiz attempts for a question set
   * @param {string} setId
   * @returns {Promise<number>}
   */
  async countCompletedBySet(setId) {
    return this.Model.countDocuments({ setId, isCompleted: true });
  }

  /**
   * Get average score for a question set
   * @param {string} setId
   * @returns {Promise<number>}
   */
  async getAverageScoreBySet(setId) {
    const result = await this.Model.aggregate([
      { $match: { setId: this.Model.base.Types.ObjectId(setId), isCompleted: true } },
      { $group: { _id: null, avgScore: { $avg: '$score' } } },
    ]);
    return result.length > 0 ? result[0].avgScore : 0;
  }

  /**
   * Find user's best attempt for a question set
   * @param {string} userId
   * @param {string} setId
   * @returns {Promise<object|null>}
   */
  async findBestAttempt(userId, setId) {
    return this.Model.findOne({ userId, setId, isCompleted: true })
      .sort({ score: -1, endTime: -1 })
      .lean();
  }

  /**
   * Count total attempts by user
   * @param {string} userId
   * @returns {Promise<number>}
   */
  async countByUser(userId) {
    return this.Model.countDocuments({ userId });
  }
}

module.exports = QuizAttemptsRepository;
