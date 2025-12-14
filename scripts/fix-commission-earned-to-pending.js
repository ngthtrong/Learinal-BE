#!/usr/bin/env node
/**
 * Fix Commission Status: Earned -> Pending
 * 
 * Script này sẽ:
 * 1. Tìm tất cả commission có status "Earned" (trạng thái cũ)
 * 2. Chuyển chúng thành "Pending" (trạng thái mới - chờ thanh toán)
 * 3. Báo cáo kết quả
 */

require('dotenv').config();
const mongoose = require('mongoose');
const env = require('../src/config/env');

async function fixCommissionStatus() {
  try {
    console.log('🔧 Fix Commission Status: Earned -> Pending\n');
    console.log('Connecting to MongoDB...');
    
    await mongoose.connect(env.mongoUri, {
      dbName: env.mongoDbName,
      serverSelectionTimeoutMS: 5000
    });
    
    console.log('✅ Connected to MongoDB\n');

    const CommissionRecord = require('../src/models/commissionRecord.model');

    // 1. Kiểm tra tổng quan
    console.log('📊 Current Commission Status Overview:');
    console.log('─'.repeat(80));
    
    const allCommissions = await CommissionRecord.find({}).lean();
    const statusCounts = allCommissions.reduce((acc, c) => {
      acc[c.status] = (acc[c.status] || 0) + 1;
      return acc;
    }, {});
    
    console.log('Total commissions:', allCommissions.length);
    Object.entries(statusCounts).forEach(([status, count]) => {
      console.log(`  ${status}: ${count}`);
    });
    console.log();

    // 2. Tìm các commission có status "Earned"
    console.log('🔍 Finding commissions with "Earned" status...');
    const earnedCommissions = await CommissionRecord.find({ status: 'Earned' }).lean();
    
    if (earnedCommissions.length === 0) {
      console.log('✅ No commissions found with "Earned" status. All good!');
      console.log('\n📝 Note: Current valid statuses are: Pending, Paid, Cancelled');
      return;
    }

    console.log(`Found ${earnedCommissions.length} commissions with "Earned" status\n`);

    // 3. Hiển thị chi tiết
    console.log('📋 Details of commissions to be fixed:');
    console.log('─'.repeat(80));
    
    const User = require('../src/models/user.model');
    const QuestionSet = require('../src/models/questionSet.model');
    
    for (const comm of earnedCommissions.slice(0, 10)) {
      const expert = await User.findById(comm.expertId).select('fullName').lean();
      const set = await QuestionSet.findById(comm.setId).select('title').lean();
      
      console.log(`ID: ${comm._id}`);
      console.log(`  Expert: ${expert?.fullName || 'Unknown'} (${comm.expertId})`);
      console.log(`  Type: ${comm.type}`);
      console.log(`  Amount: ${comm.commissionAmount}₫ (Fixed: ${comm.fixedAmount}₫, Bonus: ${comm.bonusAmount}₫)`);
      console.log(`  Set: ${set?.title || 'Unknown'}`);
      console.log(`  Created: ${new Date(comm.createdAt).toLocaleString('vi-VN')}`);
      console.log(`  Premium: ${comm.isPremiumAttempt ? 'Yes' : 'No'}`);
      console.log();
    }
    
    if (earnedCommissions.length > 10) {
      console.log(`... and ${earnedCommissions.length - 10} more\n`);
    }

    // 4. Xác nhận
    console.log('⚠️  CONFIRMATION REQUIRED');
    console.log('─'.repeat(80));
    console.log(`This will update ${earnedCommissions.length} commission records from "Earned" to "Pending"`);
    console.log('Type "yes" to continue or anything else to cancel:');
    
    const readline = require('readline').createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    const answer = await new Promise((resolve) => {
      readline.question('> ', resolve);
    });
    readline.close();
    
    if (answer.toLowerCase() !== 'yes') {
      console.log('\n❌ Operation cancelled by user');
      return;
    }

    // 5. Thực hiện update
    console.log('\n🔄 Updating commission status...');
    
    const updateResult = await CommissionRecord.updateMany(
      { status: 'Earned' },
      { 
        $set: { 
          status: 'Pending',
          updatedAt: new Date()
        } 
      }
    );
    
    console.log(`✅ Updated ${updateResult.modifiedCount} commission records`);
    console.log(`   Matched: ${updateResult.matchedCount}`);
    console.log(`   Modified: ${updateResult.modifiedCount}`);

    // 6. Verify kết quả
    console.log('\n🔍 Verifying results...');
    const remainingEarned = await CommissionRecord.countDocuments({ status: 'Earned' });
    
    if (remainingEarned === 0) {
      console.log('✅ All "Earned" commissions have been successfully converted to "Pending"');
    } else {
      console.log(`⚠️  Warning: Still found ${remainingEarned} commissions with "Earned" status`);
    }

    // 7. Tổng kết sau khi fix
    console.log('\n📊 Final Status Overview:');
    console.log('─'.repeat(80));
    
    const finalCommissions = await CommissionRecord.find({}).lean();
    const finalStatusCounts = finalCommissions.reduce((acc, c) => {
      acc[c.status] = (acc[c.status] || 0) + 1;
      return acc;
    }, {});
    
    console.log('Total commissions:', finalCommissions.length);
    Object.entries(finalStatusCounts).forEach(([status, count]) => {
      console.log(`  ${status}: ${count}`);
    });

    // 8. Tính tổng số tiền theo status
    console.log('\n💰 Commission Amounts by Status:');
    console.log('─'.repeat(80));
    
    const amountByStatus = finalCommissions.reduce((acc, c) => {
      if (!acc[c.status]) {
        acc[c.status] = { count: 0, total: 0, fixed: 0, bonus: 0 };
      }
      acc[c.status].count++;
      acc[c.status].total += c.commissionAmount || 0;
      acc[c.status].fixed += c.fixedAmount || 0;
      acc[c.status].bonus += c.bonusAmount || 0;
      return acc;
    }, {});
    
    Object.entries(amountByStatus).forEach(([status, data]) => {
      console.log(`\n${status}:`);
      console.log(`  Count: ${data.count}`);
      console.log(`  Total: ${data.total.toLocaleString('vi-VN')}₫`);
      console.log(`  Fixed: ${data.fixed.toLocaleString('vi-VN')}₫`);
      console.log(`  Bonus: ${data.bonus.toLocaleString('vi-VN')}₫`);
    });

    console.log('\n✅ Commission status fix completed successfully!');
    console.log('\n📝 Summary:');
    console.log(`   - Converted ${updateResult.modifiedCount} records from "Earned" to "Pending"`);
    console.log(`   - All commissions now have valid status (Pending/Paid/Cancelled)`);
    console.log(`   - Ready for payment processing`);

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from MongoDB');
  }
}

// Run if called directly
if (require.main === module) {
  fixCommissionStatus();
}

module.exports = fixCommissionStatus;
