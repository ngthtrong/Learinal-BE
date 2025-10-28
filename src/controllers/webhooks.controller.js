const UserSubscriptionsRepository = require('../repositories/userSubscriptions.repository');
const subsRepo = new UserSubscriptionsRepository();
const logger = require('../utils/logger');

module.exports = {
  // POST /webhooks/stripe – minimal stub: accept event and try to activate subscription
  stripe: async (req, res, next) => {
    try {
      const evt = req.body || {};
      // In real integration, verify signature using STRIPE_WEBHOOK_SECRET
      const type = evt.type || 'unknown';
      const data = evt.data?.object || {};

      if (type === 'checkout.session.completed') {
        // Expect metadata with subscriptionId or planId/userId
        const meta = data.metadata || {};
        const subscriptionId = meta.subscriptionId;
        const userId = meta.userId;
        const planId = meta.planId;
        try {
          if (subscriptionId) {
            await subsRepo.updateById(subscriptionId, { $set: { status: 'Active' } }, { new: true });
          } else if (userId && planId) {
            // Activate latest pending subscription for this user+plan
            const candidates = await subsRepo.findMany(
              { userId, planId, status: 'PendingPayment' },
              { sort: { createdAt: -1 }, limit: 1 }
            );
            if (Array.isArray(candidates) && candidates[0]) {
              await subsRepo.updateById(candidates[0]._id || candidates[0].id, { $set: { status: 'Active' } }, { new: true });
            }
          }
        } catch (e) {
          logger.warn({ err: e?.message || e }, '[webhooks] stripe activation failed');
        }
      }

      return res.status(200).json({ received: true });
    } catch (e) { next(e); }
  },
};
