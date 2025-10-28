const NotificationsService = require('../services/notifications.service');
const UsersRepository = require('../repositories/users.repository');
const QuestionSetsRepository = require('../repositories/questionSets.repository');
const { enqueueNotificationsEmail } = require('../adapters/queue');
const logger = require('../utils/logger');

const notificationsService = new NotificationsService();
const usersRepo = new UsersRepository();
const questionSetsRepo = new QuestionSetsRepository();

/**
 * Handle review.completed event
 * Creates in-app notification and triggers email to learner
 * @param {object} payload - { requestId, expertId, setId, learnerId, approved, feedback }
 */
async function reviewCompleted(payload) {
  try {
    const { requestId, expertId: _expertId, setId, learnerId, approved, feedback } = payload;

    // Fetch learner and question set details
    const [learner, questionSet] = await Promise.all([
      usersRepo.findById(learnerId),
      questionSetsRepo.findById(setId),
    ]);

    if (!learner) {
      logger.warn({ learnerId }, '[review.completed] Learner not found');
      return;
    }

    const questionSetTitle = questionSet?.title || 'Untitled';

    // Create in-app notification for learner
    const notificationMessage = approved
      ? `Your question set "${questionSetTitle}" has been validated!`
      : `Your question set "${questionSetTitle}" needs revision. ${feedback ? `Feedback: ${feedback}` : ''}`;

    await notificationsService.createNotification({
      userId: learnerId,
      title: approved ? 'Question Set Validated' : 'Question Set Needs Revision',
      message: notificationMessage,
      type: approved ? 'success' : 'warning',
      relatedEntityType: 'QuestionSet',
      relatedEntityId: setId,
    });

    // Enqueue email notification
    await enqueueNotificationsEmail({
      eventType: 'review.completed',
      userId: learnerId,
      data: {
        learnerName: learner.displayName || learner.email,
        questionSetTitle,
        approved,
        feedback: feedback || '',
        questionSetLink: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/question-sets/${setId}`,
      },
    });

    logger.info(
      { requestId, learnerId, setId, approved },
      '[review.completed] Notifications sent to learner'
    );
  } catch (error) {
    logger.error(
      { error: error.message, payload },
      '[review.completed] Failed to send notifications'
    );
    throw error;
  }
}

module.exports = reviewCompleted;
