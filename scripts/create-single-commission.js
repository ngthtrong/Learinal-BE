/**
 * Manually create commission for a specific attempt
 * Usage: node scripts/create-single-commission.js <attemptId>
 */

require('dotenv').config();
const mongoose = require('mongoose');
const { env } = require('../src/config');

async function createCommissionForAttempt(attemptId) {
  try {
    await mongoose.connect(env.mongoUri, { 
      dbName: env.mongoDbName,
      serverSelectionTimeoutMS: 5000 
    });
    console.log('✅ Connected to MongoDB\n');

    const QuizAttempt = require('../src/models/quizAttempt.model');
    const QuestionSet = require('../src/models/questionSet.model');
    const ValidationRequest = require('../src/models/validationRequest.model');
    const CommissionRecord = require('../src/models/commissionRecord.model');
    const User = require('../src/models/user.model');
    const commissionConfig = require('../src/config/commission');

    // Check if commission already exists
    const existing = await CommissionRecord.findOne({ attemptId });
    if (existing) {
      console.log('⚠️  Commission already exists for this attempt');
      console.log('Commission ID:', existing._id);
      console.log('Type:', existing.type);
      console.log('Amount:', existing.fixedAmount, 'VND');
      console.log('Status:', existing.status);
      return;
    }

    // Get attempt
    const attempt = await QuizAttempt.findById(attemptId);
    if (!attempt) {
      console.log('❌ Attempt not found');
      return;
    }

    console.log('📋 Attempt:', attempt._id);
    console.log('   User:', attempt.userId);
    console.log('   Set:', attempt.setId);
    console.log('   Completed:', attempt.isCompleted);
    console.log('   Score:', attempt.score);

    if (!attempt.isCompleted) {
      console.log('❌ Attempt not completed, cannot create commission');
      return;
    }

    // Get question set
    const questionSet = await QuestionSet.findById(attempt.setId);
    if (!questionSet) {
      console.log('❌ Question set not found');
      return;
    }

    console.log('\n📚 Question Set:', questionSet.title);
    console.log('   Status:', questionSet.status);
    console.log('   Owner:', questionSet.userId);

    // Check if user is premium
    const user = await User.findById(attempt.userId).select('subscriptionStatus subscriptionPlanId fullName');
    const isPremium = !!(user && user.subscriptionStatus === 'Active' && user.subscriptionPlanId);
    console.log('\n👤 User:', user?.fullName || 'Unknown');
    console.log('   Premium:', isPremium ? '✅ Yes' : '❌ No');

    // Determine commission type
    let commissionType = null;
    let expertId = null;
    let validationRequestId = null;
    let entitledUntil = null;
    let fixedAmount = 0;

    if (questionSet.status === 'Published' || questionSet.status === 'Public') {
      const creator = await User.findById(questionSet.userId).select('role fullName');
      if (creator && creator.role === 'Expert') {
        commissionType = commissionConfig.types.PUBLISHED;
        expertId = questionSet.userId;
        fixedAmount = commissionConfig.fixedRates.published;
        console.log('\n✅ Type: Published (Public set by Expert)');
        console.log('   Expert:', creator.fullName, `(${expertId})`);
        console.log('   Fixed Rate:', fixedAmount, 'VND');
      }
    } else if (questionSet.status === 'Validated') {
      const validationRequest = await ValidationRequest.findOne({
        setId: questionSet._id,
        status: 'Completed',
        decision: 'Approved',
      });

      if (validationRequest && validationRequest.expertId) {
        const validatedAt = validationRequest.completionTime || new Date();
        entitledUntil = new Date(validatedAt);
        entitledUntil.setDate(entitledUntil.getDate() + commissionConfig.entitlementDays);

        // Check if entitlement is still valid
        if (new Date() > entitledUntil) {
          console.log('❌ Commission entitlement expired');
          console.log('   Validated at:', validatedAt);
          console.log('   Entitled until:', entitledUntil);
          return;
        }

        commissionType = commissionConfig.types.VALIDATED;
        expertId = validationRequest.expertId;
        validationRequestId = validationRequest._id;
        fixedAmount = commissionConfig.fixedRates.validated;

        const expert = await User.findById(expertId).select('fullName');
        console.log('\n✅ Type: Validated');
        console.log('   Expert:', expert?.fullName || 'Unknown', `(${expertId})`);
        console.log('   Fixed Rate:', fixedAmount, 'VND');
        console.log('   Validated at:', validatedAt);
        console.log('   Entitled until:', entitledUntil);
      }
    }

    if (!commissionType) {
      console.log('\n❌ No commission applicable');
      console.log('   Question set status must be Published/Public (by Expert) or Validated');
      return;
    }

    // Create commission record
    const commission = await CommissionRecord.create({
      expertId,
      attemptId: attempt._id,
      setId: questionSet._id,
      type: commissionType,
      fixedAmount,
      bonusAmount: 0,
      commissionAmount: fixedAmount,
      isPremiumAttempt: isPremium,
      isReconciled: false,
      status: commissionConfig.statuses.PENDING,
      transactionDate: new Date(),
      reconciliationMonth: null,
      validationRequestId,
      entitledUntil,
    });

    console.log('\n✅ Commission created successfully!');
    console.log('   Commission ID:', commission._id);
    console.log('   Expert ID:', commission.expertId);
    console.log('   Type:', commission.type);
    console.log('   Fixed Amount:', commission.fixedAmount, 'VND');
    console.log('   Bonus Amount:', commission.bonusAmount, 'VND');
    console.log('   Total:', commission.commissionAmount, 'VND');
    console.log('   Status:', commission.status);
    console.log('   Is Premium:', commission.isPremiumAttempt);

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  } finally {
    await mongoose.disconnect();
  }
}

const attemptId = process.argv[2];
if (!attemptId) {
  console.log('Usage: node scripts/create-single-commission.js <attemptId>');
  process.exit(1);
}

createCommissionForAttempt(attemptId).then(() => process.exit(0));
