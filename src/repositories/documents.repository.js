const BaseRepository = require('./base.repository');
const { Document } = require('../models');

class DocumentsRepository extends BaseRepository {
  constructor() {
    super(Document);
  }

  /**
   * Find documents by subjectId with pagination
   * @param {string} subjectId
   * @param {object} options - { page, pageSize, sort }
   * @returns {Promise<{items, totalItems, totalPages}>}
   */
  async findBySubject(subjectId, { page = 1, pageSize = 20, sort = { uploadedAt: -1 } } = {}) {
    return this.paginate({ subjectId }, { page, pageSize, sort });
  }

  /**
   * Find documents by ownerId with pagination
   * @param {string} ownerId
   * @param {object} options - { page, pageSize, sort, status }
   * @returns {Promise<{items, totalItems, totalPages}>}
   */
  async findByOwner(ownerId, { page = 1, pageSize = 20, sort = { uploadedAt: -1 }, status } = {}) {
    const filter = { ownerId };
    if (status) filter.status = status;
    return this.paginate(filter, { page, pageSize, sort });
  }

  /**
   * Find document by ID and ownerId (ownership check)
   * @param {string} id
   * @param {string} ownerId
   * @returns {Promise<object|null>}
   */
  async findByIdAndOwner(id, ownerId) {
    return this.findOne({ _id: id, ownerId });
  }

  /**
   * Update document status
   * @param {string} id
   * @param {string} status - Uploading|Processing|Completed|Error
   * @param {object} additionalData - { extractedText?, summaryShort?, summaryFull?, summaryUpdatedAt? }
   * @returns {Promise<object|null>}
   */
  async updateStatus(id, status, additionalData = {}) {
    const updateData = { status, ...additionalData };
    return this.Model.findByIdAndUpdate(
      id,
      { $set: updateData },
      { new: true, runValidators: true }
    ).lean();
  }

  /**
   * Delete document by ID with ownership check
   * @param {string} id
   * @param {string} ownerId
   * @returns {Promise<boolean>}
   */
  async deleteByIdAndOwner(id, ownerId) {
    const result = await this.Model.deleteOne({ _id: id, ownerId });
    return result.deletedCount > 0;
  }

  /**
   * Count documents by subject
   * @param {string} subjectId
   * @returns {Promise<number>}
   */
  async countBySubject(subjectId) {
    return this.Model.countDocuments({ subjectId });
  }

  /**
   * Find documents by status (for background processing)
   * @param {string} status
   * @param {number} limit
   * @returns {Promise<object[]>}
   */
  async findByStatus(status, limit = 10) {
    return this.Model.find({ status })
      .sort({ uploadedAt: 1 })
      .limit(limit)
      .lean();
  }
}

module.exports = DocumentsRepository;
