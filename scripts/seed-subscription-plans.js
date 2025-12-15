/**
 * Seed script: Create initial subscription plans
 * Run: node scripts/seed-subscription-plans.js
 */

require("dotenv").config();
const mongoose = require("mongoose");
const env = require("../src/config/env");
const SubscriptionPlan = require("../src/models/subscriptionPlan.model");

const plans = [
  {
    planName: "Free",
    description: "Trải nghiệm cơ bản miễn phí",
    billingCycle: "Monthly",
    price: 0,
    entitlements: {
      // Commission max (marketing cost):
      // - Quiz: 15 × 300đ = 4,500đ
      // - Validation: 0 × 150đ = 0đ
      // Total: 4,500đ
      maxMonthlyTestGenerations: 2,
      maxMonthlyQuizAttempts: 15,
      maxValidationRequests: 0,
      priorityProcessing: false,
      canShare: false,
      maxSubjects: 2,
      maxDocumentsPerSubject: 3,
      maxFileSizeMB: 5,
    },
    status: "Active",
  },
  {
    planName: "Basic",
    description: "Phù hợp cho học sinh, sinh viên",
    billingCycle: "Monthly",
    price: 39000, // 39,000đ
    entitlements: {
      // Commission max:
      // - Quiz: 60 × 300đ = 18,000đ
      // - Validation: 5 × 150đ = 750đ
      // Total: 18,750đ / 39,000đ = 48% → Expert < 50% ✓
      maxMonthlyTestGenerations: 10,
      maxMonthlyQuizAttempts: 60,
      maxValidationRequests: 5,
      priorityProcessing: false,
      canShare: true,
      maxSubjects: 5,
      maxDocumentsPerSubject: 20,
      maxFileSizeMB: 15,
    },
    status: "Active",
  },
  {
    planName: "Premium",
    description: "Dành cho người dùng chuyên nghiệp",
    billingCycle: "Monthly",
    price: 69000, // 69,000đ
    entitlements: {
      // Commission max:
      // - Quiz: 100 × 300đ = 30,000đ (at threshold, no bonus)
      // - Validation: 15 × 150đ = 2,250đ
      // Total: 32,250đ / 69,000đ = 47% → Expert < 50% ✓
      maxMonthlyTestGenerations: 30,
      maxMonthlyQuizAttempts: 100,
      maxValidationRequests: 15,
      priorityProcessing: true,
      canShare: true,
      maxSubjects: 15,
      maxDocumentsPerSubject: 50,
      maxFileSizeMB: 30,
    },
    status: "Active",
  },
  {
    planName: "Unlimited",
    description: "Không giới hạn - Cho giáo viên và tổ chức",
    billingCycle: "Monthly",
    price: 149000, // 149,000đ
    entitlements: {
      // Commission max (practical use ~200 quiz):
      // - Quiz: 100×300 + 100×325 (fixed+bonus) = 62,500đ
      // - Validation: 50 × 150đ = 7,500đ
      // Total: 70,000đ / 149,000đ = 47% → Expert < 50% ✓
      maxMonthlyTestGenerations: -1, // unlimited
      maxMonthlyQuizAttempts: -1, // unlimited (practical cap ~200-300)
      maxValidationRequests: 50,
      priorityProcessing: true,
      canShare: true,
      maxSubjects: -1, // unlimited
      maxDocumentsPerSubject: -1, // unlimited
      maxFileSizeMB: 50,
    },
    status: "Active",
  },
];

async function seed() {
  try {
    console.log("Connecting to MongoDB...");
    await mongoose.connect(env.mongoUri, { dbName: env.mongoDbName });
    console.log("Connected to MongoDB");

    console.log("Clearing existing plans...");
    await SubscriptionPlan.deleteMany({});

    console.log("Creating subscription plans...");
    const created = await SubscriptionPlan.insertMany(plans);

    console.log(`✓ Created ${created.length} subscription plans:`);
    created.forEach((plan) => {
      console.log(
        `  - ${plan.planName}: ${plan.price}đ (${plan.entitlements.maxMonthlyTestGenerations} tests/month)`
      );
    });

    console.log("\nSeed completed successfully!");
    process.exit(0);
  } catch (error) {
    console.error("Seed failed:", error);
    process.exit(1);
  }
}

seed();
