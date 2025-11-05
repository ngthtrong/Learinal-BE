class UserSubscriptionsService {
  constructor({ userSubscriptionsRepository, subscriptionPlansRepository }) {
    this.repository = userSubscriptionsRepository;
    this.plansRepository = subscriptionPlansRepository;
  }

  async getUserSubscriptions(userId) {
    const UserSubscription = this.repository.model;
    const subscriptions = await UserSubscription.find({ user: userId })
      .populate('subscriptionPlan')
      .sort({ createdAt: -1 })
      .lean();
    
    return subscriptions.map(this.mapSubscriptionToDTO);
  }

  async getActiveSubscription(userId) {
    const UserSubscription = this.repository.model;
    const subscription = await UserSubscription.findOne({
      user: userId,
      status: 'Active',
    }).populate('subscriptionPlan').lean();
    
    return subscription ? this.mapSubscriptionToDTO(subscription) : null;
  }

  async createSubscription(userId, planId, paymentReference) {
    // Verify plan exists and is active
    const plan = await this.plansRepository.findById(planId);
    if (!plan || plan.status !== 'Active') {
      throw Object.assign(new Error('Invalid subscription plan'), {
        status: 400,
        code: 'InvalidPlan',
      });
    }

    // Cancel any existing active subscription
    await this.repository.updateMany(
      { user: userId, status: 'Active' },
      { status: 'Canceled', canceledAt: new Date() }
    );

    // Calculate dates based on billing cycle
    const startDate = new Date();
    const endDate = new Date();
    if (plan.billingCycle === 'Monthly') {
      endDate.setMonth(endDate.getMonth() + 1);
    } else if (plan.billingCycle === 'Yearly') {
      endDate.setFullYear(endDate.getFullYear() + 1);
    }

    // Create new subscription
    const subscription = await this.repository.create({
      user: userId,
      subscriptionPlan: planId,
      status: 'Active',
      startDate,
      endDate,
      autoRenew: true,
      paymentReference,
    });

    const UserSubscription = this.repository.model;
    const populated = await UserSubscription.findById(subscription._id)
      .populate('subscriptionPlan')
      .lean();
    
    return this.mapSubscriptionToDTO(populated);
  }

  async cancelSubscription(userId, subscriptionId) {
    const subscription = await this.repository.findOne({
      _id: subscriptionId,
      user: userId,
    });

    if (!subscription) {
      throw Object.assign(new Error('Subscription not found'), { status: 404 });
    }

    if (subscription.status !== 'Active') {
      throw Object.assign(new Error('Subscription is not active'), {
        status: 400,
        code: 'InvalidStatus',
      });
    }

    await this.repository.updateById(subscriptionId, {
      status: 'Canceled',
      canceledAt: new Date(),
      autoRenew: false,
    });
  }

  async activateSubscription(userId, subscriptionId) {
    const subscription = await this.repository.findOne({
      _id: subscriptionId,
      user: userId,
    });

    if (!subscription) {
      throw Object.assign(new Error('Subscription not found'), { status: 404 });
    }

    // Cancel other active subscriptions
    await this.repository.updateMany(
      { user: userId, status: 'Active', _id: { $ne: subscriptionId } },
      { status: 'Canceled', canceledAt: new Date() }
    );

    await this.repository.updateById(subscriptionId, {
      status: 'Active',
      startDate: new Date(),
    });
  }

  mapSubscriptionToDTO(subscription) {
    return {
      id: subscription._id.toString(),
      userId: subscription.user.toString(),
      plan: subscription.subscriptionPlan ? {
        id: subscription.subscriptionPlan._id.toString(),
        planName: subscription.subscriptionPlan.planName,
        billingCycle: subscription.subscriptionPlan.billingCycle,
        price: subscription.subscriptionPlan.price,
        entitlements: subscription.subscriptionPlan.entitlements,
      } : null,
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
