const User = require('../models/user.model');
const UserSubscription = require('../models/userSubscription.model');

module.exports = {
  me: async (req, res, next) => {
    try {
      const { userSubscriptionsService } = req.app.locals;
      let subscription = await userSubscriptionsService.getActiveSubscription(req.user.id);
      
      // If no UserSubscription found, check User model and migrate data
      if (!subscription) {
        const user = await User.findById(req.user.id).lean();
        
      if (user && user.subscriptionStatus === 'Active' && user.subscriptionPlanId) {
        // Create UserSubscription record from User model data
        const _newSubscription = await UserSubscription.create({
          userId: user._id,
          planId: user.subscriptionPlanId,
          startDate: user.createdAt, // Use user creation date as fallback
          endDate: user.subscriptionRenewalDate,
          renewalDate: user.subscriptionRenewalDate,
          status: 'Active',
          entitlementsSnapshot: null,
        });          // Fetch the newly created subscription with populated plan
          subscription = await userSubscriptionsService.getActiveSubscription(req.user.id);
        }
      }
      
      if (!subscription) {
        return res.json({
          status: 'success',
          data: { subscription: null, message: 'No active subscription' },
        });
      }
      
      res.json({ status: 'success', data: { subscription } });
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
      
      res.status(201).json({ status: 'success', data: { subscription } });
    } catch (e) {
      next(e);
    }
  },

  cancel: async (req, res, next) => {
    try {
      const { userSubscriptionsService } = req.app.locals;
      await userSubscriptionsService.cancelSubscription(
        req.user.id,
        req.params.id
      );
      
      res.json({ status: 'success', message: 'Subscription canceled' });
    } catch (e) {
      next(e);
    }
  },
};
