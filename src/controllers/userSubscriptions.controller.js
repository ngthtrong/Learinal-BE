const User = require("../models/user.model");
const UserSubscription = require("../models/userSubscription.model");

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
};
