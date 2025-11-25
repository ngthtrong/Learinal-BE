class UserSubscriptionsService {
  constructor({ userSubscriptionsRepository, subscriptionPlansRepository }) {
    this.repository = userSubscriptionsRepository;
    this.plansRepository = subscriptionPlansRepository;
  }

  async getUserSubscriptions(userId) {
    const UserSubscription = this.repository.model;
    const subscriptions = await UserSubscription.find({ userId: userId })
      .populate("planId")
      .sort({ createdAt: -1 })
      .lean();

    return subscriptions.map(this.mapSubscriptionToDTO);
  }

  async getActiveSubscription(userId) {
    const UserSubscription = this.repository.model;
    const subscription = await UserSubscription.findOne({
      userId: userId,
      status: "Active",
    })
      .populate("planId")
      .lean();

    return subscription ? this.mapSubscriptionToDTO(subscription) : null;
  }

  async createSubscription(userId, planId, paymentReference) {
    // Verify plan exists and is active
    const plan = await this.plansRepository.findById(planId);
    if (!plan || plan.status !== "Active") {
      throw Object.assign(new Error("Invalid subscription plan"), {
        status: 400,
        code: "InvalidPlan",
      });
    }

    // Cancel any existing active subscription
    await this.repository.updateMany(
      { userId: userId, status: "Active" },
      { status: "Canceled", canceledAt: new Date() }
    );

    // Calculate dates based on billing cycle
    const startDate = new Date();
    const endDate = new Date();
    if (plan.billingCycle === "Monthly") {
      endDate.setMonth(endDate.getMonth() + 1);
    } else if (plan.billingCycle === "Yearly") {
      endDate.setFullYear(endDate.getFullYear() + 1);
    }

    // Check if user has previously subscribed to this plan (Canceled or Expired)
    const existingSubscription = await this.repository.findOne({
      userId: userId,
      planId: planId,
      status: { $in: ["Canceled", "Expired"] },
    });

    let subscription;
    if (existingSubscription) {
      // Reactivate existing subscription with new dates
      subscription = await this.repository.updateById(existingSubscription._id, {
        status: "Active",
        startDate,
        endDate,
        renewalDate: endDate,
        autoRenew: true,
        paymentReference,
        canceledAt: null, // Clear canceledAt field
      });
    } else {
      // Create new subscription
      subscription = await this.repository.create({
        userId: userId,
        planId: planId,
        status: "Active",
        startDate,
        endDate,
        renewalDate: endDate,
        autoRenew: true,
        paymentReference,
      });
    }

    const UserSubscription = this.repository.model;
    const populated = await UserSubscription.findById(subscription._id || subscription.id)
      .populate("planId")
      .lean();

    return this.mapSubscriptionToDTO(populated);
  }

  async cancelSubscription(userId, subscriptionId) {
    console.log("Canceling subscription:", subscriptionId, "for user:", userId);

    const subscription = await this.repository.findOne({
      _id: subscriptionId,
      userId: userId,
    });

    console.log("Found subscription:", subscription);

    if (!subscription) {
      throw Object.assign(new Error("Subscription not found"), { status: 404 });
    }

    if (subscription.status !== "Active") {
      throw Object.assign(new Error("Subscription is not active"), {
        status: 400,
        code: "InvalidStatus",
      });
    }

    console.log("Updating subscription status to Canceled...");
    const updatedSubscription = await this.repository.updateById(subscriptionId, {
      status: "Canceled",
      canceledAt: new Date(),
      autoRenew: false,
    });

    console.log("Updated subscription:", updatedSubscription);
    return updatedSubscription;
  }

  async activateSubscription(userId, subscriptionId) {
    const subscription = await this.repository.findOne({
      _id: subscriptionId,
      userId: userId,
    });

    if (!subscription) {
      throw Object.assign(new Error("Subscription not found"), { status: 404 });
    }

    // Cancel other active subscriptions
    await this.repository.updateMany(
      { userId: userId, status: "Active", _id: { $ne: subscriptionId } },
      { status: "Canceled", canceledAt: new Date() }
    );

    await this.repository.updateById(subscriptionId, {
      status: "Active",
      startDate: new Date(),
    });
  }

  mapSubscriptionToDTO(subscription) {
    return {
      id: subscription._id.toString(),
      userId: subscription.userId.toString(),
      plan: subscription.planId
        ? {
            id: subscription.planId._id.toString(),
            planName: subscription.planId.planName,
            billingCycle: subscription.planId.billingCycle,
            price: subscription.planId.price,
            entitlements: subscription.planId.entitlements,
          }
        : null,
      status: subscription.status,
      startDate: subscription.startDate,
      endDate: subscription.endDate,
      autoRenew: subscription.autoRenew,
      paymentReference: subscription.paymentReference,
      createdAt: subscription.createdAt,
      updatedAt: subscription.updatedAt,
    };
  }
}

module.exports = UserSubscriptionsService;
