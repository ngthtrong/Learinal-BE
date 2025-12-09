/**
 * Script to manually run subscription expiration job
 * Usage: node scripts/run-subscription-expiration.js
 */

require("dotenv").config();

const mongoose = require("mongoose");
const { env } = require("../src/config");
const { createRepositories } = require("../src/repositories");
const processSubscriptionExpiration = require("../src/jobs/subscription.expiration");

async function run() {
  try {
    console.log("Connecting to MongoDB...");
    await mongoose.connect(env.mongoUri, { dbName: env.mongoDbName });
    console.log("Connected to MongoDB:", env.mongoDbName);

    const repositories = createRepositories();

    console.log("\nRunning subscription expiration job...\n");
    await processSubscriptionExpiration({
      userSubscriptionsRepository: repositories.userSubscriptionsRepository,
    });

    console.log("\nJob completed successfully!");
  } catch (error) {
    console.error("Error running job:", error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log("Disconnected from MongoDB");
    process.exit(0);
  }
}

run();
