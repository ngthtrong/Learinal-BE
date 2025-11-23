const { enqueueEmail } = require('../adapters/queue');
const logger = require('../utils/logger');

/**
 * Send notification emails
 * @param {Object} payload
 * @param {string} payload.to - Recipient email
 * @param {string} payload.templateId - Email template ID
 * @param {Object} payload.variables - Template variables
 * @param {string} payload.subject - Email subject (optional, can come from template)
 */
module.exports = async function notificationsEmail(payload) {
  const { to, templateId, variables, subject } = payload;

  logger.info({ to, templateId }, 'Sending notification email');

  try {
    await enqueueEmail({
      to,
      templateId,
      variables,
      subject,
    });

    logger.info({ to, templateId }, 'Notification email queued successfully');
  } catch (error) {
    logger.error({ to, templateId, error: error.message }, 'Failed to queue notification email');
    throw error;
  }
};
