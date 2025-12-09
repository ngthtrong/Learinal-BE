/**
 * List recent quiz attempts to help debug commission issues
 * Usage: node scripts/list-recent-attempts.js [limit]
 */

require('dotenv').config();
const mongoose = require('mongoose');
const { env } = require('../src/config');

async function listRecentAttempts(limit = 10) {
  try {
    await mongoose.connect(env.mongoUri, { 
      dbName: env.mongoDbName,
      serverSelectionTimeoutMS: 5000 
    });
    console.log('✅ Connected to MongoDB\n');

    const QuizAttempt = require('../src/models/quizAttempt.model');
    const QuestionSet = require('../src/models/questionSet.model');
    const CommissionRecord = require('../src/models/commissionRecord.model');
    const User = require('../src/models/user.model');

    const attempts = await QuizAttempt.find()
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    console.log(`📋 Last ${limit} quiz attempts:\n`);

    for (const attempt of attempts) {
      const questionSet = await QuestionSet.findById(attempt.setId).select('title status userId').lean();
      const user = await User.findById(attempt.userId).select('fullName subscriptionStatus').lean();
      const commission = await CommissionRecord.findOne({ attemptId: attempt._id }).lean();

      console.log('─'.repeat(80));
      console.log(`Attempt ID: ${attempt._id}`);
      console.log(`User: ${user?.fullName || 'Unknown'} (${user?.subscriptionStatus || 'N/A'})`);
      console.log(`Set: ${questionSet?.title || 'Unknown'} (${questionSet?.status || 'N/A'})`);
      console.log(`Completed: ${attempt.isCompleted ? '✅' : '❌'}`);
      console.log(`Score: ${attempt.score || 0}`);
      console.log(`Created: ${attempt.createdAt}`);
      
      if (commission) {
        console.log(`Commission: ✅ ${commission.type} - ${commission.fixedAmount} VND (${commission.status})`);
      } else {
        console.log('Commission: ❌ Not found');
        
        // Explain why
        if (!attempt.isCompleted) {
          console.log('  → Attempt not completed');
        } else if (!questionSet) {
          console.log('  → Question set not found');
        } else if (!['Published', 'Validated'].includes(questionSet.status)) {
          console.log(`  → Question set status "${questionSet.status}" not eligible`);
        } else {
          console.log('  → Should have commission! Check worker logs.');
        }
      }
      console.log();
    }

    console.log('─'.repeat(80));
    console.log(`\n💡 To debug a specific attempt, run:`);
    console.log(`   node scripts/debug-commission.js <attemptId>`);

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await mongoose.disconnect();
  }
}

const limit = parseInt(process.argv[2]) || 10;
listRecentAttempts(limit).then(() => process.exit(0));
