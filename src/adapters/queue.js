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
  notificationsEmail: null,
  reviewAssigned: null,
  reviewCompleted: null,
};

function ensureQueues() {
  if (!queues.documentsIngestion) queues.documentsIngestion = createQueue('documentsIngestion');
  if (!queues.contentSummary) queues.contentSummary = createQueue('contentSummary');
  if (!queues.questionsGenerate) queues.questionsGenerate = createQueue('questionsGenerate');
  if (!queues.notificationsEmail) queues.notificationsEmail = createQueue('notificationsEmail');
  if (!queues.reviewAssigned) queues.reviewAssigned = createQueue('reviewAssigned');
  if (!queues.reviewCompleted) queues.reviewCompleted = createQueue('reviewCompleted');
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

async function enqueueNotificationsEmail(payload) {
  ensureQueues();
  if (!queues.notificationsEmail) throw new Error('Queue not available (missing REDIS_URL)');
  await queues.notificationsEmail.add('email', payload, { attempts: 3, backoff: { type: 'exponential', delay: 1000 } });
}

async function enqueueReviewAssigned(payload) {
  ensureQueues();
  if (!queues.reviewAssigned) throw new Error('Queue not available (missing REDIS_URL)');
  await queues.reviewAssigned.add('assigned', payload, { attempts: 2, backoff: { type: 'exponential', delay: 1000 } });
}

async function enqueueReviewCompleted(payload) {
  ensureQueues();
  if (!queues.reviewCompleted) throw new Error('Queue not available (missing REDIS_URL)');
  await queues.reviewCompleted.add('completed', payload, { attempts: 2, backoff: { type: 'exponential', delay: 1000 } });
}

module.exports = {
  enqueueDocumentIngestion,
  enqueueContentSummary,
  enqueueQuestionsGenerate,
  enqueueNotificationsEmail,
  enqueueReviewAssigned,
  enqueueReviewCompleted,
};
