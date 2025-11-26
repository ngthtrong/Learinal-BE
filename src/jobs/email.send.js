const EmailClient = require('../adapters/emailClient');
const { email: emailCfg } = require('../config');
const logger = require('../utils/logger');

const emailClient = new EmailClient(emailCfg);

/**
 * Worker handler for sending emails
 * @param {Object} payload
 * @param {string} payload.to - Recipient email
 * @param {string} payload.subject - Email subject
 * @param {string} payload.templateId - SendGrid Dynamic Template ID (optional, starts with 'd-')
 * @param {Object} payload.variables - Template variables (optional)
 * @param {Object} payload.options - Additional options
 * @param {string} payload.options.dbTemplateId - Database template ID for fallback
 */
module.exports = async function sendEmailJob(payload) {
  const { to, subject, templateId, variables, options } = payload;

  logger.info({ to, subject, templateId, dbTemplateId: options?.dbTemplateId }, 'Processing email job');

  try {
    await emailClient.send(to, subject, templateId, variables, options);
    logger.info({ to, subject }, 'Email sent successfully');
  } catch (error) {
    logger.error({ to, subject, error: error.message, stack: error.stack }, 'Failed to send email');
    throw error; // Rethrow to let BullMQ retry
  }
};
