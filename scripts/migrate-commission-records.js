/**
 * Migration script to update existing commission records to Hybrid Model format
 * Run this after deploying the new commission system
 * 
 * Usage: node scripts/migrate-commission-records.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const { env } = require('../src/config');

async function migrate() {
  console.log('🚀 Starting commission records migration to Hybrid Model...');
  
  try {
    // Connect to MongoDB
    await mongoose.connect(env.mongoUri, {
      dbName: env.mongoDbName,
    });
    console.log('✅ Connected to MongoDB');

    const CommissionRecord = require('../src/models/commissionRecord.model');
    const commissionConfig = require('../src/config/commission');

    // Find all records without the new 'type' field
    const oldRecords = await CommissionRecord.find({
      $or: [
        { type: { $exists: false } },
        { fixedAmount: { $exists: false } },
      ],
    });

    console.log(`📋 Found ${oldRecords.length} records to migrate`);

    if (oldRecords.length === 0) {
      console.log('✅ No records need migration');
      return;
    }

    let migrated = 0;
    let errors = 0;

    for (const record of oldRecords) {
      try {
        // Determine type based on existing data
        // If validationRequestId exists, it's Validated; otherwise assume Published
        const type = record.validationRequestId 
          ? commissionConfig.types.VALIDATED 
          : commissionConfig.types.PUBLISHED;

        // Use existing commissionAmount as fixedAmount (best effort)
        const fixedAmount = record.commissionAmount || 0;

        // Get month string from transaction date
        const txDate = record.transactionDate || record.createdAt || new Date();
        const year = txDate.getFullYear();
        const month = String(txDate.getMonth() + 1).padStart(2, '0');
        const reconciliationMonth = `${year}-${month}`;

        // Update the record
        await CommissionRecord.findByIdAndUpdate(record._id, {
          $set: {
            type,
            fixedAmount,
            bonusAmount: 0,
            isPremiumAttempt: true, // Assume premium for old records
            isReconciled: true, // Mark as reconciled since they're historical
            reconciledAt: new Date(),
            reconciliationMonth,
          },
        });

        migrated++;
        
        if (migrated % 100 === 0) {
          console.log(`   Migrated ${migrated}/${oldRecords.length} records...`);
        }
      } catch (err) {
        console.error(`❌ Error migrating record ${record._id}:`, err.message);
        errors++;
      }
    }

    console.log('');
    console.log('📊 Migration Summary:');
    console.log(`   Total records: ${oldRecords.length}`);
    console.log(`   Successfully migrated: ${migrated}`);
    console.log(`   Errors: ${errors}`);
    console.log('');
    console.log('✅ Migration completed!');

  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
}

// Run migration
migrate().then(() => process.exit(0));
