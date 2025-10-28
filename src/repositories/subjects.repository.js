const BaseRepository = require('./base.repository');
const { Subject } = require('../models');

class SubjectsRepository extends BaseRepository {
  constructor() {
    super(Subject);
  }

  /**
   * Find all subjects by userId with lean query
   * @param {string} userId
   * @param {object} options - { page, pageSize, sort }
   * @returns {Promise<{items, totalItems, totalPages}>}
   */
  async findByUserId(userId, { page = 1, pageSize = 20, sort = { createdAt: -1 } } = {}) {
    return this.paginate({ userId }, { page, pageSize, sort });
  }

  /**
   * Find one subject by ID and userId (ownership check)
   * @param {string} id
   * @param {string} userId
   * @returns {Promise<object|null>}
   */
  async findByIdAndUser(id, userId) {
    return this.findOne({ _id: id, userId });
  }

  /**
   * Update subject by ID with ownership check
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
   * Delete subject by ID with ownership check
   * @param {string} id
   * @param {string} userId
   * @returns {Promise<boolean>}
   */
  async deleteByIdAndUser(id, userId) {
    const result = await this.Model.deleteOne({ _id: id, userId });
    return result.deletedCount > 0;
  }

  /**
   * Count subjects by userId
   * @param {string} userId
   * @returns {Promise<number>}
   */
  async countByUserId(userId) {
    return this.Model.countDocuments({ userId });
  }
}

module.exports = SubjectsRepository;
