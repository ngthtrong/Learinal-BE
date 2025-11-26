/**
 * Job: Calculate commission for quiz attempt
 * Hybrid Model: Fixed Rate + Revenue Bonus
 * 
 * Triggered when user completes quiz on validated/published question set
 * Fixed commission is calculated immediately per attempt
 * Revenue bonus is calculated in monthly reconciliation
 */

const CommissionRecord = require('../models/commissionRecord.model');
const QuizAttempt = require('../models/quizAttempt.model');
const QuestionSet = require('../models/questionSet.model');
const ValidationRequest = require('../models/validationRequest.model');
const User = require('../models/user.model');
const commissionConfig = require('../config/commission');
const logger = require('../utils/logger');

/**
 * Get the month string for reconciliation tracking
 * @param {Date} date 
 * @returns {string} Format: "YYYY-MM"
 */
function getMonthString(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

/**
 * Check if user has active premium subscription
 * @param {string} userId 
 * @returns {Promise<boolean>}
 */
async function isPremiumUser(userId) {
  try {
    const user = await User.findById(userId).select('subscriptionStatus subscriptionPlanId').lean();
    if (!user) return false;
    
    // Check if user has active subscription
    if (user.subscriptionStatus === 'Active' && user.subscriptionPlanId) {
      return true;
    }
    return false;
  } catch (error) {
    logger.error({ userId, error: error.message }, 'Failed to check premium status');
    return false;
  }
}

/**
 * Determine commission type and expert based on question set
 * @param {Object} questionSet 
 * @returns {Promise<{type: string, expertId: string, validationRequestId: string|null, entitledUntil: Date|null}>}
 */
async function determineCommissionType(questionSet) {
  const setId = questionSet._id.toString();
  
  // Case 1: Published by Expert (status = 'Published' and creator is Expert)
  if (questionSet.status === 'Published') {
    const creator = await User.findById(questionSet.userId).select('role').lean();
    if (creator && creator.role === 'Expert') {
      return {
        type: commissionConfig.types.PUBLISHED,
        expertId: questionSet.userId.toString(),
        validationRequestId: null,
        entitledUntil: null, // Published content has no expiration
      };
    }
  }
  
  // Case 2: Validated by Expert (has completed validation request)
  if (questionSet.status === 'Validated') {
    const validationRequest = await ValidationRequest.findOne({
      setId: questionSet._id,
      status: 'Completed',
      decision: 'Approved',
    }).select('expertId completionTime').lean();
    
    if (validationRequest && validationRequest.expertId) {
      const validatedAt = validationRequest.completionTime || new Date();
      const entitledUntil = new Date(validatedAt);
      entitledUntil.setDate(entitledUntil.getDate() + commissionConfig.entitlementDays);
      
      // Check if entitlement is still valid
      if (!commissionConfig.isEntitlementValid(validatedAt)) {
        logger.info({ setId }, 'Commission entitlement expired for validated set');
        return null;
      }
      
      return {
        type: commissionConfig.types.VALIDATED,
        expertId: validationRequest.expertId.toString(),
        validationRequestId: validationRequest._id.toString(),
        entitledUntil,
      };
    }
  }
  
  // No commission applicable
  return null;
}

/**
 * Calculate commission for a quiz attempt (Hybrid Model)
 * This creates a commission record with fixed amount immediately
 * Bonus will be calculated during monthly reconciliation
 * 
 * @param {Object} payload - { attemptId: string }
 * @returns {Promise<Object|null>} Created commission record or null
 */
async function calculateCommissionForAttempt(payload) {
  const { attemptId } = payload;
  const jobStart = Date.now();

  logger.info({ attemptId }, 'Starting commission calculation for quiz attempt');

  try {
    // 1. Get quiz attempt
    const attempt = await QuizAttempt.findById(attemptId).lean();
    if (!attempt) {
      logger.warn({ attemptId }, 'Quiz attempt not found');
      return null;
    }

    if (!attempt.isCompleted) {
      logger.warn({ attemptId }, 'Quiz attempt not completed yet');
      return null;
    }

    // 2. Check for existing commission (prevent duplicates)
    const existingCommission = await CommissionRecord.findOne({ attemptId }).lean();
    if (existingCommission) {
      logger.info({ attemptId }, 'Commission already exists for this attempt');
      return existingCommission;
    }

    // 3. Get question set
    const questionSet = await QuestionSet.findById(attempt.setId).lean();
    if (!questionSet) {
      logger.warn({ attemptId, setId: attempt.setId }, 'Question set not found');
      return null;
    }

    // 4. Check if question set is eligible for commission
    const eligibleStatuses = ['Published', 'Validated'];
    if (!eligibleStatuses.includes(questionSet.status)) {
      logger.info({ attemptId, setId: attempt.setId, status: questionSet.status }, 
        'Question set status not eligible for commission');
      return null;
    }

    // 5. Determine commission type and expert
    const commissionInfo = await determineCommissionType(questionSet);
    if (!commissionInfo) {
      logger.info({ attemptId, setId: attempt.setId }, 
        'No commission applicable for this question set');
      return null;
    }

    // 6. Check if attempt user is a premium subscriber
    const isPremium = await isPremiumUser(attempt.userId.toString());
    
    // Note: We still record commission for non-premium users but mark it
    // This allows tracking and potential future changes to commission model
    if (!isPremium) {
      logger.info({ attemptId, userId: attempt.userId }, 
        'Attempt by non-premium user - commission recorded but flagged');
    }

    // 7. Calculate fixed commission amount
    const fixedAmount = commissionConfig.getFixedCommission(commissionInfo.type);
    
    if (fixedAmount < commissionConfig.minimumCommissionAmount) {
      logger.info({ attemptId, fixedAmount }, 
        'Commission amount below minimum threshold');
      return null;
    }

    // 8. Create commission record
    const now = new Date();
    const commissionRecord = await CommissionRecord.create({
      expertId: commissionInfo.expertId,
      attemptId: attempt._id,
      setId: questionSet._id,
      validationRequestId: commissionInfo.validationRequestId,
      type: commissionInfo.type,
      fixedAmount: fixedAmount,
      bonusAmount: 0, // Will be calculated in monthly reconciliation
      commissionAmount: fixedAmount, // Total = fixed + bonus (bonus added later)
      transactionDate: now,
      status: commissionConfig.statuses.PENDING,
      isPremiumAttempt: isPremium,
      isReconciled: false,
      reconciliationMonth: getMonthString(now),
      entitledUntil: commissionInfo.entitledUntil,
      metadata: {
        questionSetTitle: questionSet.title,
        learnerScore: attempt.score,
        attemptDuration: attempt.endTime && attempt.startTime 
          ? Math.round((new Date(attempt.endTime) - new Date(attempt.startTime)) / 1000)
          : null,
      },
    });

    const duration = Date.now() - jobStart;
    logger.info({
      commissionId: commissionRecord._id.toString(),
      expertId: commissionInfo.expertId,
      type: commissionInfo.type,
      fixedAmount,
      isPremium,
      duration,
    }, 'Commission calculated successfully');

    return commissionRecord;

  } catch (error) {
    logger.error({
      attemptId,
      error: error.message,
      stack: error.stack,
    }, 'Failed to calculate commission');

    // Re-throw for retry mechanism
    throw error;
  }
}

/**
 * Monthly reconciliation: Calculate and apply revenue bonuses
 * Should be run at the beginning of each month for the previous month
 * 
 * @param {Object} payload - { month: "YYYY-MM" } (optional, defaults to previous month)
 * @returns {Promise<Object>} Reconciliation summary
 */
async function reconcileMonthlyCommissions(payload = {}) {
  const targetMonth = payload.month || getPreviousMonth();
  const jobStart = Date.now();

  logger.info({ targetMonth }, 'Starting monthly commission reconciliation');

  try {
    // 1. Get all unreconciled commissions for the target month
    const unreconciledCommissions = await CommissionRecord.find({
      reconciliationMonth: targetMonth,
      isReconciled: false,
      status: commissionConfig.statuses.PENDING,
    }).lean();

    if (unreconciledCommissions.length === 0) {
      logger.info({ targetMonth }, 'No unreconciled commissions found');
      return { targetMonth, processed: 0, totalBonus: 0 };
    }

    // 2. Group commissions by setId to calculate bonuses
    const commissionsBySet = new Map();
    for (const commission of unreconciledCommissions) {
      const setId = commission.setId.toString();
      if (!commissionsBySet.has(setId)) {
        commissionsBySet.set(setId, []);
      }
      commissionsBySet.get(setId).push(commission);
    }

    // 3. Calculate and apply bonuses for each set
    let totalBonusDistributed = 0;
    let commissionsProcessed = 0;

    for (const [setId, commissions] of commissionsBySet) {
      // Count only premium attempts
      const premiumAttempts = commissions.filter(c => c.isPremiumAttempt).length;
      const totalAttempts = commissions.length;
      
      // Get commission type (all commissions for same set have same type)
      const type = commissions[0].type;
      
      // Calculate total bonus for this set
      const totalBonus = commissionConfig.calculateRevenueBonus(type, premiumAttempts);
      
      if (totalBonus > 0) {
        // Distribute bonus equally among all commissions for this set
        const bonusPerCommission = Math.round(totalBonus / commissions.length);
        
        for (const commission of commissions) {
          await CommissionRecord.findByIdAndUpdate(commission._id, {
            $set: {
              bonusAmount: bonusPerCommission,
              commissionAmount: commission.fixedAmount + bonusPerCommission,
              isReconciled: true,
              reconciledAt: new Date(),
            },
          });
          commissionsProcessed++;
        }
        
        totalBonusDistributed += totalBonus;
        
        logger.info({
          setId,
          type,
          totalAttempts,
          premiumAttempts,
          totalBonus,
          bonusPerCommission,
        }, 'Bonus calculated for question set');
      } else {
        // No bonus, just mark as reconciled
        await CommissionRecord.updateMany(
          { _id: { $in: commissions.map(c => c._id) } },
          { $set: { isReconciled: true, reconciledAt: new Date() } }
        );
        commissionsProcessed += commissions.length;
      }
    }

    const duration = Date.now() - jobStart;
    const summary = {
      targetMonth,
      processed: commissionsProcessed,
      setsProcessed: commissionsBySet.size,
      totalBonus: totalBonusDistributed,
      duration,
    };

    logger.info(summary, 'Monthly commission reconciliation completed');
    return summary;

  } catch (error) {
    logger.error({
      targetMonth,
      error: error.message,
      stack: error.stack,
    }, 'Failed to reconcile monthly commissions');
    throw error;
  }
}

/**
 * Get the previous month string
 * @returns {string} Format: "YYYY-MM"
 */
function getPreviousMonth() {
  const now = new Date();
  now.setMonth(now.getMonth() - 1);
  return getMonthString(now);
}

/**
 * Get commission statistics for an expert
 * @param {string} expertId 
 * @param {string} month - Optional, format "YYYY-MM"
 * @returns {Promise<Object>}
 */
async function getExpertCommissionStats(expertId, month = null) {
  const matchQuery = { expertId };
  if (month) {
    matchQuery.reconciliationMonth = month;
  }

  const stats = await CommissionRecord.aggregate([
    { $match: matchQuery },
    {
      $group: {
        _id: {
          status: '$status',
          type: '$type',
        },
        count: { $sum: 1 },
        totalFixed: { $sum: '$fixedAmount' },
        totalBonus: { $sum: '$bonusAmount' },
        totalCommission: { $sum: '$commissionAmount' },
      },
    },
  ]);

  // Format results
  const result = {
    expertId,
    month: month || 'all-time',
    byType: {
      Published: { count: 0, fixed: 0, bonus: 0, total: 0 },
      Validated: { count: 0, fixed: 0, bonus: 0, total: 0 },
    },
    byStatus: {
      Pending: { count: 0, total: 0 },
      Paid: { count: 0, total: 0 },
    },
    totals: {
      count: 0,
      fixed: 0,
      bonus: 0,
      total: 0,
    },
  };

  for (const stat of stats) {
    const { status, type } = stat._id;
    
    if (type && result.byType[type]) {
      result.byType[type].count += stat.count;
      result.byType[type].fixed += stat.totalFixed;
      result.byType[type].bonus += stat.totalBonus;
      result.byType[type].total += stat.totalCommission;
    }
    
    if (status && result.byStatus[status]) {
      result.byStatus[status].count += stat.count;
      result.byStatus[status].total += stat.totalCommission;
    }
    
    result.totals.count += stat.count;
    result.totals.fixed += stat.totalFixed;
    result.totals.bonus += stat.totalBonus;
    result.totals.total += stat.totalCommission;
  }

  return result;
}

module.exports = {
  calculateCommissionForAttempt,
  reconcileMonthlyCommissions,
  getExpertCommissionStats,
  getMonthString,
  isPremiumUser,
};
