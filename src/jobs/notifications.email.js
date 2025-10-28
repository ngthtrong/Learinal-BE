const { emailClient } = require('../adapters');
const UsersRepository = require('../repositories/users.repository');
const logger = require('../utils/logger');

const usersRepo = new UsersRepository();

/**
 * Email templates configuration
 * Maps event types to email subjects and template builders
 */
const EMAIL_TEMPLATES = {
  'welcome': {
    subject: 'Welcome to Learinal!',
    buildVariables: (payload) => ({
      fullName: payload.fullName || 'there',
      message: 'Thank you for joining Learinal. Start creating your study materials today!',
    }),
  },
  'review.assigned': {
    subject: 'New Question Set Review Assignment',
    buildVariables: (payload) => ({
      fullName: payload.expertName || 'Expert',
      message: `You have been assigned to review question set: ${payload.questionSetTitle || 'Untitled'}. Please complete your review soon.`,
      link: payload.reviewLink || null,
    }),
  },
  'review.completed': {
    subject: 'Your Question Set Review is Complete',
    buildVariables: (payload) => ({
      fullName: payload.learnerName || 'there',
      message: payload.approved
        ? `Congratulations! Your question set "${payload.questionSetTitle || 'Untitled'}" has been validated.`
        : `Your question set "${payload.questionSetTitle || 'Untitled'}" needs revision. Feedback: ${payload.feedback || 'No feedback provided.'}`,
      link: payload.questionSetLink || null,
    }),
  },
  'quiz.completed': {
    subject: 'Quiz Completed - Results Available',
    buildVariables: (payload) => ({
      fullName: payload.learnerName || 'there',
      message: `You scored ${payload.score || 0}% on "${payload.questionSetTitle || 'Quiz'}". Great job!`,
      link: payload.resultsLink || null,
    }),
  },
  'password.reset': {
    subject: 'Password Reset Request',
    buildVariables: (payload) => ({
      fullName: payload.fullName || 'there',
      message: 'You requested a password reset. Click the link below to reset your password.',
      link: payload.resetLink || null,
    }),
  },
};

/**
 * Send email notification job
 * @param {object} payload - { eventType, recipientEmail?, userId?, data }
 */
async function notificationsEmail(payload) {
  try {
    const { eventType, recipientEmail, userId, data } = payload;

    // Validate event type
    if (!eventType || !EMAIL_TEMPLATES[eventType]) {
      logger.warn(
        { eventType },
        '[Email Job] Unknown event type - skipping email'
      );
      return;
    }

    // Determine recipient email
    let toEmail = recipientEmail;
    if (!toEmail && userId) {
      const user = await usersRepo.findById(userId);
      if (user) {
        toEmail = user.email;
      }
    }

    if (!toEmail) {
      logger.warn(
        { eventType, userId },
        '[Email Job] No recipient email found - skipping'
      );
      return;
    }

    // Build email from template
    const template = EMAIL_TEMPLATES[eventType];
    const subject = template.subject;
    const variables = template.buildVariables(data || {});

    // Send email via adapter
    const sent = await emailClient.send(toEmail, subject, null, variables);

    if (sent) {
      logger.info(
        { eventType, recipientEmail: toEmail, userId },
        '[Email Job] Email sent successfully'
      );
    } else {
      logger.warn(
        { eventType, recipientEmail: toEmail },
        '[Email Job] Email provider not configured - email not sent'
      );
    }
  } catch (error) {
    logger.error(
      { error: error.message, payload },
      '[Email Job] Failed to send email'
    );
    throw error; // Re-throw for job retry mechanism
  }
}

module.exports = notificationsEmail;
