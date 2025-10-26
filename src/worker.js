// Background worker to process BullMQ queues
const { Worker } = require('bullmq');
const { getIORedis } = require('./config/redis');
const ingestionHandler = require('./jobs/document.ingestion');
const summaryHandler = require('./jobs/content.summary');
const questionsHandler = require('./jobs/questions.generate');

const connection = getIORedis();
if (!connection) {
  // eslint-disable-next-line no-console
  console.error('REDIS_URL is not set. Worker cannot start.');
  process.exit(1);
}

function startWorker(name, processor) {
  const w = new Worker(name, async (job) => processor(job.data), { connection });
  w.on('completed', (job) => console.log(`[${name}] completed id=${job.id}`));
  w.on('failed', (job, err) => console.error(`[${name}] failed id=${job?.id}`, err));
  return w;
}

startWorker('documentsIngestion', ingestionHandler);
startWorker('contentSummary', summaryHandler);
startWorker('questionsGenerate', questionsHandler);

console.log('Workers started for queues: documentsIngestion, contentSummary, questionsGenerate');
