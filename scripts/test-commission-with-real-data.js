/**
 * Test Commission Logic with Real Data
 * 
 * Creates real validation requests and quiz attempts to test:
 * 1. Validated type: One-time 150đ payment
 * 2. Published type: 20 attempts limit per learner
 * 
 * Run with: node scripts/test-commission-with-real-data.js
 */

const mongoose = require('mongoose');
const path = require('path');

// Load environment
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const env = require('../src/config/env');

async function testWithRealData() {
  try {
    await mongoose.connect(env.mongoUri, {
      dbName: env.mongoDbName,
      serverSelectionTimeoutMS: 5000,
    });
    console.log('✅ Connected to MongoDB\n');

    const User = require('../src/models/user.model');
    const QuestionSet = require('../src/models/questionSet.model');
    const ValidationRequest = require('../src/models/validationRequest.model');
    const CommissionRecord = require('../src/models/commissionRecord.model');
    const QuizAttempt = require('../src/models/quizAttempt.model');
    const reviewCompleted = require('../src/jobs/review.completed');
    const { calculateCommissionForAttempt } = require('../src/jobs/commission.calculate');

    console.log('🧪 Testing Commission Logic with Real Data\n');
    console.log('═'.repeat(80));

    // Step 1: Find or create test users
    console.log('\n📋 Step 1: Preparing test users...\n');
    
    let expert = await User.findOne({ role: 'Expert' }).lean();
    if (!expert) {
      console.log('❌ No expert found in database. Please create an expert account first.');
      return;
    }
    console.log(`✅ Expert: ${expert.fullName || expert.email} (${expert._id})`);

    let learner = await User.findOne({ role: 'Learner' }).lean();
    if (!learner) {
      console.log('❌ No learner found in database. Please create a learner account first.');
      return;
    }
    console.log(`✅ Learner: ${learner.fullName || learner.email} (${learner._id})`);

    // Step 2: Test VALIDATED type
    console.log('\n' + '═'.repeat(80));
    console.log('\n🧪 TEST 1: VALIDATED Type (One-time Payment)\n');
    console.log('─'.repeat(80));

    // Find or create a learner's question set
    let learnerSet = await QuestionSet.findOne({
      userId: learner._id,
      status: 'Draft',
    }).lean();

    if (!learnerSet) {
      console.log('Creating new question set for learner...');
      learnerSet = await QuestionSet.create({
        userId: learner._id,
        title: `Test Validation Set ${Date.now()}`,
        description: 'Test set for commission validation',
        status: 'Draft',
        questions: [
          {
            questionText: 'Test question 1?',
            options: ['A', 'B', 'C', 'D'],
            correctAnswerIndex: 0,
            difficultyLevel: 'Remember',
          },
          {
            questionText: 'Test question 2?',
            options: ['A', 'B', 'C', 'D'],
            correctAnswerIndex: 1,
            difficultyLevel: 'Understand',
          },
        ],
      });
    }
    console.log(`✅ Question Set: ${learnerSet.title} (${learnerSet._id})`);

    // Create validation request
    console.log('\n📝 Creating validation request...');
    const validationRequest = await ValidationRequest.create({
      setId: learnerSet._id,
      learnerId: learner._id,
      expertId: expert._id,
      status: 'Assigned',
      requestTime: new Date(),
      questionSetSnapshot: {
        title: learnerSet.title,
        description: learnerSet.description,
        questionCount: learnerSet.questions.length,
        questions: learnerSet.questions,
      },
    });
    console.log(`✅ Validation Request created: ${validationRequest._id}`);

    // Count commissions before approval
    const commissionsBefore = await CommissionRecord.countDocuments({
      validationRequestId: validationRequest._id,
      type: 'Validated',
    });
    console.log(`📊 Commissions before approval: ${commissionsBefore}`);

    // Simulate expert approval
    console.log('\n✅ Expert approving validation...');
    await ValidationRequest.updateOne(
      { _id: validationRequest._id },
      {
        status: 'Completed',
        decision: 'Approved',
        completionTime: new Date(),
      }
    );

    // Update question set to Validated
    await QuestionSet.updateOne(
      { _id: learnerSet._id },
      { status: 'Validated' }
    );

    // Trigger review completed job
    await reviewCompleted({
      validationRequestId: validationRequest._id.toString(),
      expertId: expert._id.toString(),
      setId: learnerSet._id.toString(),
      decision: 'Approved',
    });

    // Count commissions after approval
    const commissionsAfter = await CommissionRecord.find({
      validationRequestId: validationRequest._id,
      type: 'Validated',
    }).lean();
    
    console.log(`\n📊 Commissions after approval: ${commissionsAfter.length}`);
    
    if (commissionsAfter.length === 1) {
      const comm = commissionsAfter[0];
      console.log(`\n✅ TEST PASSED: One-time commission created!`);
      console.log(`   Amount: ${comm.fixedAmount}đ`);
      console.log(`   attemptId: ${comm.attemptId || 'null'} ${!comm.attemptId ? '✅' : '❌'}`);
      console.log(`   validationRequestId: ${comm.validationRequestId ? '✅' : '❌'}`);
    } else if (commissionsAfter.length === 0) {
      console.log(`\n❌ TEST FAILED: No commission created!`);
    } else {
      console.log(`\n❌ TEST FAILED: Multiple commissions created (${commissionsAfter.length})!`);
    }

    // Trigger job again to ensure no duplicate
    console.log('\n🔄 Triggering review.completed again (should not create duplicate)...');
    await reviewCompleted({
      validationRequestId: validationRequest._id.toString(),
      expertId: expert._id.toString(),
      setId: learnerSet._id.toString(),
      decision: 'Approved',
    });

    const commissionsAfterRetry = await CommissionRecord.countDocuments({
      validationRequestId: validationRequest._id,
      type: 'Validated',
    });
    
    if (commissionsAfterRetry === 1) {
      console.log(`✅ No duplicate created: Still 1 commission`);
    } else {
      console.log(`❌ Duplicate created: Now ${commissionsAfterRetry} commissions`);
    }

    // Step 3: Test PUBLISHED type with 20 attempts limit
    console.log('\n' + '═'.repeat(80));
    console.log('\n🧪 TEST 2: PUBLISHED Type (20 Attempts Limit)\n');
    console.log('─'.repeat(80));

    // Find or create expert's published set
    let expertSet = await QuestionSet.findOne({
      userId: expert._id,
      status: { $in: ['Published', 'Public'] },
    }).lean();

    if (!expertSet) {
      console.log('Creating new published question set for expert...');
      expertSet = await QuestionSet.create({
        userId: expert._id,
        title: `Expert Test Set ${Date.now()}`,
        description: 'Test set for commission limit',
        status: 'Published',
        questions: [
          {
            questionText: 'Expert question 1?',
            options: ['A', 'B', 'C', 'D'],
            correctAnswerIndex: 0,
            difficultyLevel: 'Understand',
          },
        ],
      });
    }
    console.log(`✅ Expert Question Set: ${expertSet.title} (${expertSet._id})`);

    // Simulate 25 quiz attempts from the same learner
    console.log(`\n📝 Creating 25 quiz attempts from learner ${learner._id.toString().substring(0, 8)}...`);
    console.log('   (Should only create 20 commissions)\n');

    const attemptResults = [];
    
    for (let i = 1; i <= 25; i++) {
      // Create quiz attempt
      const attempt = await QuizAttempt.create({
        userId: learner._id,
        setId: expertSet._id,
        score: 80,
        isCompleted: true,
        startTime: new Date(),
        endTime: new Date(),
        userAnswers: [{
          questionId: expertSet.questions[0].questionId || '1',
          selectedOptionIndex: 0,
          isCorrect: true,
        }],
      });

      // Trigger commission calculation
      const commission = await calculateCommissionForAttempt({ attemptId: attempt._id.toString() });
      
      const created = !!commission;
      attemptResults.push({ attemptNum: i, created });

      if (i % 5 === 0) {
        const created = attemptResults.filter(r => r.created).length;
        console.log(`   Attempt ${i}/25: ${created} commissions created`);
      }
    }

    // Count final commissions
    const finalCommissions = await CommissionRecord.find({
      setId: expertSet._id,
      type: 'Published',
      'metadata.learnerId': learner._id.toString(),
    }).lean();

    console.log(`\n📊 Final Results:`);
    console.log(`   Total attempts: 25`);
    console.log(`   Commissions created: ${finalCommissions.length}`);
    console.log(`   Expected: 20 (limit)`);
    
    if (finalCommissions.length === 20) {
      console.log(`\n✅ TEST PASSED: Exactly 20 commissions created!`);
      const total = finalCommissions.reduce((sum, c) => sum + c.fixedAmount, 0);
      console.log(`   Total commission: ${total}đ (20 × 300đ)`);
    } else if (finalCommissions.length < 20) {
      console.log(`\n⚠️  WARNING: Less than 20 commissions created`);
    } else {
      console.log(`\n❌ TEST FAILED: More than 20 commissions created!`);
    }

    // Verify learnerId tracking
    const withLearnerId = finalCommissions.filter(c => c.metadata?.learnerId).length;
    console.log(`\n   With learnerId: ${withLearnerId}/${finalCommissions.length} ${withLearnerId === finalCommissions.length ? '✅' : '❌'}`);

    console.log('\n' + '═'.repeat(80));
    console.log('\n✅ Testing Complete!\n');

  } catch (error) {
    console.error('❌ Error:', error);
    console.error(error.stack);
  } finally {
    await mongoose.disconnect();
    console.log('✅ Disconnected from MongoDB\n');
  }
}

// Run the test
testWithRealData();
