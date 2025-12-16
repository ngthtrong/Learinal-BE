/**
 * Test Script: Verify Snapshot Functionality
 * 
 * Tests that snapshots are created and used correctly when question sets are deleted
 * 
 * Run with: node scripts/test-snapshot-feature.js
 */

const mongoose = require('mongoose');
const path = require('path');

// Load environment
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const env = require('../src/config/environment');

async function testSnapshotFeature() {
  try {
    await mongoose.connect(env.mongoUri, {
      dbName: env.mongoDbName,
      serverSelectionTimeoutMS: 5000,
    });
    console.log('✅ Connected to MongoDB\n');

    const ValidationRequest = require('../src/models/validationRequest.model');
    const CommissionRecord = require('../src/models/commissionRecord.model');
    const QuestionSet = require('../src/models/questionSet.model');

    console.log('🧪 Testing Snapshot Feature\n');
    console.log('─'.repeat(80));

    // Test 1: Check ValidationRequest snapshots
    console.log('\n1️⃣  Testing ValidationRequest Snapshots\n');
    
    const validationRequests = await ValidationRequest.find({}).limit(5).lean();
    
    for (const vr of validationRequests) {
      const questionSet = await QuestionSet.findById(vr.setId).lean();
      const hasSnapshot = vr.questionSetSnapshot && vr.questionSetSnapshot.title;
      
      console.log(`Request ID: ${vr._id}`);
      console.log(`  Question Set Exists: ${questionSet ? '✅ Yes' : '❌ No (Deleted)'}`);
      console.log(`  Has Snapshot: ${hasSnapshot ? '✅ Yes' : '❌ No'}`);
      
      if (hasSnapshot) {
        console.log(`  Snapshot Title: "${vr.questionSetSnapshot.title}"`);
        console.log(`  Snapshot Questions: ${vr.questionSetSnapshot.questionCount || 0} questions`);
      }
      
      if (!questionSet && !hasSnapshot) {
        console.log(`  ⚠️  WARNING: Question set deleted but no snapshot!`);
      }
      
      console.log('');
    }

    // Test 2: Check CommissionRecord snapshots
    console.log('\n2️⃣  Testing CommissionRecord Snapshots\n');
    
    const commissionRecords = await CommissionRecord.find({}).limit(5).lean();
    
    for (const cr of commissionRecords) {
      const questionSet = await QuestionSet.findById(cr.setId).lean();
      const hasSnapshot = cr.questionSetSnapshot && cr.questionSetSnapshot.title;
      const hasMetadata = cr.metadata && cr.metadata.questionSetTitle;
      
      console.log(`Record ID: ${cr._id}`);
      console.log(`  Question Set Exists: ${questionSet ? '✅ Yes' : '❌ No (Deleted)'}`);
      console.log(`  Has Snapshot: ${hasSnapshot ? '✅ Yes' : '❌ No'}`);
      console.log(`  Has Metadata Title: ${hasMetadata ? '✅ Yes' : '❌ No'}`);
      
      if (hasSnapshot) {
        console.log(`  Snapshot Title: "${cr.questionSetSnapshot.title}"`);
      }
      
      if (hasMetadata) {
        console.log(`  Metadata Title: "${cr.metadata.questionSetTitle}"`);
      }
      
      if (!questionSet && !hasSnapshot && !hasMetadata) {
        console.log(`  ⚠️  WARNING: Question set deleted but no snapshot or metadata!`);
      }
      
      console.log('');
    }

    // Summary
    console.log('─'.repeat(80));
    console.log('\n📊 Summary\n');
    
    const vrWithSnapshot = await ValidationRequest.countDocuments({
      'questionSetSnapshot.title': { $exists: true },
    });
    const vrTotal = await ValidationRequest.countDocuments({});
    
    const crWithSnapshot = await CommissionRecord.countDocuments({
      'questionSetSnapshot.title': { $exists: true },
    });
    const crTotal = await CommissionRecord.countDocuments({});
    
    console.log(`ValidationRequests:`);
    console.log(`  With Snapshot: ${vrWithSnapshot} / ${vrTotal} (${((vrWithSnapshot/vrTotal)*100).toFixed(1)}%)`);
    
    console.log(`\nCommissionRecords:`);
    console.log(`  With Snapshot: ${crWithSnapshot} / ${crTotal} (${((crWithSnapshot/crTotal)*100).toFixed(1)}%)`);

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB');
  }
}

// Run the test
testSnapshotFeature();
