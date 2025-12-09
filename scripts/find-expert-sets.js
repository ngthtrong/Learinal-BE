/**
 * Find question sets created by Experts
 * Usage: node scripts/find-expert-sets.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const { env } = require('../src/config');

async function findExpertSets() {
  try {
    await mongoose.connect(env.mongoUri, { 
      dbName: env.mongoDbName,
      serverSelectionTimeoutMS: 5000 
    });
    console.log('✅ Connected to MongoDB\n');

    const QuestionSet = require('../src/models/questionSet.model');
    const User = require('../src/models/user.model');

    // Get all Experts
    const experts = await User.find({ role: 'Expert' }).select('_id fullName email').lean();
    console.log(`Found ${experts.length} Expert users:\n`);
    experts.forEach(e => console.log(`  - ${e.fullName} (${e.email})`));

    // Get question sets by Experts
    const expertIds = experts.map(e => e._id);
    const sets = await QuestionSet.find({ userId: { $in: expertIds } })
      .populate('userId', 'fullName')
      .sort({ createdAt: -1 })
      .limit(20)
      .lean();

    console.log(`\n📚 Found ${sets.length} question sets created by Experts:\n`);
    
    if (sets.length === 0) {
      console.log('⚠️  No question sets created by Experts yet');
      console.log('\n💡 Experts need to create question sets via the UI');
      console.log('   Then their status should be set to "Published" to earn 300 VND per attempt');
    } else {
      sets.forEach(s => {
        console.log(`─`.repeat(80));
        console.log(`Title: ${s.title}`);
        console.log(`ID: ${s._id}`);
        console.log(`Status: ${s.status}`);
        console.log(`Creator: ${s.userId?.fullName}`);
        console.log(`Questions: ${s.questions?.length || 0}`);
        
        if (s.status === 'Published') {
          console.log('✅ Eligible for Published commission (300 VND per attempt)');
        } else if (s.status === 'Public') {
          console.log('ℹ️  Status is "Public" - should this be "Published"?');
        } else {
          console.log(`⚠️  Status "${s.status}" - change to "Published" for commission`);
        }
      });
      console.log(`─`.repeat(80));
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await mongoose.disconnect();
  }
}

findExpertSets().then(() => process.exit(0));
