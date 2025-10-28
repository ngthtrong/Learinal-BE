const QuestionSetsService = require('../services/questionSets.service');
const ValidationRequestsService = require('../services/validationRequests.service');
const { enqueueQuestionsGenerate } = require('../adapters/queue');
const logger = require('../utils/logger');

const service = new QuestionSetsService();
const validationService = new ValidationRequestsService();

/**
 * QuestionSetsController - HTTP handlers for /question-sets endpoints
 * Handles CRUD operations and question generation
 */
module.exports = {
  /**
   * GET /question-sets - List question sets for authenticated user
   * Query params: page, pageSize, sort, status, subjectId
   */
  list: async (req, res, next) => {
    try {
      const userId = req.user.id;
      const page = Math.max(1, parseInt(req.query.page || '1', 10));
      const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize || '20', 10)));
      const sort = req.query.sort || '-createdAt';
      const status = req.query.status;
      const subjectId = req.query.subjectId;

      const result = await service.listByUser(userId, {
        page,
        pageSize,
        sort,
        status,
        subjectId,
      });

      return res.status(200).json(result);
    } catch (e) {
      next(e);
    }
  },

  /**
   * POST /question-sets/generate - Generate new question set
   * Body: { subjectId, title, numQuestions?, difficulty?, documentIds? }
   */
  generate: async (req, res, next) => {
    try {
      const userId = req.user.id;
      const payload = {
        subjectId: req.body.subjectId,
        title: req.body.title,
        numQuestions: req.body.numQuestions || 10,
        difficulty: req.body.difficulty || 'Hiểu',
        documentIds: req.body.documentIds || [],
      };

      const questionSet = await service.generate(userId, payload);

      // Optionally trigger background regeneration if needed
      // (Currently generation happens inline, but can be moved to queue)
      const useQueue = process.env.USE_QUEUE === 'true' && !!process.env.REDIS_URL;
      if (useQueue && questionSet.questions.length === 0) {
        try {
          await enqueueQuestionsGenerate({
            questionSetId: questionSet.id,
            numQuestions: payload.numQuestions,
            difficulty: payload.difficulty,
          });
          logger.info({ questionSetId: questionSet.id }, 'Question generation job enqueued');
        } catch (err) {
          logger.warn({ error: err.message }, 'Failed to enqueue question generation');
        }
      }

      return res.status(201).json(questionSet);
    } catch (e) {
      next(e);
    }
  },

  /**
   * GET /question-sets/:id - Get question set by ID
   */
  get: async (req, res, next) => {
    try {
      const userId = req.user.id;
      const questionSetId = req.params.id;

      const questionSet = await service.getById(userId, questionSetId);
      return res.status(200).json(questionSet);
    } catch (e) {
      next(e);
    }
  },

  /**
   * PATCH /question-sets/:id - Update question set
   * Body: { title?, status?, questions? }
   */
  update: async (req, res, next) => {
    try {
      const userId = req.user.id;
      const questionSetId = req.params.id;

      const updated = await service.update(userId, questionSetId, req.body);
      return res.status(200).json(updated);
    } catch (e) {
      next(e);
    }
  },

  /**
   * DELETE /question-sets/:id - Delete question set
   */
  remove: async (req, res, next) => {
    try {
      const userId = req.user.id;
      const questionSetId = req.params.id;

      await service.remove(userId, questionSetId);
      return res.status(204).send();
    } catch (e) {
      next(e);
    }
  },

  /**
   * POST /question-sets/:id/share - Generate shared URL
   */
  share: async (req, res, next) => {
    try {
      const userId = req.user.id;
      const questionSetId = req.params.id;

      const questionSet = await service.share(userId, questionSetId);
      return res.status(200).json(questionSet);
    } catch (e) {
      next(e);
    }
  },

  /**
   * POST /question-sets/:id/review - Request validation review
   * Creates a validation request for Expert review
   */
  requestReview: async (req, res, next) => {
    try {
      const userId = req.user.id;
      const questionSetId = req.params.id;

      // Create validation request via validationService
      const validationRequest = await validationService.createRequest(userId, questionSetId);

      logger.info(
        { validationRequestId: validationRequest.id, questionSetId, userId },
        '[QuestionSets] Validation review requested'
      );

      return res.status(202).json(validationRequest);
    } catch (e) {
      next(e);
    }
  },
};
