/**
 * Test script to verify Published commission flow
 * Usage: node scripts/test-published-commission.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const { env } = require('../src/config');

async function testPublishedCommission() {
  try {
    await mongoose.connect(env.mongoUri, { 
      dbName: env.mongoDbName,
      serverSelectionTimeoutMS: 5000 
    });
    console.log('✅ Connected to MongoDB\n');

    const QuestionSet = require('../src/models/questionSet.model');
    const User = require('../src/models/user.model');
    const QuizAttempt = require('../src/models/quizAttempt.model');
    const CommissionRecord = require('../src/models/commissionRecord.model');

    // Find question sets with status Published
    console.log('📚 Checking Published question sets...\n');
    const publishedSets = await QuestionSet.find({ status: 'Published' })
      .populate('userId', 'role fullName email')
      .limit(10)
      .lean();

    if (publishedSets.length === 0) {
      console.log('⚠️  No Published question sets found');
      console.log('\n💡 To test Published commission:');
      console.log('   1. Create a question set as Expert user');
      console.log('   2. Change its status to "Published"');
      console.log('   3. Have a learner complete the quiz');
      console.log('   4. Commission should be created automatically (300 VND)');
    } else {
      console.log(`Found ${publishedSets.length} Published question sets:\n`);
      
      for (const set of publishedSets) {
        console.log('─'.repeat(80));
        console.log(`Set: ${set.title}`);
        console.log(`ID: ${set._id}`);
        console.log(`Creator: ${set.userId?.fullName || 'Unknown'} (${set.userId?.email})`);
        console.log(`Role: ${set.userId?.role || 'N/A'}`);
        
        // Check if creator is Expert
        if (set.userId?.role !== 'Expert') {
          console.log('⚠️  Creator is NOT Expert - no commission will be created');
        } else {
          console.log('✅ Creator is Expert - eligible for 300 VND per attempt');
        }

        // Check recent attempts
        const attempts = await QuizAttempt.find({ 
          setId: set._id, 
          isCompleted: true 
        })
          .sort({ createdAt: -1 })
          .limit(5)
          .lean();

        console.log(`\nRecent attempts: ${attempts.length}`);
        for (const attempt of attempts) {
          const commission = await CommissionRecord.findOne({ attemptId: attempt._id }).lean();
          console.log(`  - Attempt ${attempt._id}: ${commission ? '✅ Has commission' : '❌ No commission'}`);
        }
        console.log();
      }
      console.log('─'.repeat(80));
    }

    // Find all Experts
    console.log('\n👥 Expert users in system:\n');
    const experts = await User.find({ role: 'Expert' })
      .select('fullName email')
      .lean();

    if (experts.length === 0) {
      console.log('⚠️  No Expert users found');
      console.log('\n💡 To create Expert user, run:');
      console.log('   node scripts/set-user-admin.js <userId> Expert');
    } else {
      experts.forEach(expert => {
        console.log(`- ${expert.fullName} (${expert.email})`);
      });
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await mongoose.disconnect();
  }
}

testPublishedCommission().then(() => process.exit(0));
