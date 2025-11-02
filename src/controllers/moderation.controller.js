const ModerationService = require('../services/moderation.service');

const moderationService = new ModerationService({});

module.exports = {
  /**
   * POST /moderation/flag
   * Flag content for review
   */
  flagContent: async (req, res, next) => {
    try {
      const { contentType, contentId, reason, description } = req.body;
      const reportedBy = req.user.userId;

      const flag = await moderationService.flagContent({
        contentType,
        contentId,
        reportedBy,
        reason,
        description,
      });

      res.status(201).json(flag);
    } catch (e) {
      next(e);
    }
  },

  /**
   * GET /admin/moderation/flags
   * List all flags (Admin only)
   */
  listFlags: async (req, res, next) => {
    try {
      const { page, pageSize, status, contentType } = req.query;

      const result = await moderationService.listFlags({
        page: parseInt(page) || 1,
        pageSize: parseInt(pageSize) || 20,
        status,
        contentType,
      });

      res.json(result);
    } catch (e) {
      next(e);
    }
  },

  /**
   * PATCH /admin/moderation/flags/:id/review
   * Review and resolve a flag
   */
  reviewFlag: async (req, res, next) => {
    try {
      const { action, notes } = req.body;
      const reviewedBy = req.user.userId;

      const flag = await moderationService.reviewFlag(req.params.id, {
        reviewedBy,
        action,
        notes,
      });

      res.json(flag);
    } catch (e) {
      next(e);
    }
  },

  /**
   * PATCH /admin/moderation/flags/:id/dismiss
   * Dismiss a flag
   */
  dismissFlag: async (req, res, next) => {
    try {
      const { notes } = req.body;
      const reviewedBy = req.user.userId;

      const flag = await moderationService.dismissFlag(
        req.params.id,
        reviewedBy,
        notes
      );

      res.json(flag);
    } catch (e) {
      next(e);
    }
  },
};
