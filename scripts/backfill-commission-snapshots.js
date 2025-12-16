/**
 * Migration Script: Backfill Question Set Snapshots in Commission Records
 * 
 * This script populates the questionSetSnapshot field in existing commission records
 * by copying data from the referenced question sets (if they still exist).
 * 
 * Run with: node scripts/backfill-commission-snapshots.js
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

    const CommissionRecord = require('../src/models/commissionRecord.model');
    const QuestionSet = require('../src/models/questionSet.model');

    // Find all commission records without snapshots
    const records = await CommissionRecord.find({
      questionSetSnapshot: { $exists: false },
    }).lean();

    console.log(`📋 Found ${records.length} commission records without snapshots\n`);

    let updated = 0;
    let notFound = 0;
    let failed = 0;

    for (const record of records) {
      try {
        // Try to find the question set
        const questionSet = await QuestionSet.findById(record.setId).lean();

        if (!questionSet) {
          console.log(`⚠️  Question set not found for record ${record._id}`);
          notFound++;
          
          // Create a minimal snapshot using metadata if available
          // Title will be from metadata or "Bộ đề" as fallback
          await CommissionRecord.updateOne(
            { _id: record._id },
            {
              $set: {
                questionSetSnapshot: {
                  title: record.metadata?.questionSetTitle || 'Bộ đề',
                  description: '',
                  status: 'Deleted',
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
          status: questionSet.status,
        };

        await CommissionRecord.updateOne(
          { _id: record._id },
          { $set: { questionSetSnapshot: snapshot } }
        );

        updated++;
        if (updated % 50 === 0) {
          console.log(`✅ Updated ${updated} records...`);
        }
      } catch (err) {
        console.error(`❌ Failed to update record ${record._id}:`, err.message);
        failed++;
      }
    }

    console.log('\n📊 Summary:');
    console.log(`   Total Records: ${records.length}`);
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
