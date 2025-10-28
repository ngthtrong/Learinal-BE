const SubjectsService = require('../services/subjects.service');
const service = new SubjectsService();

/**
 * SubjectsController - HTTP handlers for /subjects endpoints
 * All endpoints require authentication via JWT
 */
module.exports = {
  /**
   * GET /subjects - List all subjects for authenticated user
   * Query params: page, pageSize, sort (e.g., "-createdAt", "subjectName")
   */
  list: async (req, res, next) => {
    try {
      const userId = req.user.id;
      const page = Math.max(1, parseInt(req.query.page || '1', 10));
      const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize || '20', 10)));
      const sort = req.query.sort || '-createdAt';

      const result = await service.listByUser(userId, { page, pageSize, sort });
      
      // Response envelope: { items, meta }
      res.status(200).json(result);
    } catch (e) {
      next(e);
    }
  },

  /**
   * POST /subjects - Create new subject
   * Body: { subjectName, description?, tableOfContents?, summary? }
   */
  create: async (req, res, next) => {
    try {
      const userId = req.user.id;
      const created = await service.create(userId, req.body);
      res.status(201).json(created);
    } catch (e) {
      next(e);
    }
  },

  /**
   * GET /subjects/:id - Get subject by ID (ownership check)
   */
  get: async (req, res, next) => {
    try {
      const userId = req.user.id;
      const subjectId = req.params.id;
      
      const item = await service.getByIdOwned(userId, subjectId);
      res.status(200).json(item);
    } catch (e) {
      next(e);
    }
  },

  /**
   * PATCH /subjects/:id - Update subject (ownership check)
   * Body: { subjectName?, description?, tableOfContents?, summary? }
   */
  update: async (req, res, next) => {
    try {
      const userId = req.user.id;
      const subjectId = req.params.id;
      
      const updated = await service.updateOwned(userId, subjectId, req.body);
      res.status(200).json(updated);
    } catch (e) {
      next(e);
    }
  },

  /**
   * DELETE /subjects/:id - Delete subject (ownership check)
   */
  remove: async (req, res, next) => {
    try {
      const userId = req.user.id;
      const subjectId = req.params.id;
      
      await service.removeOwned(userId, subjectId);
      res.status(204).send();
    } catch (e) {
      next(e);
    }
  },
};
