/**
 * Debug: Check recent validation commissions
 * Run with: node scripts/debug-validation-commission.js
 */

const mongoose = require('mongoose');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const env = require('../src/config/env');

async function debugValidationCommission() {
  try {
    await mongoose.connect(env.mongoUri, {
      dbName: env.mongoDbName,
      serverSelectionTimeoutMS: 5000,
    });
    console.log('✅ Connected to MongoDB\n');

    const ValidationRequest = require('../src/models/validationRequest.model');
    const CommissionRecord = require('../src/models/commissionRecord.model');
    const User = require('../src/models/user.model');

    console.log('🔍 Checking Recent Validation Requests & Commissions\n');
    console.log('═'.repeat(80));

    // Get recent validation requests
    const recentValidations = await ValidationRequest.find({
      status: 'Completed',
      decision: 'Approved',
    })
      .sort({ completionTime: -1 })
      .limit(10)
      .lean();

    console.log(`\n📋 Found ${recentValidations.length} recent approved validations:\n`);

    for (const vr of recentValidations) {
      const expert = await User.findById(vr.expertId).select('fullName email').lean();
      const learner = await User.findById(vr.learnerId).select('fullName email').lean();
      
      console.log(`ValidationRequest ID: ${vr._id}`);
      console.log(`  Expert: ${expert?.fullName || expert?.email || 'Unknown'}`);
      console.log(`  Learner: ${learner?.fullName || learner?.email || 'Unknown'}`);
      console.log(`  Set Title: ${vr.questionSetSnapshot?.title || 'Unknown'}`);
      console.log(`  Completed: ${vr.completionTime || 'N/A'}`);
      
      // Check if commission exists
      const commission = await CommissionRecord.findOne({
        validationRequestId: vr._id,
        type: 'Validated',
      }).lean();
      
      if (commission) {
        console.log(`  ✅ Commission: ${commission.fixedAmount}đ (Status: ${commission.status})`);
        console.log(`     Created: ${commission.createdAt}`);
      } else {
        console.log(`  ❌ NO COMMISSION FOUND!`);
      }
      console.log('');
    }

    // Get all Validated type commissions
    console.log('═'.repeat(80));
    console.log('\n💰 All Validated Type Commissions:\n');
    
    const validatedCommissions = await CommissionRecord.find({
      type: 'Validated',
    })
      .sort({ createdAt: -1 })
      .limit(20)
      .lean();

    console.log(`Total Validated Commissions: ${validatedCommissions.length}\n`);

    for (const comm of validatedCommissions) {
      const expert = await User.findById(comm.expertId).select('fullName').lean();
      const vr = await ValidationRequest.findById(comm.validationRequestId).lean();
      
      console.log(`Commission ID: ${comm._id}`);
      console.log(`  Expert: ${expert?.fullName || 'Unknown'}`);
      console.log(`  Amount: ${comm.fixedAmount}đ`);
      console.log(`  Status: ${comm.status}`);
      console.log(`  Created: ${comm.createdAt}`);
      console.log(`  Set Title: ${comm.questionSetSnapshot?.title || comm.metadata?.questionSetTitle || 'Unknown'}`);
      console.log(`  ValidationRequest: ${comm.validationRequestId || 'None'} ${vr ? '✅' : '❌'}`);
      console.log(`  attemptId: ${comm.attemptId || 'null'}`);
      console.log('');
    }

    // Summary
    console.log('═'.repeat(80));
    console.log('\n📊 Summary:\n');
    
    const totalValidated = await CommissionRecord.countDocuments({ type: 'Validated' });
    const totalApproved = await ValidationRequest.countDocuments({
      status: 'Completed',
      decision: 'Approved',
    });
    
    console.log(`Total Approved Validations: ${totalApproved}`);
    console.log(`Total Validated Commissions: ${totalValidated}`);
    console.log(`Missing Commissions: ${totalApproved - totalValidated}`);

    if (totalApproved > totalValidated) {
      console.log('\n⚠️  Some approved validations do NOT have commissions!');
      console.log('   This could be because:');
      console.log('   1. They were approved before the new logic was deployed');
      console.log('   2. The review.completed job failed to create commission');
      console.log('   3. The worker/queue is not running');
    }

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB');
  }
}

debugValidationCommission();
