/**
 * Backfill metadata.learnerId for existing commission records
 * This is needed for the 20-attempt limit to work correctly
 */

require('dotenv').config();
const mongoose = require('mongoose');
const CommissionRecord = require('../src/models/commissionRecord.model');
const QuizAttempt = require('../src/models/quizAttempt.model');

async function backfillLearnerIds() {
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      dbName: process.env.MONGO_DB_NAME || 'learinal',
    });
    console.log('Connected to MongoDB');

    // Find all Published commissions without learnerId
    const commissions = await CommissionRecord.find({
      type: 'Published',
      attemptId: { $exists: true, $ne: null },
      'metadata.learnerId': { $exists: false },
    }).lean();

    console.log(`\nFound ${commissions.length} Published commissions without learnerId`);

    if (commissions.length === 0) {
      console.log('Nothing to backfill');
      return;
    }

    let updated = 0;
    let failed = 0;

    for (const commission of commissions) {
      try {
        // Get quiz attempt to find learnerId
        const attempt = await QuizAttempt.findById(commission.attemptId)
          .select('userId')
          .lean();

        if (!attempt) {
          console.log(`  ⚠️ Attempt not found for commission ${commission._id}`);
          failed++;
          continue;
        }

        // Update commission with learnerId
        await CommissionRecord.updateOne(
          { _id: commission._id },
          { $set: { 'metadata.learnerId': attempt.userId.toString() } }
        );

        updated++;
      } catch (err) {
        console.error(`  ❌ Error updating commission ${commission._id}:`, err.message);
        failed++;
      }
    }

    console.log('\n=== Results ===');
    console.log(`✅ Updated: ${updated}`);
    console.log(`❌ Failed: ${failed}`);
    console.log(`Total: ${commissions.length}`);
  } catch (error) {
    console.error('Error:', error.message);
    console.error(error.stack);
  } finally {
    await mongoose.disconnect();
  }
}

backfillLearnerIds();
