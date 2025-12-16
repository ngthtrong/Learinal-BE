/**
 * Drop old attemptId unique index
 * Run with: node scripts/drop-attemptid-index.js
 */

const mongoose = require('mongoose');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const env = require('../src/config/env');

async function dropIndex() {
  try {
    await mongoose.connect(env.mongoUri, {
      dbName: env.mongoDbName,
    });
    console.log('✅ Connected to MongoDB\n');

    const db = mongoose.connection.db;
    const collection = db.collection('commissionRecords');

    console.log('📋 Current indexes:');
    const indexes = await collection.indexes();
    indexes.forEach(idx => console.log(`   - ${idx.name}: ${JSON.stringify(idx.key)}`));

    console.log('\n🗑️  Dropping attemptId_1 index...');
    try {
      await collection.dropIndex('attemptId_1');
      console.log('✅ Index dropped successfully');
    } catch (err) {
      if (err.code === 27 || err.message.includes('index not found')) {
        console.log('⚠️  Index already dropped or does not exist');
      } else {
        throw err;
      }
    }

    console.log('\n📋 Indexes after drop:');
    const indexesAfter = await collection.indexes();
    indexesAfter.forEach(idx => console.log(`   - ${idx.name}: ${JSON.stringify(idx.key)}`));

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB');
  }
}

dropIndex();
