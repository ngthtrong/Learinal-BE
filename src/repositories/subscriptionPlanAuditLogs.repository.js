const BaseRepository = require("./base.repository");
const SubscriptionPlanAuditLog = require("../models/subscriptionPlanAuditLog.model");

class SubscriptionPlanAuditLogsRepository extends BaseRepository {
  constructor() {
    super(SubscriptionPlanAuditLog);
  }

  /**
   * Create an audit log entry
   */
  async createLog({ planId, action, changedBy, previousData, newData, changedFields, reason, ipAddress }) {
    return this.create({
      planId,
      action,
      changedBy,
      changedAt: new Date(),
      previousData,
      newData,
      changedFields: changedFields || [],
      reason,
      ipAddress,
    });
  }

  /**
   * Get audit history for a specific plan
   */
  async getHistoryByPlanId(planId, { limit = 50, skip = 0 } = {}) {
    return this.model
      .find({ planId })
      .sort({ changedAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("changedBy", "fullName email")
      .lean();
  }

  /**
   * Get all audit logs with pagination
   */
  async getAllLogs({ limit = 50, skip = 0, action, planId, changedBy } = {}) {
    const filter = {};
    if (action) filter.action = action;
    if (planId) filter.planId = planId;
    if (changedBy) filter.changedBy = changedBy;

    const [logs, total] = await Promise.all([
      this.model
        .find(filter)
        .sort({ changedAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate("changedBy", "fullName email")
        .populate("planId", "planName")
        .lean(),
      this.model.countDocuments(filter),
    ]);

    return { logs, total };
  }

  /**
   * Get a specific audit log entry by ID
   */
  async getLogById(logId) {
    return this.model
      .findById(logId)
      .populate("changedBy", "fullName email")
      .populate("planId", "planName")
      .lean();
  }
}

module.exports = SubscriptionPlanAuditLogsRepository;
