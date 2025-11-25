const BaseRepository = require("./base.repository");
const UsageTracking = require("../models/usageTracking.model");

class UsageTrackingRepository extends BaseRepository {
  constructor() {
    super(UsageTracking);
  }

  /**
   * Track a usage action
   * @param {string} userId
   * @param {string} actionType - 'question_set_generation' | 'validation_request'
   * @param {string} resourceId - Optional ID of the resource created
   * @param {object} metadata - Optional additional data
   */
  async trackAction(userId, actionType, resourceId = null, metadata = null) {
    return this.create({
      userId,
      actionType,
      resourceId,
      timestamp: new Date(),
      metadata,
    });
  }

  /**
   * Count actions within a date range
   * @param {string} userId
   * @param {string} actionType
   * @param {Date} startDate
   * @param {Date} endDate
   */
  async countActions(userId, actionType, startDate, endDate = null) {
    const filter = {
      userId,
      actionType,
      timestamp: { $gte: startDate },
    };
    if (endDate) {
      filter.timestamp.$lte = endDate;
    }
    return this.countDocuments(filter);
  }
}

module.exports = UsageTrackingRepository;
