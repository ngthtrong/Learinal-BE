/**
 * Seed script: Create initial subscription plans
 * Run: node scripts/seed-subscription-plans.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const mongoConfig = require('../src/config/mongo');
const SubscriptionPlan = require('../src/models/subscriptionPlan.model');

const plans = [
  {
    planName: 'Standard',
    description: 'Perfect for individual learners',
    billingCycle: 'Monthly',
    price: 2000, // 2000đ
    entitlements: {
      maxMonthlyTestGenerations: 10,
      maxValidationRequests: 5,
      priorityProcessing: false,
      shareLimits: {
        canShare: true,
        maxSharedUsers: 3,
      },
      maxSubjects: 5,
    },
    status: 'Active',
  },
  {
    planName: 'Pro',
    description: 'For power users and educators',
    billingCycle: 'Monthly',
    price: 5000, // 5000đ
    entitlements: {
      maxMonthlyTestGenerations: 50,
      maxValidationRequests: 20,
      priorityProcessing: true,
      shareLimits: {
        canShare: true,
        maxSharedUsers: 10,
      },
      maxSubjects: -1, // unlimited
    },
    status: 'Active',
  },
];

async function seed() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(mongoConfig.uri, mongoConfig.options);
    console.log('Connected to MongoDB');

    console.log('Clearing existing plans...');
    await SubscriptionPlan.deleteMany({});

    console.log('Creating subscription plans...');
    const created = await SubscriptionPlan.insertMany(plans);
    
    console.log(`✓ Created ${created.length} subscription plans:`);
    created.forEach((plan) => {
      console.log(`  - ${plan.planName}: ${plan.price}đ (${plan.entitlements.maxMonthlyTestGenerations} tests/month)`);
    });

    console.log('\nSeed completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Seed failed:', error);
    process.exit(1);
  }
}

seed();
