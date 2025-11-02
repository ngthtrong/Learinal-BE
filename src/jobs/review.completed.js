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

    // 3. Send notification to Learner
    if (learner && learner.email) {
      await enqueueEmail({
        to: learner.email,
        templateId: 'validationCompleted',
        variables: {
          learnerName: learner.displayName || learner.email,
          setTitle: questionSet?.title || 'Your question set',
          status: decision === 'Approved' ? 'approved' : 'rejected',
          feedback: validationRequest.feedback || 'No feedback provided',
          setLink: `${process.env.APP_BASE_URL || 'http://localhost:3000'}/question-sets/${setId}`,
        },
      });

      logger.info({ learnerEmail: learner.email }, 'Notification email sent to learner');
    }

    // 4. If approved, create commission record (placeholder - actual calculation in separate job)
    if (decision === 'Approved') {
      await commissionsRepo.create({
        expertId,
        validationRequestId,
        setId,
        status: 'Pending',
        amount: 0, // Will be calculated by commission calculation job
        calculatedAt: new Date(),
      });

      logger.info({ expertId, validationRequestId }, 'Commission record created');
    }

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
