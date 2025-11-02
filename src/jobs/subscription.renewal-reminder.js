/**
 * Job: Send renewal reminders
 * Scheduled: Daily
 * Sends reminder 3 days before subscription expires
 */

const logger = console;

async function processRenewalReminders({ userSubscriptionsRepository, emailClient }) {
  logger.info('[Job] Processing renewal reminders...');

  const threeDaysFromNow = new Date();
  threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3);
  
  const fourDaysFromNow = new Date();
  fourDaysFromNow.setDate(fourDaysFromNow.getDate() + 4);

  // Find subscriptions expiring in 3 days
  const expiringSubscriptions = await userSubscriptionsRepository.find({
    status: 'Active',
    endDate: {
      $gte: threeDaysFromNow,
      $lt: fourDaysFromNow,
    },
  }).populate('user subscriptionPlan');

  logger.info(`[Job] Found ${expiringSubscriptions.length} subscriptions expiring soon`);

  for (const subscription of expiringSubscriptions) {
    const user = subscription.user;
    const plan = subscription.subscriptionPlan;
    
    if (!user || !user.email) {
      logger.warn(`[Job] No email for user ${subscription.user}`);
      continue;
    }

    try {
      await emailClient.send({
        to: user.email,
        subject: 'Learinal - Subscription Renewal Reminder',
        html: `
          <h2>Your subscription is expiring soon</h2>
          <p>Hi ${user.displayName || 'there'},</p>
          <p>Your <strong>${plan.planName}</strong> subscription will expire on ${subscription.endDate.toLocaleDateString()}.</p>
          <p>To continue enjoying premium features, please renew your subscription.</p>
          <p>Best regards,<br>Learinal Team</p>
        `,
      });
      
      logger.info(`[Job] Sent renewal reminder to ${user.email} for subscription ${subscription._id}`);
    } catch (error) {
      logger.error(`[Job] Failed to send renewal reminder to ${user.email}:`, error);
    }
  }

  logger.info('[Job] Renewal reminder processing complete');
}

module.exports = processRenewalReminders;
