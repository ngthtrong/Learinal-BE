/**
 * Backfill commissions for completed attempts that don't have commission records
 * Usage: node scripts/backfill-commissions.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const { env } = require('../src/config');
const { calculateCommissionForAttempt } = require('../src/jobs/commission.calculate');

async function backfillCommissions() {
  try {
    await mongoose.connect(env.mongoUri, { 
      dbName: env.mongoDbName,
      serverSelectionTimeoutMS: 5000 
    });
    console.log('✅ Connected to MongoDB\n');

    const QuizAttempt = require('../src/models/quizAttempt.model');
    const QuestionSet = require('../src/models/questionSet.model');
    const CommissionRecord = require('../src/models/commissionRecord.model');

    // Find all completed attempts
    const completedAttempts = await QuizAttempt.find({ 
      isCompleted: true 
    }).sort({ createdAt: -1 }).lean();

    console.log(`📋 Found ${completedAttempts.length} completed attempts\n`);

    let created = 0;
    let skipped = 0;
    let errors = 0;

    for (const attempt of completedAttempts) {
      try {
        // Check if commission already exists
        const existingCommission = await CommissionRecord.findOne({ 
          attemptId: attempt._id 
        }).lean();

        if (existingCommission) {
          skipped++;
          continue;
        }

        // Check if question set is eligible
        const questionSet = await QuestionSet.findById(attempt.setId).select('status title').lean();
        if (!questionSet || !['Published', 'Validated'].includes(questionSet.status)) {
          skipped++;
          continue;
        }

        // Create commission
        console.log(`Processing attempt ${attempt._id}...`);
        const commission = await calculateCommissionForAttempt({ 
          attemptId: attempt._id.toString() 
        });

        if (commission) {
          created++;
          console.log(`✅ Created commission: ${commission.type} - ${commission.fixedAmount} VND`);
        } else {
          skipped++;
          console.log(`⚠️  Skipped (not eligible)`);
        }

      } catch (error) {
        errors++;
        console.error(`❌ Error processing ${attempt._id}:`, error.message);
      }
    }

    console.log('\n' + '═'.repeat(80));
    console.log('📊 SUMMARY:');
    console.log(`   Created: ${created}`);
    console.log(`   Skipped: ${skipped}`);
    console.log(`   Errors: ${errors}`);
    console.log('═'.repeat(80));

  } catch (error) {
    console.error('❌ Fatal error:', error.message);
    console.error(error.stack);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from MongoDB');
  }
}

backfillCommissions().then(() => process.exit(0));
