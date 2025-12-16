/**
 * Migration Script: Backfill Question Set Snapshots in Validation Requests
 * 
 * This script populates the questionSetSnapshot field in existing validation requests
 * by copying data from the referenced question sets (if they still exist).
 * 
 * Run with: node scripts/backfill-validation-request-snapshots.js
 */

const mongoose = require('mongoose');
const path = require('path');

// Load environment
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const env = require('../src/config/environment');

async function backfillSnapshots() {
  try {
    // Connect to MongoDB
    await mongoose.connect(env.mongoUri, {
      dbName: env.mongoDbName,
      serverSelectionTimeoutMS: 5000,
    });
    console.log('✅ Connected to MongoDB\n');

    const ValidationRequest = require('../src/models/validationRequest.model');
    const QuestionSet = require('../src/models/questionSet.model');

    // Find all validation requests without snapshots
    const requests = await ValidationRequest.find({
      questionSetSnapshot: { $exists: false },
    }).lean();

    console.log(`📋 Found ${requests.length} validation requests without snapshots\n`);

    let updated = 0;
    let notFound = 0;
    let failed = 0;

    for (const request of requests) {
      try {
        // Try to find the question set
        const questionSet = await QuestionSet.findById(request.setId).lean();

        if (!questionSet) {
          console.log(`⚠️  Question set not found for request ${request._id}`);
          notFound++;
          
          // Create a minimal snapshot - note: title will be shown as "Bộ đề (Đã xóa)"
          await ValidationRequest.updateOne(
            { _id: request._id },
            {
              $set: {
                questionSetSnapshot: {
                  title: 'Bộ đề',
                  description: '',
                  questionCount: 0,
                  questions: [],
                },
              },
            }
          );
          updated++;
          continue;
        }

        // Create snapshot from existing question set
        const snapshot = {
          title: questionSet.title,
          description: questionSet.description,
          questionCount: (questionSet.questions || []).length,
          questions: (questionSet.questions || []).map(q => ({
            questionId: q.questionId || String(q._id),
            questionText: q.questionText,
            options: q.options || [],
            correctAnswerIndex: q.correctAnswerIndex,
            difficultyLevel: q.difficultyLevel,
            explanation: q.explanation,
          })),
        };

        await ValidationRequest.updateOne(
          { _id: request._id },
          { $set: { questionSetSnapshot: snapshot } }
        );

        updated++;
        if (updated % 10 === 0) {
          console.log(`✅ Updated ${updated} requests...`);
        }
      } catch (err) {
        console.error(`❌ Failed to update request ${request._id}:`, err.message);
        failed++;
      }
    }

    console.log('\n📊 Summary:');
    console.log(`   Total Requests: ${requests.length}`);
    console.log(`   Updated: ${updated}`);
    console.log(`   Question Sets Not Found: ${notFound}`);
    console.log(`   Failed: ${failed}`);

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB');
  }
}

// Run the migration
backfillSnapshots();
