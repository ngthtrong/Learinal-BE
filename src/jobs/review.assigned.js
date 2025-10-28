const NotificationsService = require('../services/notifications.service');
const UsersRepository = require('../repositories/users.repository');
const QuestionSetsRepository = require('../repositories/questionSets.repository');
const { enqueueNotificationsEmail } = require('../adapters/queue');
const logger = require('../utils/logger');

const notificationsService = new NotificationsService();
const usersRepo = new UsersRepository();
const questionSetsRepo = new QuestionSetsRepository();

/**
 * Handle review.assigned event
 * Creates in-app notification and triggers email to expert
 * @param {object} payload - { requestId, expertId, setId, learnerId }
 */
async function reviewAssigned(payload) {
  try {
    const { requestId, expertId, setId, learnerId: _learnerId } = payload;

    // Fetch expert and question set details
    const [expert, questionSet] = await Promise.all([
      usersRepo.findById(expertId),
      questionSetsRepo.findById(setId),
    ]);

    if (!expert) {
      logger.warn({ expertId }, '[review.assigned] Expert not found');
      return;
    }

    const questionSetTitle = questionSet?.title || 'Untitled';

    // Create in-app notification for expert
    await notificationsService.createNotification({
      userId: expertId,
      title: 'New Review Assignment',
      message: `You have been assigned to review question set: ${questionSetTitle}`,
      type: 'info',
      relatedEntityType: 'ValidationRequest',
      relatedEntityId: requestId,
    });

    // Enqueue email notification
    await enqueueNotificationsEmail({
      eventType: 'review.assigned',
      userId: expertId,
      data: {
        expertName: expert.displayName || expert.email,
        questionSetTitle,
        reviewLink: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/validation-requests/${requestId}`,
      },
    });

    logger.info(
      { requestId, expertId, setId },
      '[review.assigned] Notifications sent to expert'
    );
  } catch (error) {
    logger.error(
      { error: error.message, payload },
      '[review.assigned] Failed to send notifications'
    );
    throw error;
  }
}

module.exports = reviewAssigned;
