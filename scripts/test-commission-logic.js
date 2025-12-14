/**
 * Test commission logic for different scenarios
 * Usage: node scripts/test-commission-logic.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const { env } = require('../src/config');

async function testCommissionLogic() {
  try {
    await mongoose.connect(env.mongoUri, { 
      dbName: env.mongoDbName,
      serverSelectionTimeoutMS: 5000 
    });
    console.log('✅ Connected to MongoDB\n');

    const QuestionSet = require('../src/models/questionSet.model');
    const User = require('../src/models/user.model');
    const QuizAttempt = require('../src/models/quizAttempt.model');
    const ValidationRequest = require('../src/models/validationRequest.model');

    console.log('📋 Commission Logic Test\n');
    console.log('─'.repeat(80));

    // Test Case 1: Expert's Public set
    console.log('\n1️⃣  TEST: Expert Public Set (should earn 300 VND for ALL premium users)');
    const expertPublicSets = await QuestionSet.find({ 
      status: 'Public' 
    }).populate('userId', 'role fullName').limit(5).lean();

    for (const set of expertPublicSets) {
      if (set.userId?.role === 'Expert') {
        console.log(`   ✅ Set: ${set.title}`);
        console.log(`      Expert: ${set.userId.fullName}`);
        console.log(`      → Should earn 300 VND per premium attempt`);
        
        const attempts = await QuizAttempt.find({ setId: set._id, isCompleted: true }).limit(3).lean();
        console.log(`      Recent attempts: ${attempts.length}`);
        for (const att of attempts) {
          const isOwner = att.userId.toString() === set.userId._id.toString();
          console.log(`        - ${att._id}: ${isOwner ? '(Owner)' : '(Other user)'} → 300 VND`);
        }
      }
    }

    // Test Case 2: Learner's Public set (after Validated)
    console.log('\n2️⃣  TEST: Learner Public Set (after Validated)');
    const learnerPublicSets = await QuestionSet.find({ 
      status: 'Public' 
    }).populate('userId', 'role fullName').limit(5).lean();

    for (const set of learnerPublicSets) {
      if (set.userId?.role === 'Learner') {
        console.log(`   ℹ️  Set: ${set.title}`);
        console.log(`      Learner: ${set.userId.fullName}`);
        
        // Check if validated
        const validation = await ValidationRequest.findOne({
          setId: set._id,
          status: 'Completed',
          decision: 'Approved'
        }).populate('expertId', 'fullName').lean();

        if (validation) {
          console.log(`      Expert validated by: ${validation.expertId?.fullName}`);
          console.log(`      → Expert earns 150 VND per premium attempt (any user)`);
        } else {
          console.log(`      ⚠️  No validation found`);
        }
      }
    }

    // Test Case 3: Validated status
    console.log('\n3️⃣  TEST: Validated Set (should earn 150 VND for expert validator)');
    const validatedSets = await QuestionSet.find({ 
      status: 'Validated' 
    }).populate('userId', 'fullName').limit(3).lean();

    for (const set of validatedSets) {
      const validation = await ValidationRequest.findOne({
        setId: set._id,
        status: 'Completed',
        decision: 'Approved'
      }).populate('expertId', 'fullName').lean();

      console.log(`   ✅ Set: ${set.title}`);
      console.log(`      Owner: ${set.userId?.fullName || 'Unknown'}`);
      console.log(`      Validated by: ${validation?.expertId?.fullName || 'Not found'}`);
      console.log(`      → Expert earns 150 VND per premium attempt`);
    }

    console.log('\n─'.repeat(80));
    console.log('\n📝 Summary:');
    console.log('1. Expert Public → 300 VND per ANY premium attempt');
    console.log('2. Learner Public (Validated) → 150 VND to Expert per ANY premium attempt');
    console.log('3. Validated status → 150 VND to Expert per ANY premium attempt');

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await mongoose.disconnect();
  }
}

testCommissionLogic().then(() => process.exit(0));
