// Load environment variables first
require("dotenv").config();

// Background worker to process BullMQ queues
const { Worker } = require("bullmq");
const cron = require("node-cron");
const { getIORedis } = require("./config/redis");
const { env, mongoose: mongooseCfg } = require("./config");
const ingestionHandler = require("./jobs/document.ingestion");
const summaryHandler = require("./jobs/content.summary");
const questionsHandler = require("./jobs/questions.generate");
const emailHandler = require("./jobs/email.send");
const subscriptionExpirationHandler = require("./jobs/subscription.expiration");
const subscriptionRenewalReminderHandler = require("./jobs/subscription.renewal-reminder");
const logger = require("./utils/logger");

const connection = getIORedis();
if (!connection) {
  logger.error("REDIS_URL is not set. Worker cannot start.");
  process.exit(1);
}

function startWorker(name, processor) {
  const w = new Worker(name, async (job) => processor(job.data), {
    connection,
    concurrency: name === "questionsGenerate" ? 2 : 1, // Allow 2 concurrent question generation jobs
  });
  w.on("completed", (job) => logger.info({ queue: name, id: job.id }, "job completed"));
  w.on("failed", (job, err) => logger.error({ queue: name, id: job?.id, err }, "job failed"));
  return w;
}

async function startWorkers() {
  try {
    // Connect to MongoDB before starting workers
    if ((process.env.DB_MODE || env.dbMode) !== "memory") {
      await mongooseCfg.connectMongoose(env.mongoUri, env.mongoDbName);
      logger.info({ db: env.mongoDbName }, "Worker connected to MongoDB");
    } else {
      logger.info("DB_MODE=memory: skipping MongoDB connection");
    }

    // Start all workers
    startWorker("documentsIngestion", ingestionHandler);
    startWorker("contentSummary", summaryHandler);
    startWorker("questionsGenerate", questionsHandler);
    startWorker("emailNotifications", emailHandler);

    logger.info(
      "Workers started for queues: documentsIngestion, contentSummary, questionsGenerate, emailNotifications"
    );

    // Schedule cron jobs
    const { createRepositories } = require("./repositories");
    const repositories = createRepositories();

    // Run subscription expiration check daily at midnight (0 0 * * *)
    cron.schedule("0 0 * * *", async () => {
      try {
        logger.info("[Cron] Running subscription expiration check");
        await subscriptionExpirationHandler({
          userSubscriptionsRepository: repositories.userSubscriptionsRepository,
        });
      } catch (error) {
        logger.error({ error }, "[Cron] Subscription expiration check failed");
      }
    });

    // Run renewal reminder check daily at 9 AM (0 9 * * *)
    cron.schedule("0 9 * * *", async () => {
      try {
        logger.info("[Cron] Running subscription renewal reminder check");
        await subscriptionRenewalReminderHandler({
          userSubscriptionsRepository: repositories.userSubscriptionsRepository,
        });
      } catch (error) {
        logger.error({ error }, "[Cron] Subscription renewal reminder check failed");
      }
    });

    // Cleanup old usage tracking data daily at 2 AM (0 2 * * *)
    cron.schedule("0 2 * * *", async () => {
      try {
        logger.info("[Cron] Running usage tracking cleanup");
        const twoMonthsAgo = new Date();
        twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2);

        const result = await repositories.usageTrackingRepository.deleteMany({
          timestamp: { $lt: twoMonthsAgo },
        });

        logger.info(
          { deletedCount: result.deletedCount },
          "[Cron] Usage tracking cleanup completed"
        );
      } catch (error) {
        logger.error({ error }, "[Cron] Usage tracking cleanup failed");
      }
    });

    logger.info(
      "Cron jobs scheduled: subscription expiration (daily at midnight), renewal reminders (daily at 9 AM), usage tracking cleanup (daily at 2 AM)"
    );
  } catch (err) {
    logger.error({ err }, "Failed to start workers");
    process.exit(1);
  }
}

// Start workers
startWorkers();
