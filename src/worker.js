// Load environment variables first
require("dotenv").config();

// Background worker to process BullMQ queues
const { Worker } = require("bullmq");
const { getIORedis } = require("./config/redis");
const { env, mongoose: mongooseCfg } = require("./config");
const ingestionHandler = require("./jobs/document.ingestion");
const summaryHandler = require("./jobs/content.summary");
const questionsHandler = require("./jobs/questions.generate");
const emailHandler = require("./jobs/email.send");
const logger = require("./utils/logger");

const connection = getIORedis();
if (!connection) {
  logger.error("REDIS_URL is not set. Worker cannot start.");
  process.exit(1);
}

function startWorker(name, processor) {
  const w = new Worker(name, async (job) => processor(job.data), { connection });
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

    logger.info("Workers started for queues: documentsIngestion, contentSummary, questionsGenerate, emailNotifications");
  } catch (err) {
    logger.error({ err }, "Failed to start workers");
    process.exit(1);
  }
}

// Start workers
startWorkers();
