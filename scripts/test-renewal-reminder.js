require("dotenv").config();
const mongoose = require("mongoose");
const env = require("../src/config/env");
const emailConfig = require("../src/config/email");
const EmailClient = require("../src/adapters/emailClient");

// Repositories
const UserSubscription = require("../src/models/userSubscription.model");
const User = require("../src/models/user.model");
const SubscriptionPlan = require("../src/models/subscriptionPlan.model");

async function testRenewalReminder() {
  // Parse arguments
  let daysUntilExpiry = 5;
  let forceEmail = null;
  
  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith('--force-email=')) {
      forceEmail = arg.replace('--force-email=', '');
    } else if (!isNaN(parseInt(arg))) {
      daysUntilExpiry = parseInt(arg);
    }
  }
  
  console.log("==========================================");
  console.log("  TEST: Subscription Renewal Reminder");
  console.log("==========================================\n");

  try {
    // Connect to MongoDB
    console.log("Connecting to MongoDB...");
    await mongoose.connect(env.mongoUri, { dbName: env.mongoDbName });
    console.log("✓ Connected to MongoDB\n");

    // Initialize email client
    const emailClient = new EmailClient(emailConfig);
    console.log(`✓ Email client initialized (provider: ${emailConfig.provider})`);
    console.log(`  From address: ${emailConfig.fromAddress}\n`);

    // Force send mode
    if (forceEmail) {
      console.log(`Force sending to: ${forceEmail}\n`);
      
      const user = await User.findOne({ email: forceEmail }).lean();
      if (!user) {
        console.log(`✗ User not found: ${forceEmail}`);
        process.exit(1);
      }
      
      const subscription = await UserSubscription.findOne({ 
        userId: user._id, 
        status: 'Active' 
      }).lean();
      
      if (!subscription) {
        console.log(`✗ No active subscription for user`);
        process.exit(1);
      }
      
      const plan = await SubscriptionPlan.findById(subscription.planId).lean();
      
      console.log(`  User: ${user.fullName || user.email}`);
      console.log(`  Plan: ${plan?.planName || 'Unknown'}`);
      console.log(`  End Date: ${subscription.endDate}`);
      
      const endDate = new Date(subscription.endDate);
      const formattedEndDate = endDate.toLocaleDateString('vi-VN', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
      
      console.log(`\nSending email...`);
      
      await emailClient.sendTemplate({
        to: user.email,
        templateId: 'subscriptionExpiring',
        variables: {
          userName: user.fullName || user.email,
          planName: plan?.planName || 'Subscription',
          endDate: formattedEndDate,
          renewUrl: `${process.env.FRONTEND_URL || 'https://learinal.app'}/subscription`,
        },
      });
      
      console.log(`✓ Email sent successfully to ${user.email}!`);
      process.exit(0);
    }

    // Normal mode: find subscriptions expiring in X days
    console.log(`Looking for subscriptions expiring in ${daysUntilExpiry} days...\n`);

    // Calculate date range
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + daysUntilExpiry);
    targetDate.setHours(0, 0, 0, 0);
    
    const nextDay = new Date(targetDate);
    nextDay.setDate(nextDay.getDate() + 1);

    console.log(`Date range: ${targetDate.toISOString()} - ${nextDay.toISOString()}\n`);

    // Find expiring subscriptions
    const expiringSubscriptions = await UserSubscription.find({
      status: 'Active',
      endDate: {
        $gte: targetDate,
        $lt: nextDay,
      },
    });

    console.log(`Found ${expiringSubscriptions.length} subscription(s) expiring in ${daysUntilExpiry} days\n`);

    if (expiringSubscriptions.length === 0) {
      console.log("No subscriptions to process.\n");
      
      // Show some active subscriptions for reference
      const activeSubscriptions = await UserSubscription.find({ status: 'Active' })
        .limit(5)
        .lean();
      
      if (activeSubscriptions.length > 0) {
        console.log("Active subscriptions in database:");
        for (const sub of activeSubscriptions) {
          const user = await User.findById(sub.userId).lean();
          const plan = await SubscriptionPlan.findById(sub.planId).lean();
          const daysLeft = Math.ceil((new Date(sub.endDate) - new Date()) / (1000 * 60 * 60 * 24));
          console.log(`  - User: ${user?.email || sub.userId}`);
          console.log(`    Plan: ${plan?.planName || sub.planId}`);
          console.log(`    End Date: ${sub.endDate}`);
          console.log(`    Days until expiry: ${daysLeft}`);
          console.log(`    → To test: node scripts/test-renewal-reminder.js --force-email=${user?.email}`);
          console.log("");
        }
      }
      
      process.exit(0);
    }

    // Process each subscription
    for (const subscription of expiringSubscriptions) {
      console.log("----------------------------------------");
      console.log(`Processing subscription: ${subscription._id}`);
      
      const user = await User.findById(subscription.userId).lean();
      const plan = await SubscriptionPlan.findById(subscription.planId).lean();
      
      if (!user || !user.email) {
        console.log(`  ⚠ No email for user ${subscription.userId}`);
        continue;
      }

      if (!plan) {
        console.log(`  ⚠ No plan found for subscription`);
        continue;
      }

      console.log(`  User: ${user.fullName || user.email}`);
      console.log(`  Email: ${user.email}`);
      console.log(`  Plan: ${plan.planName}`);
      console.log(`  End Date: ${subscription.endDate}`);

      // Format end date
      const endDate = new Date(subscription.endDate);
      const formattedEndDate = endDate.toLocaleDateString('vi-VN', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });

      // Confirm before sending
      const readline = require('readline');
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      });

      const answer = await new Promise((resolve) => {
        rl.question(`\n  Send email to ${user.email}? (y/n): `, resolve);
      });
      rl.close();

      if (answer.toLowerCase() !== 'y') {
        console.log("  Skipped.\n");
        continue;
      }

      try {
        await emailClient.sendTemplate({
          to: user.email,
          templateId: 'subscriptionExpiring',
          variables: {
            userName: user.fullName || user.email,
            planName: plan.planName,
            endDate: formattedEndDate,
            renewUrl: `${process.env.FRONTEND_URL || 'https://learinal.app'}/subscription`,
          },
        });
        
        console.log(`  ✓ Email sent successfully!\n`);
      } catch (error) {
        console.error(`  ✗ Failed to send email: ${error.message}\n`);
      }
    }

    console.log("==========================================");
    console.log("  Test completed!");
    console.log("==========================================");
    
    process.exit(0);
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
}

testRenewalReminder();
