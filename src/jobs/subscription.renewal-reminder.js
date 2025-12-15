/**
 * Job: Send renewal reminders
 * Scheduled: Daily at 9 AM
 * Sends reminder 5 days before subscription expires
 */

const logger = console;

async function processRenewalReminders({ userSubscriptionsRepository, usersRepository, subscriptionPlansRepository, emailClient }) {
  logger.info('[Job] Processing renewal reminders...');

  const fiveDaysFromNow = new Date();
  fiveDaysFromNow.setDate(fiveDaysFromNow.getDate() + 5);
  fiveDaysFromNow.setHours(0, 0, 0, 0);
  
  const sixDaysFromNow = new Date();
  sixDaysFromNow.setDate(sixDaysFromNow.getDate() + 6);
  sixDaysFromNow.setHours(0, 0, 0, 0);

  // Find subscriptions expiring in 5 days
  const expiringSubscriptions = await userSubscriptionsRepository.find({
    status: 'Active',
    endDate: {
      $gte: fiveDaysFromNow,
      $lt: sixDaysFromNow,
    },
  });

  logger.info(`[Job] Found ${expiringSubscriptions.length} subscriptions expiring in 5 days`);

  for (const subscription of expiringSubscriptions) {
    try {
      // Get user and plan details
      const user = await usersRepository.findById(subscription.userId);
      const plan = await subscriptionPlansRepository.findById(subscription.planId);
      
      if (!user || !user.email) {
        logger.warn(`[Job] No email for user ${subscription.userId}`);
        continue;
      }

      if (!plan) {
        logger.warn(`[Job] No plan found for subscription ${subscription._id}`);
        continue;
      }

      // Format end date
      const endDate = new Date(subscription.endDate);
      const formattedEndDate = endDate.toLocaleDateString('vi-VN', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });

      // Send email using subscriptionExpiring template
      await emailClient.sendTemplate({
        to: user.email,
        templateId: 'subscriptionExpiring',
        variables: {
          userName: user.fullName || user.email,
          planName: plan.planName,
          endDate: formattedEndDate,
          renewUrl: `${process.env.FRONTEND_URL || 'https://learinal.app'}/subscription`,
        },
      });
      
      logger.info(`[Job] Sent expiring reminder to ${user.email} for subscription ${subscription._id}, expires: ${formattedEndDate}`);
    } catch (error) {
      logger.error(`[Job] Failed to send renewal reminder for subscription ${subscription._id}:`, error.message);
    }
  }

  logger.info('[Job] Renewal reminder processing complete');
}

module.exports = processRenewalReminders;
