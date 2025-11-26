const User = require("../models/user.model");
const UserSubscription = require("../models/userSubscription.model");

/**
 * Tính ngày bắt đầu chu kỳ billing hiện tại
 */
function getBillingCycleStart(subscriptionStartDate) {
  const start = new Date(subscriptionStartDate);
  const now = new Date();
  
  // Tính số tháng đã trôi qua từ ngày bắt đầu
  const monthsDiff = (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth());
  
  // Ngày bắt đầu chu kỳ hiện tại
  const cycleStart = new Date(start);
  cycleStart.setMonth(cycleStart.getMonth() + monthsDiff);
  
  // Nếu ngày hiện tại < ngày bắt đầu chu kỳ này, lùi lại 1 tháng
  if (now < cycleStart) {
    cycleStart.setMonth(cycleStart.getMonth() - 1);
  }
  
  return cycleStart;
}

module.exports = {
  me: async (req, res, next) => {
    try {
      const { userSubscriptionsService, userSubscriptionsRepository } = req.app.locals;
      let subscription = await userSubscriptionsService.getActiveSubscription(req.user.id);

      // If no active subscription, check if user has any subscription (including Canceled/Expired)
      if (!subscription) {
        // Check if user has any subscription record at all
        const anySubscription = await userSubscriptionsRepository.findOne({ userId: req.user.id });

        // Only migrate from User model if there's NO subscription record at all
        if (!anySubscription) {
          const user = await User.findById(req.user.id).lean();

          if (user && user.subscriptionStatus === "Active" && user.subscriptionPlanId) {
            // Create UserSubscription record from User model data
            const _newSubscription = await UserSubscription.create({
              userId: user._id,
              planId: user.subscriptionPlanId,
              startDate: user.createdAt, // Use user creation date as fallback
              endDate: user.subscriptionRenewalDate,
              renewalDate: user.subscriptionRenewalDate,
              status: "Active",
              entitlementsSnapshot: null,
            });
            // Fetch the newly created subscription with populated plan
            subscription = await userSubscriptionsService.getActiveSubscription(req.user.id);
          }
        } else {
          // User has subscription record but it's not Active (Canceled/Expired)
          // Return the most recent subscription regardless of status
          subscription = await userSubscriptionsRepository.findOne(
            { userId: req.user.id },
            { sort: { createdAt: -1 } }
          );
          // Populate plan if needed
          if (subscription && subscription.planId) {
            const SubscriptionPlan = require("../models/subscriptionPlan.model");
            const plan = await SubscriptionPlan.findById(subscription.planId).lean();
            subscription = { ...subscription, plan };
          }
        }
      }

      if (!subscription) {
        return res.json({
          status: "success",
          data: { subscription: null, message: "No active subscription" },
        });
      }

      res.json({ status: "success", data: { subscription } });
    } catch (e) {
      next(e);
    }
  },

  create: async (req, res, next) => {
    try {
      const { userSubscriptionsService } = req.app.locals;
      const { planId, paymentReference } = req.body;

      const subscription = await userSubscriptionsService.createSubscription(
        req.user.id,
        planId,
        paymentReference
      );

      res.status(201).json({ status: "success", data: { subscription } });
    } catch (e) {
      next(e);
    }
  },

  cancel: async (req, res, next) => {
    try {
      const { userSubscriptionsService } = req.app.locals;
      const subscription = await userSubscriptionsService.cancelSubscription(
        req.user.id,
        req.params.id
      );

      res.json({ status: "success", message: "Subscription canceled", data: { subscription } });
    } catch (e) {
      next(e);
    }
  },

  /**
   * GET /user-subscriptions/me/usage
   * Lấy thông tin usage stats của user trong chu kỳ hiện tại
   */
  getMyUsage: async (req, res, next) => {
    try {
      const { 
        userSubscriptionsService, 
        usageTrackingRepository,
        addonPackagesService 
      } = req.app.locals;
      
      const subscription = await userSubscriptionsService.getActiveSubscription(req.user.id);
      
      if (!subscription || !subscription.plan) {
        return res.json({
          status: "success",
          data: {
            usedTestGenerations: 0,
            usedValidationRequests: 0,
            maxTestGenerations: 0,
            maxValidationRequests: 0,
            addonTestGenerations: 0,
            addonValidationRequests: 0,
            addonPurchasedTestGenerations: 0,
            addonPurchasedValidationRequests: 0,
            billingCycleStart: null,
            hasActiveSubscription: false
          }
        });
      }

      // Tính billing cycle start
      const subscriptionStartDate = subscription.startDate || subscription.createdAt || new Date();
      const billingCycleStart = getBillingCycleStart(subscriptionStartDate);

      // Đếm số lượt đã dùng trong chu kỳ này
      const [usedTestGenerations, usedValidationRequests] = await Promise.all([
        usageTrackingRepository.countActions(req.user.id, "question_set_generation", billingCycleStart),
        usageTrackingRepository.countActions(req.user.id, "validation_request", billingCycleStart)
      ]);

      // Lấy giới hạn từ subscription
      const entitlements = subscription.entitlementsSnapshot || subscription.plan.entitlements || {};
      const maxTestGenerations = entitlements.maxMonthlyTestGenerations ?? 0;
      const maxValidationRequests = entitlements.maxValidationRequests ?? 0;

      // Lấy quota từ addon
      let addonTestGenerations = 0;       // Số lượt còn lại (remaining)
      let addonValidationRequests = 0;
      let addonPurchasedTestGenerations = 0;   // Số lượt đã mua từ đầu (purchased)
      let addonPurchasedValidationRequests = 0;
      
      if (addonPackagesService) {
        const [addonQuota, addonPurchased] = await Promise.all([
          addonPackagesService.getUserAddonQuota(req.user.id),
          addonPackagesService.getUserAddonPurchasedQuota(req.user.id)
        ]);
        addonTestGenerations = addonQuota.totalTestGenerations || 0;
        addonValidationRequests = addonQuota.totalValidationRequests || 0;
        addonPurchasedTestGenerations = addonPurchased.totalTestGenerations || 0;
        addonPurchasedValidationRequests = addonPurchased.totalValidationRequests || 0;
      }

      res.json({
        status: "success",
        data: {
          usedTestGenerations,
          usedValidationRequests,
          maxTestGenerations,
          maxValidationRequests,
          addonTestGenerations,           // Còn lại từ addon
          addonValidationRequests,
          addonPurchasedTestGenerations,  // Đã mua từ addon (không đổi)
          addonPurchasedValidationRequests,
          billingCycleStart,
          hasActiveSubscription: true
        }
      });
    } catch (e) {
      next(e);
    }
  },
};
