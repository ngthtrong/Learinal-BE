/**
 * Check recent commissions for a specific question set
 * Usage: node scripts/check-recent-commissions.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const CommissionRecord = require('../src/models/commissionRecord.model');
const QuestionSet = require('../src/models/questionSet.model');

async function checkRecentCommissions() {
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      dbName: process.env.MONGO_DB_NAME || 'learinal',
    });
    console.log('Connected to MongoDB');

    // Find question set named "thien"
    const questionSet = await QuestionSet.findOne({ title: /thien/i }).lean();
    if (!questionSet) {
      console.log('Question set "thien" not found');
      return;
    }

    console.log('\nQuestion Set:', questionSet.title);
    console.log('ID:', questionSet._id.toString());
    console.log('Status:', questionSet.status);

    // Get all commissions for this set, grouped by learnerId
    const commissions = await CommissionRecord.find({
      setId: questionSet._id,
      type: 'Published',
    })
      .sort({ createdAt: -1 })
      .lean();

    console.log('\nTotal Published Commissions:', commissions.length);

    // Group by learner
    const byLearner = {};
    commissions.forEach((c) => {
      const learnerId = c.metadata?.learnerId || 'unknown';
      if (!byLearner[learnerId]) {
        byLearner[learnerId] = [];
      }
      byLearner[learnerId].push(c);
    });

    console.log('\nCommissions by Learner:');
    for (const [learnerId, commList] of Object.entries(byLearner)) {
      console.log(`\nLearner ${learnerId}: ${commList.length} commissions`);
      
      // Show last 5
      console.log('Recent 5:');
      commList.slice(0, 5).forEach((c, idx) => {
        const createdAt = new Date(c.createdAt).toLocaleString('vi-VN');
        console.log(`  ${idx + 1}. ${createdAt} - ${c.commissionAmount}₫ - Status: ${c.status}`);
      });

      if (commList.length > 20) {
        console.log(`  ⚠️ EXCEEDS LIMIT: ${commList.length} commissions (limit: 20)`);
      }
    }

    // Check the most recent commission
    if (commissions.length > 0) {
      const latest = commissions[0];
      const createdTime = new Date(latest.createdAt);
      const now = new Date();
      const minutesAgo = Math.floor((now - createdTime) / 60000);
      
      console.log('\n=== Latest Commission ===');
      console.log('Created:', createdTime.toLocaleString('vi-VN'));
      console.log('Minutes ago:', minutesAgo);
      console.log('Amount:', latest.commissionAmount);
      console.log('LearnerId:', latest.metadata?.learnerId || 'N/A');
      console.log('AttemptId:', latest.attemptId?.toString() || 'N/A');
    }
  } catch (error) {
    console.error('Error:', error.message);
    console.error(error.stack);
  } finally {
    await mongoose.disconnect();
  }
}

checkRecentCommissions();
