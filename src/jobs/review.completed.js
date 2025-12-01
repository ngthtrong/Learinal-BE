const ValidationRequestsRepository = require('../repositories/validationRequests.repository');
const QuestionSetsRepository = require('../repositories/questionSets.repository');
const UsersRepository = require('../repositories/users.repository');
const CommissionRecordsRepository = require('../repositories/commissionRecords.repository');
const { enqueueEmail } = require('../adapters/queue');
const logger = require('../utils/logger');

const validationRequestsRepo = new ValidationRequestsRepository();
const questionSetsRepo = new QuestionSetsRepository();
const usersRepo = new UsersRepository();
const commissionsRepo = new CommissionRecordsRepository();

/**
 * Handle review completion
 * Triggered when expert completes validation
 */
module.exports = async function reviewCompleted(payload) {
  const { validationRequestId, expertId, setId, decision } = payload;

  logger.info({ validationRequestId, decision }, 'Processing review completion');

  try {
    // 1. Get validation request
    const validationRequest = await validationRequestsRepo.findById(validationRequestId);
    if (!validationRequest) {
      logger.error({ validationRequestId }, 'Validation request not found');
      return;
    }

    // 2. Get learner and question set
    const learner = await usersRepo.findById(validationRequest.learnerId.toString());
    const questionSet = await questionSetsRepo.findById(setId);

    // 3. No email notification - using in-app notification only
    // Email notification has been replaced with real-time + persistent notifications
    // sent from validationRequests.controller.js via notificationService.emitValidationCompleted()
    logger.info({ learnerEmail: learner?.email }, 'Using in-app notification instead of email');

    // 4. Commission records will be created when learners complete quiz attempts
    // Not at validation approval time
    logger.info({ expertId, validationRequestId, decision }, 'Validation completed, commission will be tracked on quiz attempts');

    logger.info({ validationRequestId }, 'Review completion processed successfully');
  } catch (error) {
    logger.error(
      {
        validationRequestId,
        error: error.message,
      },
      'Failed to process review completion'
    );

    throw error; // Will retry
  }
};
