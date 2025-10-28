const SubscriptionPlansRepository = require('../repositories/subscriptionPlans.repository');
const UserSubscriptionsRepository = require('../repositories/userSubscriptions.repository');
const { env } = require('../config');

const plansRepo = new SubscriptionPlansRepository();
const subsRepo = new UserSubscriptionsRepository();

function addMonths(date, months) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

function addYears(date, years) {
  const d = new Date(date);
  d.setFullYear(d.getFullYear() + years);
  return d;
}

function map(doc) {
  if (!doc) return doc;
  const { _id, __v, ...rest } = doc;
  return { id: String(_id || rest.id), ...rest };
}

module.exports = {
  // POST /subscriptions { planId }
  create: async (req, res, next) => {
    try {
      const user = req.user;
      const { planId } = req.body || {};
      if (!planId) {
        return res.status(400).json({ code: 'ValidationError', message: 'planId is required' });
      }

      const plan = await plansRepo.findById(planId);
      if (!plan || plan.status !== 'Active') {
        return res.status(404).json({ code: 'NotFound', message: 'Plan not found' });
      }

      const now = new Date();
      let startDate = now;
      let endDate = null;
      let renewalDate = null;

      // In stub mode (or when payment not configured), activate immediately
      const paymentMode = process.env.PAYMENT_MODE || env.paymentMode || 'stub';
      const realPaymentReady = paymentMode === 'real' && !!env.stripeSecretKey;

      let status = 'PendingPayment';
      if (!realPaymentReady) {
        // Activate immediately and set period based on plan.billingCycle
        if (plan.billingCycle === 'Monthly') {
          endDate = addMonths(now, 1);
          renewalDate = endDate;
        } else if (plan.billingCycle === 'Yearly') {
          endDate = addYears(now, 1);
          renewalDate = endDate;
        }
        status = 'Active';
      }

      const created = await subsRepo.create({
        userId: user.id,
        planId: plan._id || plan.id,
        startDate,
        endDate,
        renewalDate,
        status,
        entitlementsSnapshot: plan.entitlements || {},
      });

      // If real payment is enabled, return a checkoutUrl placeholder for client redirect
      if (realPaymentReady) {
        // In a future iteration, integrate Stripe Checkout here
        const checkoutUrl = `${env.appBaseUrl}/checkout?planId=${String(plan._id || plan.id)}`;
        return res.status(201).json({ checkoutUrl, subscription: map(created) });
      }

      // Stub mode: return the created subscription (already active)
      return res.status(201).json({ checkoutUrl: null, subscription: map(created) });
    } catch (e) { next(e); }
  },
};