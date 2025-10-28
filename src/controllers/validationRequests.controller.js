const ValidationRequestsService = require('../services/validationRequests.service');

const service = new ValidationRequestsService();

/**
 * ValidationRequestsController - HTTP handlers for validation workflow
 * Delegates business logic to ValidationRequestsService
 */
module.exports = {
  /**
   * POST /validation-requests
   * Create validation request (Learner)
   */
  createRequest: async (req, res, next) => {
    try {
      const user = req.user;
      const { setId } = req.body || {};

      if (!setId) {
        return res.status(400).json({
          code: 'ValidationError',
          message: 'setId is required',
        });
      }

      const request = await service.createRequest(user.id, setId);
      return res.status(201).json(request);
    } catch (error) {
      next(error);
    }
  },

  /**
   * POST /validation-requests/:id/assign
   * Assign expert to validation request (Admin only)
   */
  assignExpert: async (req, res, next) => {
    try {
      const admin = req.user;
      const requestId = req.params.id;
      const { expertId } = req.body || {};

      if (!expertId) {
        return res.status(400).json({
          code: 'ValidationError',
          message: 'expertId is required',
        });
      }

      const request = await service.assignExpert(admin.id, requestId, expertId);
      return res.status(200).json(request);
    } catch (error) {
      next(error);
    }
  },

  /**
   * POST /validation-requests/:id/complete
   * Complete validation review (Expert only)
   */
  completeReview: async (req, res, next) => {
    try {
      const expert = req.user;
      const requestId = req.params.id;
      const { approved, feedback } = req.body || {};

      if (typeof approved !== 'boolean') {
        return res.status(400).json({
          code: 'ValidationError',
          message: 'approved (boolean) is required',
        });
      }

      const result = await service.completeReview(expert.id, requestId, {
        approved,
        feedback,
      });
      return res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  },

  /**
   * GET /validation-requests/:id
   * Get validation request details
   */
  getRequest: async (req, res, next) => {
    try {
      const user = req.user;
      const requestId = req.params.id;

      const request = await service.getById(requestId, user);
      return res.status(200).json(request);
    } catch (error) {
      next(error);
    }
  },

  /**
   * GET /validation-requests
   * List validation requests with role-based filtering
   * Query: page, pageSize, status
   */
  listRequests: async (req, res, next) => {
    try {
      const user = req.user;
      const { page, pageSize, status } = req.query;

      const options = {
        page: parseInt(page, 10) || 1,
        pageSize: parseInt(pageSize, 10) || 20,
        status: status || undefined,
      };

      const { items, meta } = await service.list(user, options);
      return res.status(200).json({ items, meta });
    } catch (error) {
      next(error);
    }
  },
};
