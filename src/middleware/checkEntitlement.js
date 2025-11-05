/**
 * Middleware to check user's subscription entitlements
 */

const User = require('../models/user.model');
const SubscriptionPlan = require('../models/subscriptionPlan.model');

async function checkQuestionGenerationLimit(req, res, next) {
  try {
    const { userSubscriptionsService, questionSetsRepository } = req.app.locals;
    
    // Get active subscription from UserSubscription collection
    let subscription = await userSubscriptionsService.getActiveSubscription(req.user.id);
    
    // Fallback: Check User model if no UserSubscription found
    if (!subscription || !subscription.plan) {
      const user = await User.findById(req.user.id).lean();
      if (user && user.subscriptionStatus === 'Active' && user.subscriptionPlanId) {
        const plan = await SubscriptionPlan.findById(user.subscriptionPlanId).lean();
        if (plan) {
          subscription = {
            plan: {
              id: plan._id.toString(),
              planName: plan.planName,
              entitlements: plan.entitlements,
            }
          };
        }
      }
    }
    
    if (!subscription || !subscription.plan) {
      throw Object.assign(new Error('No active subscription plan'), {
        status: 403,
        code: 'NoSubscription',
      });
    }

    const { maxMonthlyTestGenerations } = subscription.plan.entitlements;

    // If unlimited, skip check
    if (maxMonthlyTestGenerations === 'unlimited') {
      req.entitlement = { usedTests: 0, maxTests: 'unlimited' };
      return next();
    }

    // Count question sets created this month
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const count = await questionSetsRepository.countDocuments({
      createdBy: req.user.id,
      createdAt: { $gte: startOfMonth },
    });

    if (count >= maxMonthlyTestGenerations) {
      throw Object.assign(
        new Error(`Monthly test generation limit reached (${maxMonthlyTestGenerations})`),
        { status: 403, code: 'LimitExceeded' }
      );
    }

    req.entitlement = { usedTests: count, maxTests: maxMonthlyTestGenerations };
    next();
  } catch (e) {
    next(e);
  }
}

async function checkValidationRequestLimit(req, res, next) {
  try {
    const { userSubscriptionsService, validationRequestsRepository } = req.app.locals;
    
    // Get active subscription from UserSubscription collection
    let subscription = await userSubscriptionsService.getActiveSubscription(req.user.id);
    
    // Fallback: Check User model if no UserSubscription found
    if (!subscription || !subscription.plan) {
      const user = await User.findById(req.user.id).lean();
      if (user && user.subscriptionStatus === 'Active' && user.subscriptionPlanId) {
        const plan = await SubscriptionPlan.findById(user.subscriptionPlanId).lean();
        if (plan) {
          subscription = {
            plan: {
              id: plan._id.toString(),
              planName: plan.planName,
              entitlements: plan.entitlements,
            }
          };
        }
      }
    }
    
    if (!subscription || !subscription.plan) {
      throw Object.assign(new Error('No active subscription plan'), {
        status: 403,
        code: 'NoSubscription',
      });
    }

    const { maxValidationRequests } = subscription.plan.entitlements;

    // If unlimited, skip check
    if (maxValidationRequests === 'unlimited') {
      req.entitlement = { usedRequests: 0, maxRequests: 'unlimited' };
      return next();
    }

    // Count validation requests created this month
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const count = await validationRequestsRepository.countDocuments({
      createdBy: req.user.id,
      createdAt: { $gte: startOfMonth },
    });

    if (count >= maxValidationRequests) {
      throw Object.assign(
        new Error(`Monthly validation request limit reached (${maxValidationRequests})`),
        { status: 403, code: 'LimitExceeded' }
      );
    }

    req.entitlement = { usedRequests: count, maxRequests: maxValidationRequests };
    next();
  } catch (e) {
    next(e);
  }
}

module.exports = {
  checkQuestionGenerationLimit,
  checkValidationRequestLimit,
};
