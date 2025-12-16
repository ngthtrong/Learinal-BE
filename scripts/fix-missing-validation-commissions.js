/**
 * Manually trigger commission creation for missing validations
 * Run with: node scripts/fix-missing-validation-commissions.js
 */

const mongoose = require('mongoose');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const env = require('../src/config/env');

async function fixMissingCommissions() {
  try {
    await mongoose.connect(env.mongoUri, {
      dbName: env.mongoDbName,
      serverSelectionTimeoutMS: 5000,
    });
    console.log('✅ Connected to MongoDB\n');

    const ValidationRequest = require('../src/models/validationRequest.model');
    const CommissionRecord = require('../src/models/commissionRecord.model');
    const QuestionSet = require('../src/models/questionSet.model');
    const reviewCompleted = require('../src/jobs/review.completed');

    console.log('🔧 Fixing Missing Validation Commissions\n');
    console.log('═'.repeat(80));

    // Find all approved validations
    const approvedValidations = await ValidationRequest.find({
      status: 'Completed',
      decision: 'Approved',
    }).sort({ completionTime: -1 }).lean();

    console.log(`\n📋 Found ${approvedValidations.length} approved validations\n`);

    let fixed = 0;
    let alreadyHas = 0;
    let failed = 0;

    for (const vr of approvedValidations) {
      // Check if commission already exists
      const existing = await CommissionRecord.findOne({
        validationRequestId: vr._id,
        type: 'Validated',
      }).lean();

      if (existing) {
        console.log(`✅ ${vr._id} - Already has commission`);
        alreadyHas++;
        continue;
      }

      // Missing commission - create it
      console.log(`\n🔧 ${vr._id} - Creating missing commission...`);
      console.log(`   Set: ${vr.questionSetSnapshot?.title || 'Unknown'}`);
      console.log(`   Expert: ${vr.expertId}`);
      console.log(`   Completed: ${vr.completionTime}`);

      try {
        // Trigger review.completed job
        await reviewCompleted({
          validationRequestId: vr._id.toString(),
          expertId: vr.expertId.toString(),
          setId: vr.setId.toString(),
          decision: 'Approved',
        });

        // Verify commission was created
        const newCommission = await CommissionRecord.findOne({
          validationRequestId: vr._id,
          type: 'Validated',
        }).lean();

        if (newCommission) {
          console.log(`   ✅ Commission created: ${newCommission.fixedAmount}đ`);
          fixed++;
        } else {
          console.log(`   ❌ Failed to create commission (no error but not found)`);
          failed++;
        }
      } catch (error) {
        console.log(`   ❌ Error: ${error.message}`);
        failed++;
      }
    }

    console.log('\n' + '═'.repeat(80));
    console.log('\n📊 Summary:\n');
    console.log(`   Total Approved Validations: ${approvedValidations.length}`);
    console.log(`   Already Had Commission: ${alreadyHas}`);
    console.log(`   Fixed (Created): ${fixed}`);
    console.log(`   Failed: ${failed}`);

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB');
  }
}

fixMissingCommissions();
