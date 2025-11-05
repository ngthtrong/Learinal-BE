const { Queue } = require('bullmq');
const { getIORedis } = require('../config/redis');
const logger = require('../utils/logger');

function createQueue(name) {
  const connection = getIORedis();
  if (!connection) {
    logger.warn({ queueName: name }, 'Cannot create queue - Redis connection not available');
    return null;
  }
  logger.info({ queueName: name }, 'Queue created successfully');
  return new Queue(name, { connection });
}

const queues = {
  documentsIngestion: null,
  contentSummary: null,
  questionsGenerate: null,
  emailNotifications: null,
};

function ensureQueues() {
  if (!queues.documentsIngestion) queues.documentsIngestion = createQueue('documentsIngestion');
  if (!queues.contentSummary) queues.contentSummary = createQueue('contentSummary');
  if (!queues.questionsGenerate) queues.questionsGenerate = createQueue('questionsGenerate');
  if (!queues.emailNotifications) queues.emailNotifications = createQueue('emailNotifications');
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
  logger.info({ payload }, 'Enqueuing question generation');
  await queues.questionsGenerate.add('generate', payload, { attempts: 3, backoff: { type: 'exponential', delay: 500 } });
  logger.info({ questionSetId: payload.questionSetId }, 'Question generation enqueued successfully');
}

async function enqueueEmail(payload) {
  ensureQueues();
  if (!queues.emailNotifications) {
    logger.error('Email queue not available - Redis connection missing');
    // If queue not available, throw error to let caller handle it
    throw new Error('Email queue not available (missing REDIS_URL)');
  }
  logger.info({ to: payload.to, subject: payload.subject }, 'Enqueuing email');
  await queues.emailNotifications.add('sendEmail', payload, { 
    attempts: 3, 
    backoff: { type: 'exponential', delay: 1000 } 
  });
  logger.info({ to: payload.to }, 'Email enqueued successfully');
}

module.exports = {
  enqueueDocumentIngestion,
  enqueueContentSummary,
  enqueueQuestionsGenerate,
  enqueueEmail,
};
