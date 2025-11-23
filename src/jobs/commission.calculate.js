/**
 * Job: Calculate commission for quiz attempt
 * Triggered when user completes quiz on validated question set
 * Formula from SRS 4.1.2
 */

const CommissionRecordsRepository = require('../repositories/commissionRecords.repository');
const QuizAttemptsRepository = require('../repositories/quizAttempts.repository');
const ValidationRequestsRepository = require('../repositories/validationRequests.repository');
const QuestionSetsRepository = require('../repositories/questionSets.repository');
const logger = require('../utils/logger');

const commissionsRepo = new CommissionRecordsRepository();
const attemptsRepo = new QuizAttemptsRepository();
const validationRequestsRepo = new ValidationRequestsRepository();
const questionSetsRepo = new QuestionSetsRepository();

// Configuration (should be in database or config)
const COMMISSION_CONFIG = {
  commissionPoolRate: 0.3, // 30% of revenue
  baseCommissionRate: 0.5, // 50% of pool
  performanceBonus: 0.2, // 20% bonus for high quality
  entitlementDays: 180, // 6 months
};

/**
 * Calculate commission when quiz is completed
 */
async function calculateCommissionForAttempt(payload) {
  const { attemptId } = payload;

  logger.info({ attemptId }, 'Calculating commission for quiz attempt');

  try {
    // 1. Get quiz attempt
    const attempt = await attemptsRepo.findById(attemptId);
    if (!attempt) {
      logger.warn({ attemptId }, 'Quiz attempt not found');
      return;
    }

    // 2. Get question set
    const questionSet = await questionSetsRepo.findById(attempt.setId.toString());
    if (!questionSet || questionSet.status !== 'Validated') {
      logger.warn({ attemptId, setId: attempt.setId }, 'Question set not validated');
      return;
    }

    // 3. Find validation request
    const validationRequest = await validationRequestsRepo.findOne({
      setId: questionSet._id,
      status: 'Completed',
      decision: 'Approved',
    });

    if (!validationRequest || !validationRequest.expertId) {
      logger.warn({ attemptId, setId: questionSet._id }, 'No approved validation found');
      return;
    }

    const expertId = validationRequest.expertId.toString();

    // 4. Check if commission already exists for this attempt
    const existingCommission = await commissionsRepo.findOne({
      validationRequestId: validationRequest._id,
      attemptId,
    });

    if (existingCommission) {
      logger.info({ attemptId }, 'Commission already calculated');
      return;
    }

    // 5. Calculate commission amount
    // Assume revenue = subscription fee contribution
    // For simplicity, use fixed amount per attempt
    const baseRevenue = 100; // VND per quiz attempt (simplified)
    const commissionPool = baseRevenue * COMMISSION_CONFIG.commissionPoolRate; // 30 VND
    
    // Base commission
    let commissionAmount = commissionPool * COMMISSION_CONFIG.baseCommissionRate; // 15 VND

    // Performance bonus if score is high
    const scorePercentage = (attempt.totalScore / attempt.maxScore) * 100;
    if (scorePercentage >= 80) {
      const bonus = commissionPool * COMMISSION_CONFIG.performanceBonus; // 6 VND
      commissionAmount += bonus;
      logger.info({ attemptId, bonus }, 'Performance bonus applied');
    }

    // 6. Create commission record
    const commission = await commissionsRepo.create({
      expertId,
      validationRequestId: validationRequest._id,
      setId: questionSet._id,
      attemptId,
      status: 'Pending',
      amount: Math.round(commissionAmount),
      calculatedAt: new Date(),
      entitledUntil: new Date(Date.now() + COMMISSION_CONFIG.entitlementDays * 24 * 60 * 60 * 1000),
    });

    logger.info(
      {
        commissionId: commission._id.toString(),
        expertId,
        amount: commissionAmount,
      },
      'Commission calculated successfully'
    );

    return commission;
  } catch (error) {
    logger.error(
      {
        attemptId,
        error: error.message,
      },
      'Failed to calculate commission'
    );

    throw error; // Will retry
  }
}

module.exports = {
  calculateCommissionForAttempt,
};
