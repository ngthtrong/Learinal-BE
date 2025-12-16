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

    // 4. Create commission record if validation is approved
    if (decision === 'Approved') {
      try {
        const commissionConfig = require('../config/commission');
        const CommissionRecord = require('../models/commissionRecord.model');
        
        // Validate question set exists
        if (!questionSet) {
          logger.error({ setId, validationRequestId }, 'Question set not found - cannot create commission');
          throw new Error(`Question set ${setId} not found`);
        }
        
        // Check if commission already exists for this validation
        const existingCommission = await CommissionRecord.findOne({
          validationRequestId: validationRequest._id,
          type: commissionConfig.types.VALIDATED,
        }).lean();
        
        if (!existingCommission) {
          // Create one-time commission for validation
          const fixedAmount = commissionConfig.fixedRates.validated; // 150 VND
          const now = new Date();
          
          await CommissionRecord.create({
            expertId,
            attemptId: null, // No specific attempt for validation commission
            setId,
            validationRequestId: validationRequest._id,
            type: commissionConfig.types.VALIDATED,
            fixedAmount,
            bonusAmount: 0,
            commissionAmount: fixedAmount,
            transactionDate: now,
            status: commissionConfig.statuses.PENDING,
            isPremiumAttempt: false, // Not tied to specific attempt
            isReconciled: false,
            reconciliationMonth: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`,
            entitledUntil: null,
            metadata: {
              questionSetTitle: questionSet.title,
            },
            questionSetSnapshot: {
              title: questionSet.title,
              description: questionSet.description,
              status: questionSet.status,
            },
          });
          
          logger.info({ expertId, validationRequestId, fixedAmount }, 'Validation commission created (one-time payment)');
        } else {
          logger.info({ validationRequestId }, 'Validation commission already exists');
        }
      } catch (commError) {
        logger.error({ error: commError.message, stack: commError.stack, validationRequestId, expertId, setId }, 'Failed to create validation commission');
        // Don't throw - validation should complete even if commission fails
      }
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
