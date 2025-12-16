/**
 * Delete excess commissions beyond 20-attempt limit per learner
 * Keeps the FIRST 20 commissions (oldest), deletes the rest
 */

require('dotenv').config();
const mongoose = require('mongoose');
const CommissionRecord = require('../src/models/commissionRecord.model');

async function deleteExcessCommissions() {
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      dbName: process.env.MONGO_DB_NAME || 'learinal',
    });
    console.log('Connected to MongoDB');

    // Get all Published commissions, grouped by setId + learnerId
    const commissions = await CommissionRecord.find({
      type: 'Published',
      'metadata.learnerId': { $exists: true },
    })
      .sort({ createdAt: 1 }) // Oldest first
      .lean();

    console.log(`\nFound ${commissions.length} Published commissions with learnerId`);

    // Group by setId + learnerId
    const grouped = {};
    commissions.forEach((c) => {
      const key = `${c.setId}_${c.metadata.learnerId}`;
      if (!grouped[key]) {
        grouped[key] = {
          setId: c.setId,
          learnerId: c.metadata.learnerId,
          commissions: [],
        };
      }
      grouped[key].commissions.push(c);
    });

    console.log(`\nGrouped into ${Object.keys(grouped).length} unique (setId, learnerId) pairs`);

    let totalDeleted = 0;
    const maxPerLearner = 20;

    for (const [key, group] of Object.entries(grouped)) {
      const count = group.commissions.length;
      
      if (count > maxPerLearner) {
        console.log(`\n⚠️ Set ${group.setId}, Learner ${group.learnerId}: ${count} commissions (exceeds ${maxPerLearner})`);
        
        // Keep first 20, delete the rest
        const toDelete = group.commissions.slice(maxPerLearner);
        console.log(`  Deleting ${toDelete.length} excess commissions...`);
        
        for (const commission of toDelete) {
          const createdAt = new Date(commission.createdAt).toLocaleString('vi-VN');
          console.log(`    - ${commission._id} (${createdAt}) - ${commission.commissionAmount}₫`);
        }
        
        const ids = toDelete.map((c) => c._id);
        const result = await CommissionRecord.deleteMany({ _id: { $in: ids } });
        console.log(`  ✅ Deleted: ${result.deletedCount}`);
        totalDeleted += result.deletedCount;
      }
    }

    console.log('\n=== Summary ===');
    console.log(`Total deleted: ${totalDeleted} excess commissions`);
  } catch (error) {
    console.error('Error:', error.message);
    console.error(error.stack);
  } finally {
    await mongoose.disconnect();
  }
}

deleteExcessCommissions();
