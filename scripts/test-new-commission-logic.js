/**
 * Test Script: Verify New Commission Logic
 * 
 * Tests:
 * 1. Validated type: One-time payment at validation completion
 * 2. Published type: 20 attempts limit per learner
 * 
 * Run with: node scripts/test-new-commission-logic.js
 */

const mongoose = require('mongoose');
const path = require('path');

// Load environment
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const env = require('../src/config/env');

async function testNewCommissionLogic() {
  try {
    await mongoose.connect(env.mongoUri, {
      dbName: env.mongoDbName,
      serverSelectionTimeoutMS: 5000,
    });
    console.log('✅ Connected to MongoDB\n');

    const CommissionRecord = require('../src/models/commissionRecord.model');
    const ValidationRequest = require('../src/models/validationRequest.model');
    const QuestionSet = require('../src/models/questionSet.model');

    console.log('🧪 Testing New Commission Logic\n');
    console.log('─'.repeat(80));

    // Test 1: Check Validated Type Commissions
    console.log('\n1️⃣  Testing VALIDATED Type (One-time Payment)\n');
    
    const validatedCommissions = await CommissionRecord.find({
      type: 'Validated',
    }).limit(10).lean();
    
    console.log(`Found ${validatedCommissions.length} validated commissions\n`);
    
    for (const comm of validatedCommissions) {
      const hasAttemptId = !!comm.attemptId;
      const hasValidationRequestId = !!comm.validationRequestId;
      const amount = comm.fixedAmount;
      
      console.log(`Commission ID: ${comm._id}`);
      console.log(`  Amount: ${amount}đ`);
      console.log(`  Has attemptId: ${hasAttemptId ? '❌ WRONG (should be null)' : '✅ Correct (null)'}`);
      console.log(`  Has validationRequestId: ${hasValidationRequestId ? '✅ Yes' : '❌ Missing'}`);
      
      if (hasValidationRequestId) {
        // Check if multiple commissions exist for same validation
        const duplicates = await CommissionRecord.countDocuments({
          validationRequestId: comm.validationRequestId,
          type: 'Validated',
        });
        
        console.log(`  Duplicate commissions: ${duplicates > 1 ? `❌ ${duplicates} (should be 1)` : '✅ 1 (correct)'}`);
      }
      
      console.log('');
    }

    // Test 2: Check Published Type Commissions - Learner Limits
    console.log('\n2️⃣  Testing PUBLISHED Type (20 Attempts Limit per Learner)\n');
    
    const publishedSets = await QuestionSet.find({
      status: { $in: ['Published', 'Public'] },
    }).limit(5).lean();
    
    for (const set of publishedSets) {
      console.log(`Question Set: ${set.title}`);
      console.log(`  Set ID: ${set._id}\n`);
      
      const commissions = await CommissionRecord.find({
        setId: set._id,
        type: 'Published',
        'metadata.learnerId': { $exists: true },
      }).lean();
      
      // Group by learner
      const byLearner = new Map();
      for (const comm of commissions) {
        const learnerId = comm.metadata?.learnerId;
        if (!learnerId) continue;
        
        if (!byLearner.has(learnerId)) {
          byLearner.set(learnerId, []);
        }
        byLearner.get(learnerId).push(comm);
      }
      
      console.log(`  Total learners: ${byLearner.size}`);
      console.log(`  Total commissions: ${commissions.length}\n`);
      
      let violationsCount = 0;
      for (const [learnerId, learnerCommissions] of byLearner) {
        const count = learnerCommissions.length;
        const isViolation = count > 20;
        
        if (isViolation || count >= 15) { // Show learners close to or over limit
          console.log(`  Learner ${learnerId.substring(0, 8)}...`);
          console.log(`    Commissions: ${count} ${isViolation ? '❌ OVER LIMIT!' : count === 20 ? '⚠️  At limit' : '✅'}`);
          console.log(`    Total earned: ${count * 300}đ`);
        }
        
        if (isViolation) violationsCount++;
      }
      
      if (violationsCount > 0) {
        console.log(`\n  ⚠️  ${violationsCount} learner(s) exceeded 20 attempts limit!`);
      } else {
        console.log(`\n  ✅ All learners within 20 attempts limit`);
      }
      
      console.log('');
    }

    // Summary
    console.log('─'.repeat(80));
    console.log('\n📊 Summary\n');
    
    const totalValidated = await CommissionRecord.countDocuments({ type: 'Validated' });
    const validatedWithAttempt = await CommissionRecord.countDocuments({ 
      type: 'Validated',
      attemptId: { $ne: null },
    });
    const validatedWithoutValidationRequest = await CommissionRecord.countDocuments({
      type: 'Validated',
      validationRequestId: null,
    });
    
    console.log(`Validated Commissions:`);
    console.log(`  Total: ${totalValidated}`);
    console.log(`  With attemptId: ${validatedWithAttempt} ${validatedWithAttempt > 0 ? '❌ (should be 0)' : '✅'}`);
    console.log(`  Without validationRequestId: ${validatedWithoutValidationRequest} ${validatedWithoutValidationRequest > 0 ? '❌' : '✅'}`);
    
    const totalPublished = await CommissionRecord.countDocuments({ type: 'Published' });
    const publishedWithLearnerId = await CommissionRecord.countDocuments({
      type: 'Published',
      'metadata.learnerId': { $exists: true },
    });
    
    console.log(`\nPublished Commissions:`);
    console.log(`  Total: ${totalPublished}`);
    console.log(`  With learnerId tracking: ${publishedWithLearnerId} / ${totalPublished} (${((publishedWithLearnerId/totalPublished)*100).toFixed(1)}%)`);

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB');
  }
}

// Run the test
testNewCommissionLogic();
