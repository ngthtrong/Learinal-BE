class SubscriptionPlansService {
  constructor({ subscriptionPlansRepository }) {
    this.repository = subscriptionPlansRepository;
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

  async createPlan(data) {
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

    return this.mapPlanToDTO(plan);
  }

  async getPlanById(id) {
    const plan = await this.repository.findById(id);
    return plan ? this.mapPlanToDTO(plan) : null;
  }

  async updatePlan(id, data) {
    if (data.entitlements) {
      this.validateEntitlements(data.entitlements);
    }

    const plan = await this.repository.updateById(id, data, { new: true });
    return plan ? this.mapPlanToDTO(plan) : null;
  }

  async archivePlan(id) {
    await this.repository.updateById(id, { status: "Archived" }, { new: true });
  }

  validateEntitlements(entitlements) {
    const required = [
      "maxMonthlyTestGenerations",
      "maxValidationRequests",
      "priorityProcessing",
      "shareLimits",
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
}

module.exports = SubscriptionPlansService;
