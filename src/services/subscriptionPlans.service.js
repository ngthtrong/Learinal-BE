class SubscriptionPlansService {
  constructor({ subscriptionPlansRepository, subscriptionPlanAuditLogsRepository }) {
    this.repository = subscriptionPlansRepository;
    this.auditRepository = subscriptionPlanAuditLogsRepository;
  }

  async listActivePlans() {
    const plans = await this.repository.findMany({ status: "Active" });
    return plans.map(this.mapPlanToDTO);
  }

  async listPlans({ status } = {}) {
    const filter = {};
    if (status && status !== "All") {
      filter.status = status; // 'Active' | 'Inactive'
    }
    const plans = await this.repository.findMany(filter);
    return plans.map(this.mapPlanToDTO);
  }

  async createPlan(data, { userId, ipAddress, reason } = {}) {
    // Validate entitlements structure
    this.validateEntitlements(data.entitlements);

    const plan = await this.repository.create({
      planName: data.planName,
      description: data.description,
      billingCycle: data.billingCycle, // 'Monthly' | 'Yearly'
      price: data.price,
      entitlements: data.entitlements,
      status: "Active",
    });

    // Create audit log for CREATE action
    if (this.auditRepository && userId) {
      await this.auditRepository.createLog({
        planId: plan._id,
        action: "CREATE",
        changedBy: userId,
        previousData: null,
        newData: this.mapPlanToDTO(plan),
        changedFields: Object.keys(data),
        reason,
        ipAddress,
      });
    }

    return this.mapPlanToDTO(plan);
  }

  async getPlanById(id) {
    const plan = await this.repository.findById(id);
    return plan ? this.mapPlanToDTO(plan) : null;
  }

  async updatePlan(id, data, { userId, ipAddress, reason } = {}) {
    if (data.entitlements) {
      this.validateEntitlements(data.entitlements);
    }

    // Get previous data for audit log
    const previousPlan = await this.repository.findById(id);
    if (!previousPlan) {
      return null;
    }

    const plan = await this.repository.updateById(id, data, { new: true });
    
    // Create audit log for UPDATE action
    if (this.auditRepository && userId) {
      const changedFields = this.getChangedFields(previousPlan, plan);
      await this.auditRepository.createLog({
        planId: id,
        action: "UPDATE",
        changedBy: userId,
        previousData: this.mapPlanToDTO(previousPlan),
        newData: this.mapPlanToDTO(plan),
        changedFields,
        reason,
        ipAddress,
      });
    }

    return plan ? this.mapPlanToDTO(plan) : null;
  }

  async archivePlan(id, { userId, ipAddress, reason } = {}) {
    // Get previous data for audit log
    const previousPlan = await this.repository.findById(id);
    
    await this.repository.updateById(id, { status: "Archived" }, { new: true });

    // Create audit log for ARCHIVE action
    if (this.auditRepository && userId && previousPlan) {
      await this.auditRepository.createLog({
        planId: id,
        action: "ARCHIVE",
        changedBy: userId,
        previousData: this.mapPlanToDTO(previousPlan),
        newData: { ...this.mapPlanToDTO(previousPlan), status: "Archived" },
        changedFields: ["status"],
        reason,
        ipAddress,
      });
    }
  }

  async deletePlan(id, { userId, ipAddress, reason } = {}) {
    // Get previous data for audit log
    const previousPlan = await this.repository.findById(id);

    await this.repository.deleteById(id);

    // Create audit log for DELETE action
    if (this.auditRepository && userId && previousPlan) {
      await this.auditRepository.createLog({
        planId: id,
        action: "DELETE",
        changedBy: userId,
        previousData: this.mapPlanToDTO(previousPlan),
        newData: null,
        changedFields: [],
        reason,
        ipAddress,
      });
    }
  }

  // ============ Audit Log Methods ============

  async getPlanAuditHistory(planId, { limit = 50, skip = 0 } = {}) {
    if (!this.auditRepository) {
      return { logs: [], total: 0 };
    }
    const logs = await this.auditRepository.getHistoryByPlanId(planId, { limit, skip });
    return logs.map(this.mapAuditLogToDTO);
  }

  async getAllAuditLogs({ limit = 50, skip = 0, action, planId, changedBy } = {}) {
    if (!this.auditRepository) {
      return { logs: [], total: 0 };
    }
    const { logs, total } = await this.auditRepository.getAllLogs({ limit, skip, action, planId, changedBy });
    return {
      logs: logs.map(this.mapAuditLogToDTO),
      total,
    };
  }

  async getAuditLogById(logId) {
    if (!this.auditRepository) {
      return null;
    }
    const log = await this.auditRepository.getLogById(logId);
    return log ? this.mapAuditLogToDTO(log) : null;
  }

  // ============ Helper Methods ============

  /**
   * Compare two plan objects and return list of changed fields
   */
  getChangedFields(previousPlan, newPlan) {
    const fields = ["planName", "description", "billingCycle", "price", "entitlements", "status"];
    const changedFields = [];

    for (const field of fields) {
      const prevValue = JSON.stringify(previousPlan[field]);
      const newValue = JSON.stringify(newPlan[field]);
      if (prevValue !== newValue) {
        changedFields.push(field);
      }
    }

    return changedFields;
  }

  validateEntitlements(entitlements) {
    const required = [
      "maxMonthlyTestGenerations",
      "maxValidationRequests",
      "priorityProcessing",
      "canShare",
      "maxSubjects",
    ];

    for (const field of required) {
      if (!(field in entitlements)) {
        throw Object.assign(new Error(`Missing required entitlement: ${field}`), {
          status: 400,
          code: "ValidationError",
        });
      }
    }
  }

  mapPlanToDTO(plan) {
    return {
      id: plan._id.toString(),
      planName: plan.planName,
      description: plan.description,
      billingCycle: plan.billingCycle,
      price: plan.price,
      entitlements: plan.entitlements,
      status: plan.status,
      createdAt: plan.createdAt,
      updatedAt: plan.updatedAt,
    };
  }

  mapAuditLogToDTO(log) {
    return {
      id: log._id.toString(),
      planId: log.planId?._id?.toString() || log.planId?.toString(),
      planName: log.planId?.planName || null,
      action: log.action,
      changedBy: log.changedBy ? {
        id: log.changedBy._id?.toString() || log.changedBy.toString(),
        fullName: log.changedBy.fullName || null,
        email: log.changedBy.email || null,
      } : null,
      changedAt: log.changedAt,
      previousData: log.previousData,
      newData: log.newData,
      changedFields: log.changedFields,
      reason: log.reason,
    };
  }
}

module.exports = SubscriptionPlansService;
