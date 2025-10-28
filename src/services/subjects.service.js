const SubjectsRepository = require('../repositories/subjects.repository');

/**
 * Map MongoDB document to API DTO (remove _id, __v)
 * @param {object|null} doc
 * @returns {object|null}
 */
function mapId(doc) {
  if (!doc) return null;
  const { _id, __v, ...rest } = doc;
  return { id: String(_id || rest.id), ...rest };
}

/**
 * SubjectsService - Business logic for subjects management
 * Handles CRUD operations with ownership validation
 */
class SubjectsService {
  constructor() {
    this.repo = new SubjectsRepository();
  }

  /**
   * List subjects for a specific user with pagination and sorting
   * @param {string} userId
   * @param {object} options - { page, pageSize, sort }
   * @returns {Promise<{items, meta}>}
   */
  async listByUser(userId, { page = 1, pageSize = 20, sort = '-createdAt' } = {}) {
    // Parse sort parameter (e.g., "-createdAt" -> { createdAt: -1 })
    const sortObj = this._parseSortParam(sort);
    
    const { items, totalItems, totalPages } = await this.repo.findByUserId(userId, {
      page,
      pageSize,
      sort: sortObj,
    });

    return {
      items: (items || []).map(mapId),
      meta: { page, pageSize, totalItems, totalPages },
    };
  }

  /**
   * Create a new subject for user
   * @param {string} userId
   * @param {object} payload - { subjectName, description?, tableOfContents?, summary? }
   * @returns {Promise<object>}
   */
  async create(userId, payload) {
    // Validation
    if (!payload.subjectName || payload.subjectName.trim().length === 0) {
      throw { code: 'ValidationError', message: 'subjectName is required', status: 400 };
    }

    const toCreate = {
      userId,
      subjectName: payload.subjectName.trim(),
      description: payload.description || undefined,
      tableOfContents: payload.tableOfContents || [],
      summary: payload.summary || undefined,
    };

    const created = await this.repo.create(toCreate);
    return mapId(created);
  }

  /**
   * Get subject by ID with ownership check
   * @param {string} userId
   * @param {string} subjectId
   * @returns {Promise<object>}
   * @throws {NotFound} if subject doesn't exist or user doesn't own it
   */
  async getByIdOwned(userId, subjectId) {
    const found = await this.repo.findByIdAndUser(subjectId, userId);
    if (!found) {
      throw { code: 'NotFound', message: 'Subject not found or access denied', status: 404 };
    }
    return mapId(found);
  }

  /**
   * Update subject with ownership check
   * @param {string} userId
   * @param {string} subjectId
   * @param {object} payload - { subjectName?, description?, tableOfContents?, summary? }
   * @returns {Promise<object>}
   * @throws {NotFound} if subject doesn't exist or user doesn't own it
   */
  async updateOwned(userId, subjectId, payload) {
    // Build allowed fields (prevent userId override)
    const allowed = {};
    if (payload.subjectName !== undefined) {
      if (payload.subjectName.trim().length === 0) {
        throw { code: 'ValidationError', message: 'subjectName cannot be empty', status: 400 };
      }
      allowed.subjectName = payload.subjectName.trim();
    }
    if (payload.description !== undefined) allowed.description = payload.description;
    if (payload.tableOfContents !== undefined) allowed.tableOfContents = payload.tableOfContents;
    if (payload.summary !== undefined) allowed.summary = payload.summary;

    const updated = await this.repo.updateByIdAndUser(subjectId, userId, allowed);
    if (!updated) {
      throw { code: 'NotFound', message: 'Subject not found or access denied', status: 404 };
    }

    return mapId(updated);
  }

  /**
   * Delete subject with ownership check
   * @param {string} userId
   * @param {string} subjectId
   * @returns {Promise<void>}
   * @throws {NotFound} if subject doesn't exist or user doesn't own it
   */
  async removeOwned(userId, subjectId) {
    const deleted = await this.repo.deleteByIdAndUser(subjectId, userId);
    if (!deleted) {
      throw { code: 'NotFound', message: 'Subject not found or access denied', status: 404 };
    }
  }

  /**
   * Parse sort parameter from query string
   * Examples: "-createdAt" -> { createdAt: -1 }, "subjectName" -> { subjectName: 1 }
   * @param {string} sortParam
   * @returns {object}
   * @private
   */
  _parseSortParam(sortParam) {
    if (!sortParam || typeof sortParam !== 'string') {
      return { createdAt: -1 }; // default
    }

    const order = sortParam.startsWith('-') ? -1 : 1;
    const field = sortParam.startsWith('-') ? sortParam.slice(1) : sortParam;

    // Whitelist allowed sort fields
    const allowedFields = ['createdAt', 'updatedAt', 'subjectName'];
    if (!allowedFields.includes(field)) {
      return { createdAt: -1 }; // fallback to default
    }

    return { [field]: order };
  }
}

module.exports = SubjectsService;
