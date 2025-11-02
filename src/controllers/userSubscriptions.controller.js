module.exports = {
  me: async (req, res, next) => {
    try {
      const { userSubscriptionsService } = req.app.locals;
      const subscription = await userSubscriptionsService.getActiveSubscription(req.user.userId);
      
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
        req.user.userId,
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
        req.user.userId,
        req.params.id
      );
      
      res.json({ status: 'success', message: 'Subscription canceled' });
    } catch (e) {
      next(e);
    }
  },
};
