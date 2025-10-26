const { Queue } = require('bullmq');
const { getIORedis } = require('../config/redis');

function createQueue(name) {
  const connection = getIORedis();
  if (!connection) return null;
  return new Queue(name, { connection });
}

const queues = {
  documentsIngestion: null,
  contentSummary: null,
  questionsGenerate: null,
};

function ensureQueues() {
  if (!queues.documentsIngestion) queues.documentsIngestion = createQueue('documentsIngestion');
  if (!queues.contentSummary) queues.contentSummary = createQueue('contentSummary');
  if (!queues.questionsGenerate) queues.questionsGenerate = createQueue('questionsGenerate');
}

async function enqueueDocumentIngestion(payload) {
  ensureQueues();
  if (!queues.documentsIngestion) throw new Error('Queue not available (missing REDIS_URL)');
  await queues.documentsIngestion.add('ingest', payload, { attempts: 3, backoff: { type: 'exponential', delay: 500 } });
}

async function enqueueContentSummary(payload) {
  ensureQueues();
  if (!queues.contentSummary) throw new Error('Queue not available (missing REDIS_URL)');
  await queues.contentSummary.add('summarize', payload, { attempts: 3, backoff: { type: 'exponential', delay: 500 } });
}

async function enqueueQuestionsGenerate(payload) {
  ensureQueues();
  if (!queues.questionsGenerate) throw new Error('Queue not available (missing REDIS_URL)');
  await queues.questionsGenerate.add('generate', payload, { attempts: 3, backoff: { type: 'exponential', delay: 500 } });
}

module.exports = {
  enqueueDocumentIngestion,
  enqueueContentSummary,
  enqueueQuestionsGenerate,
};
