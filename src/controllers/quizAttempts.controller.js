const QuizAttemptsService = require('../services/quizAttempts.service');

const service = new QuizAttemptsService();

/**
 * QuizAttemptsController - HTTP handlers for quiz attempts endpoints
 * Delegates business logic to QuizAttemptsService
 */
module.exports = {
  /**
   * POST /quiz-attempts/start
   * Start a new quiz attempt
   */
  startAttempt: async (req, res, next) => {
    try {
      const user = req.user;
      const { setId } = req.body || {};

      if (!setId) {
        return res.status(400).json({
          code: 'ValidationError',
          message: 'setId is required',
        });
      }

      const attempt = await service.startAttempt(user.id, setId);
      return res.status(201).json(attempt);
    } catch (error) {
      next(error);
    }
  },

  /**
   * POST /quiz-attempts/:id/submit
   * Submit quiz answers and calculate score
   */
  submitAttempt: async (req, res, next) => {
    try {
      const user = req.user;
      const attemptId = req.params.id;
      const { answers } = req.body || {};

      if (!answers || !Array.isArray(answers)) {
        return res.status(400).json({
          code: 'ValidationError',
          message: 'answers array is required',
        });
      }

      const result = await service.submitAttempt(user.id, attemptId, { answers });
      return res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  },

  /**
   * GET /quiz-attempts/:id
   * Get quiz attempt details
   */
  getAttempt: async (req, res, next) => {
    try {
      const user = req.user;
      const attemptId = req.params.id;

      const attempt = await service.getById(user.id, attemptId);
      return res.status(200).json(attempt);
    } catch (error) {
      next(error);
    }
  },

  /**
   * GET /quiz-attempts
   * List quiz attempts for current user with pagination
   * Query: page, pageSize, sort, setId
   */
  listAttempts: async (req, res, next) => {
    try {
      const user = req.user;
      const { page, pageSize, sort, setId } = req.query;

      const options = {
        page: parseInt(page, 10) || 1,
        pageSize: parseInt(pageSize, 10) || 20,
        sort: sort || '-endTime',
        setId: setId || undefined,
      };

      const { items, meta } = await service.listByUser(user.id, options);
      return res.status(200).json({ items, meta });
    } catch (error) {
      next(error);
    }
  },
};

