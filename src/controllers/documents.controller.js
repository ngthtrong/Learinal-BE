const DocumentsService = require('../services/documents.service');
const { enqueueDocumentIngestion } = require('../adapters/queue');
const logger = require('../utils/logger');

const service = new DocumentsService();

/**
 * DocumentsController - HTTP handlers for /documents endpoints
 * Handles multipart file upload and document lifecycle
 */
module.exports = {
  /**
   * POST /documents - Upload document to a subject
   * Multipart form-data: file (required), subjectId (required)
   */
  create: async (req, res, next) => {
    try {
      const userId = req.user.id;
      const subjectId = req.body.subjectId;

      // Validate file presence (middleware should handle multipart parsing)
      if (!req.file) {
        return res.status(400).json({
          code: 'ValidationError',
          message: 'No file provided',
        });
      }

      // Validate subjectId
      if (!subjectId) {
        return res.status(400).json({
          code: 'ValidationError',
          message: 'subjectId is required',
        });
      }

      // Upload document via service
      const document = await service.upload(userId, subjectId, req.file);

      // Trigger background ingestion job
      const useQueue = process.env.USE_QUEUE === 'true' && !!process.env.REDIS_URL;
      const jobPayload = { documentId: document.id };

      try {
        if (useQueue) {
          await enqueueDocumentIngestion(jobPayload);
          logger.info({ documentId: document.id }, 'Document ingestion job enqueued');
        } else {
          // Fallback: inline processing (for dev/local mode)
          const jobs = require('../jobs');
          setTimeout(() => {
            jobs.documentIngestion(jobPayload).catch((err) => {
              logger.error({ documentId: document.id, error: err.message }, 'Inline ingestion failed');
            });
          }, 100);
          logger.info({ documentId: document.id }, 'Document ingestion scheduled inline');
        }
      } catch (err) {
        logger.warn({ documentId: document.id, error: err.message }, 'Failed to enqueue job, will retry');
      }

      return res.status(201).json(document);
    } catch (e) {
      next(e);
    }
  },

  /**
   * GET /documents/:id - Get document by ID
   */
  get: async (req, res, next) => {
    try {
      const userId = req.user.id;
      const documentId = req.params.id;

      const document = await service.getById(userId, documentId);
      return res.status(200).json(document);
    } catch (e) {
      next(e);
    }
  },

  /**
   * GET /documents/:id/summary - Get document summary
   */
  summary: async (req, res, next) => {
    try {
      const userId = req.user.id;
      const documentId = req.params.id;

      const summary = await service.getSummary(userId, documentId);
      return res.status(200).json(summary);
    } catch (e) {
      next(e);
    }
  },

  /**
   * GET /documents?subjectId=xxx - List documents by subject
   */
  list: async (req, res, next) => {
    try {
      const userId = req.user.id;
      const subjectId = req.query.subjectId;

      if (!subjectId) {
        return res.status(400).json({
          code: 'ValidationError',
          message: 'subjectId query parameter is required',
        });
      }

      const page = Math.max(1, parseInt(req.query.page || '1', 10));
      const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize || '20', 10)));
      const sort = req.query.sort || '-uploadedAt';

      const result = await service.listBySubject(userId, subjectId, { page, pageSize, sort });
      return res.status(200).json(result);
    } catch (e) {
      next(e);
    }
  },

  /**
   * DELETE /documents/:id - Delete document
   */
  remove: async (req, res, next) => {
    try {
      const userId = req.user.id;
      const documentId = req.params.id;

      await service.remove(userId, documentId);
      return res.status(204).send();
    } catch (e) {
      next(e);
    }
  },
};
