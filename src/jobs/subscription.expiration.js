/**
 * Job: Check and expire subscriptions
 * Scheduled: Daily at midnight
 */

const logger = console;

async function processSubscriptionExpiration({ userSubscriptionsRepository }) {
  logger.info('[Job] Processing subscription expirations...');

  const now = new Date();
  
  // Find subscriptions that have expired
  const expiredSubscriptions = await userSubscriptionsRepository.find({
    status: 'Active',
    endDate: { $lte: now },
    autoRenew: false,
  });

  logger.info(`[Job] Found ${expiredSubscriptions.length} expired subscriptions`);

  for (const subscription of expiredSubscriptions) {
    await userSubscriptionsRepository.updateById(subscription._id, {
      status: 'Expired',
    });
    
    logger.info(`[Job] Expired subscription ${subscription._id} for user ${subscription.user}`);
  }

  logger.info('[Job] Subscription expiration processing complete');
}

module.exports = processSubscriptionExpiration;
