/**
 * Job: Check and expire subscriptions
 * Scheduled: Daily at midnight
 */

const User = require('../models/user.model');
const logger = console;

async function processSubscriptionExpiration({ userSubscriptionsRepository }) {
  logger.info('[Job] Processing subscription expirations...');

  const now = new Date();
  
  // Find subscriptions that have expired (regardless of autoRenew setting)
  // autoRenew feature would need a separate payment processing job
  const expiredSubscriptions = await userSubscriptionsRepository.find({
    status: 'Active',
    endDate: { $lte: now },
  });

  logger.info(`[Job] Found ${expiredSubscriptions.length} expired subscriptions`);

  for (const subscription of expiredSubscriptions) {
    // Update UserSubscription status to Expired
    await userSubscriptionsRepository.updateById(subscription._id, {
      status: 'Expired',
    });
    
    // Also update User model's subscriptionStatus to Expired
    // This ensures the fallback check in checkEntitlement middleware works correctly
    const userId = subscription.userId || subscription.user;
    if (userId) {
      await User.findByIdAndUpdate(userId, {
        subscriptionStatus: 'Expired',
      });
      logger.info(`[Job] Updated User ${userId} subscriptionStatus to Expired`);
    }
    
    logger.info(`[Job] Expired subscription ${subscription._id} for user ${userId}`);
  }

  logger.info('[Job] Subscription expiration processing complete');
}

module.exports = processSubscriptionExpiration;
