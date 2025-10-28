// Background worker to process BullMQ queues
const { Worker } = require("bullmq");
const { getIORedis } = require("./config/redis");
const ingestionHandler = require("./jobs/document.ingestion");
const summaryHandler = require("./jobs/content.summary");
const questionsHandler = require("./jobs/questions.generate");
const emailHandler = require("./jobs/notifications.email");
const reviewAssignedHandler = require("./jobs/review.assigned");
const reviewCompletedHandler = require("./jobs/review.completed");
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

startWorker("documentsIngestion", ingestionHandler);
startWorker("contentSummary", summaryHandler);
startWorker("questionsGenerate", questionsHandler);
startWorker("notificationsEmail", emailHandler);
startWorker("reviewAssigned", reviewAssignedHandler);
startWorker("reviewCompleted", reviewCompletedHandler);

logger.info("Workers started for all queues: documents, content, questions, notifications, review events");
