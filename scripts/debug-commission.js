/**
 * Debug script to check why commission is not being created
 * Usage: node scripts/debug-commission.js <attemptId>
 */

require('dotenv').config();
const mongoose = require('mongoose');
const { env } = require('../src/config');

async function debugCommission(attemptId) {
  try {
    // Connect to MongoDB
    await mongoose.connect(env.mongoUri, { 
      dbName: env.mongoDbName,
      serverSelectionTimeoutMS: 5000 
    });
    console.log('✅ Connected to MongoDB');

    const QuizAttempt = require('../src/models/quizAttempt.model');
    const QuestionSet = require('../src/models/questionSet.model');
    const ValidationRequest = require('../src/models/validationRequest.model');
    const CommissionRecord = require('../src/models/commissionRecord.model');
    const User = require('../src/models/user.model');

    // 1. Check attempt exists
    console.log('\n📋 Checking quiz attempt...');
    const attempt = await QuizAttempt.findById(attemptId).lean();
    if (!attempt) {
      console.log('❌ Quiz attempt not found!');
      return;
    }
    console.log('✅ Attempt found:', {
      id: attempt._id,
      userId: attempt.userId,
      setId: attempt.setId,
      isCompleted: attempt.isCompleted,
      score: attempt.score
    });

    if (!attempt.isCompleted) {
      console.log('❌ Attempt not completed yet!');
      return;
    }

    // 2. Check existing commission
    console.log('\n💰 Checking existing commission...');
    const existingCommission = await CommissionRecord.findOne({ attemptId }).lean();
    if (existingCommission) {
      console.log('✅ Commission already exists:', {
        id: existingCommission._id,
        expertId: existingCommission.expertId,
        type: existingCommission.type,
        fixedAmount: existingCommission.fixedAmount,
        bonusAmount: existingCommission.bonusAmount,
        status: existingCommission.status
      });
      return;
    }
    console.log('⚠️  No commission record found');

    // 3. Check question set
    console.log('\n📚 Checking question set...');
    const questionSet = await QuestionSet.findById(attempt.setId).lean();
    if (!questionSet) {
      console.log('❌ Question set not found!');
      return;
    }
    console.log('✅ Question set found:', {
      id: questionSet._id,
      title: questionSet.title,
      status: questionSet.status,
      userId: questionSet.userId
    });

    const eligibleStatuses = ['Published', 'Validated'];
    if (!eligibleStatuses.includes(questionSet.status)) {
      console.log(`❌ Question set status "${questionSet.status}" not eligible for commission`);
      console.log(`   Must be: ${eligibleStatuses.join(' or ')}`);
      return;
    }

    // 4. Determine commission type
    console.log('\n🔍 Determining commission type...');
    
    if (questionSet.status === 'Published') {
      const creator = await User.findById(questionSet.userId).select('role fullName').lean();
      console.log('Creator:', creator);
      if (creator && creator.role === 'Expert') {
        console.log('✅ Type: Published (Expert-created content)');
        console.log('   Expert:', creator.fullName);
        console.log('   Fixed Rate: 300 VND');
      } else {
        console.log('❌ Creator is not an Expert!');
        return;
      }
    }

    if (questionSet.status === 'Validated') {
      const validationRequest = await ValidationRequest.findOne({
        setId: questionSet._id,
        status: 'Completed',
        decision: 'Approved'
      }).select('expertId completionTime').lean();
      
      if (!validationRequest) {
        console.log('❌ No approved validation request found!');
        return;
      }
      
      console.log('✅ Validation request found:', {
        expertId: validationRequest.expertId,
        completionTime: validationRequest.completionTime
      });

      const expert = await User.findById(validationRequest.expertId).select('fullName').lean();
      console.log('✅ Type: Validated');
      console.log('   Expert:', expert?.fullName);
      console.log('   Fixed Rate: 150 VND');

      // Check entitlement
      const validatedAt = validationRequest.completionTime || new Date();
      const entitledUntil = new Date(validatedAt);
      entitledUntil.setDate(entitledUntil.getDate() + 180);
      
      console.log('   Validated at:', validatedAt);
      console.log('   Entitled until:', entitledUntil);
      
      if (new Date() > entitledUntil) {
        console.log('❌ Entitlement period expired!');
        return;
      }
    }

    // 5. Check user premium status
    console.log('\n👤 Checking user premium status...');
    const user = await User.findById(attempt.userId).select('subscriptionStatus subscriptionPlanId fullName').lean();
    if (!user) {
      console.log('❌ User not found!');
      return;
    }
    const isPremium = user.subscriptionStatus === 'Active' && user.subscriptionPlanId;
    console.log('User:', user.fullName);
    console.log('Premium:', isPremium ? '✅ Yes' : '⚠️  No (commission still created but flagged)');

    // 6. Check if commission should be created
    console.log('\n✅ ALL CHECKS PASSED!');
    console.log('Commission should be created by worker when job is processed.');
    console.log('\n💡 To create commission manually, ensure:');
    console.log('   1. Worker is running: npm run worker');
    console.log('   2. Redis is connected');
    console.log('   3. Job was added to queue: commissionCalculate');

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from MongoDB');
  }
}

// Get attemptId from command line
const attemptId = process.argv[2];
if (!attemptId) {
  console.log('Usage: node scripts/debug-commission.js <attemptId>');
  console.log('Example: node scripts/debug-commission.js 674f9a1b2c3d4e5f6a7b8c9d');
  process.exit(1);
}

debugCommission(attemptId).then(() => process.exit(0));
