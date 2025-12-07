const ContentFlagsRepository = require('../repositories/contentFlags.repository');
const QuestionSetsRepository = require('../repositories/questionSets.repository');
const UsersRepository = require('../repositories/users.repository');
const logger = require('../utils/logger');

const repo = new ContentFlagsRepository();
const questionSetsRepo = new QuestionSetsRepository();
const usersRepo = new UsersRepository();

function mapId(doc) {
  if (!doc) return doc;
  const { _id, __v, ...rest } = doc;
  return { id: String(_id || rest.id), ...rest };
}

module.exports = {
  // POST /content-flags - User reports content
  create: async (req, res, next) => {
    try {
      const user = req.user;
      const { contentType, contentId, reason, description } = req.body;

      // Debug logging
      logger.info({ body: req.body, user: { id: user.id, email: user.email } }, 'Creating content flag');

      if (!contentType || !contentId || !reason) {
        logger.warn({ contentType, contentId, reason }, 'Validation failed');
        return res.status(400).json({
          code: 'ValidationError',
          message: 'contentType, contentId, and reason are required',
        });
      }

      // Verify content exists
      if (contentType === 'QuestionSet') {
        const questionSet = await questionSetsRepo.findById(contentId);
        if (!questionSet) {
          return res.status(404).json({
            code: 'NotFound',
            message: 'Question set not found',
          });
        }

        // Check if user has premium (only premium users can report expert content)
        const { userSubscriptionsService } = req.app.locals;
        const activeSubscription = await userSubscriptionsService.getActiveSubscription(user.id);
        
        if (!activeSubscription) {
          return res.status(403).json({
            code: 'Forbidden',
            message: 'Only premium users can report content',
          });
        }
      }

      // Check if user already reported this content
      const existing = await repo.findOne({
        contentType,
        contentId,
        reportedBy: user.id,
        status: { $in: ['Pending', 'UnderReview', 'SentToExpert', 'ExpertResponded'] },
      });

      if (existing) {
        return res.status(409).json({
          code: 'Conflict',
          message: 'You have already reported this content',
        });
      }

      const flag = await repo.create({
        contentType,
        contentId,
        reportedBy: user.id,
        reason,
        description: description || '',
        status: 'Pending',
      });

      // Send notification to admins
      const { notificationsService } = req.app.locals;
      const admins = await usersRepo.find({ role: 'Admin' });
      
      for (const admin of admins) {
        await notificationsService.createNotification({
          userId: admin._id,
          title: 'Báo cáo nội dung mới',
          message: `${user.fullName || user.email} đã báo cáo: ${reason}`,
          type: 'warning',
          relatedEntityType: 'QuestionSet',
          relatedEntityId: contentId,
        });
      }

      logger.info({ flagId: flag._id.toString() }, 'Content flag created');

      res.status(201).json(mapId(flag));
    } catch (e) {
      next(e);
    }
  },

  // GET /content-flags - List flags (Admin + Expert for assigned ones)
  list: async (req, res, next) => {
    try {
      const user = req.user;
      const page = Math.max(1, parseInt(req.query.page || '1', 10));
      const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize || '20', 10)));
      const { status, contentType } = req.query;

      const filter = {};
      
      if (status) filter.status = status;
      if (contentType) filter.contentType = contentType;

      // If expert, only show flags assigned to them
      if (user.role === 'Expert') {
        filter.assignedExpert = user.id;
      }
      // If learner (shouldn't happen but just in case), only their reports
      else if (user.role === 'Learner') {
        filter.reportedBy = user.id;
      }
      // Admin sees all

      const result = await repo.paginate(filter, { page, pageSize });

      res.status(200).json({
        items: result.items.map(mapId),
        meta: result.meta,
      });
    } catch (e) {
      next(e);
    }
  },

  // GET /content-flags/by-content - Get flags by contentIds (for expert to see which sets have reports)
  getByContent: async (req, res, next) => {
    try {
      const user = req.user;
      const { contentIds } = req.query; // comma-separated string or array

      if (!contentIds) {
        return res.status(400).json({
          code: 'ValidationError',
          message: 'contentIds query parameter is required',
        });
      }

      const ids = Array.isArray(contentIds) ? contentIds : contentIds.split(',');
      
      const filter = {
        contentId: { $in: ids },
        status: { $in: ['SentToExpert', 'ExpertResponded'] }, // Only active flags
      };

      // If expert, only their assigned flags
      if (user.role === 'Expert') {
        filter.assignedExpert = user.id;
      }

      console.log('🔍 getByContent filter:', JSON.stringify(filter));
      console.log('👤 User:', { id: user.id, role: user.role });

      const flags = await repo.model
        .find(filter)
        .populate('reportedBy', 'fullName email')
        .lean();

      console.log('✅ Found flags:', flags.length);

      res.status(200).json(flags.map(mapId));
    } catch (e) {
      next(e);
    }
  },

  // GET /content-flags/:id - Get single flag
  get: async (req, res, next) => {
    try {
      const user = req.user;
      const flag = await repo.findById(req.params.id);

      if (!flag) {
        return res.status(404).json({
          code: 'NotFound',
          message: 'Content flag not found',
        });
      }

      // Check access: Admin, reporter, or assigned expert
      const isAdmin = user.role === 'Admin';
      const isReporter = String(flag.reportedBy?._id || flag.reportedBy) === String(user.id);
      const isAssignedExpert = flag.assignedExpert && String(flag.assignedExpert._id || flag.assignedExpert) === String(user.id);

      if (!isAdmin && !isReporter && !isAssignedExpert) {
        return res.status(403).json({
          code: 'Forbidden',
          message: 'Access denied',
        });
      }

      res.status(200).json(mapId(flag));
    } catch (e) {
      next(e);
    }
  },

  // PATCH /content-flags/:id/review - Admin reviews and sends to expert
  adminReview: async (req, res, next) => {
    try {
      const user = req.user;
      const { action, adminNote } = req.body;

      if (user.role !== 'Admin') {
        return res.status(403).json({
          code: 'Forbidden',
          message: 'Admin access required',
        });
      }

      const flag = await repo.findById(req.params.id);
      if (!flag) {
        return res.status(404).json({
          code: 'NotFound',
          message: 'Content flag not found',
        });
      }

      if (flag.status !== 'Pending') {
        return res.status(400).json({
          code: 'InvalidState',
          message: 'Flag has already been reviewed',
        });
      }

      // If dismissed
      if (action === 'Dismiss') {
        const updated = await repo.updateById(req.params.id, {
          $set: {
            status: 'Dismissed',
            reviewedBy: user.id,
            reviewedAt: new Date(),
            action: 'None',
            notes: adminNote || '',
          },
        });

        // Notify reporter
        const { notificationsService } = req.app.locals;
        await notificationsService.createNotification({
          userId: flag.reportedBy._id || flag.reportedBy,
          title: 'Báo cáo đã được xem xét',
          message: `Báo cáo của bạn đã được xem xét và từ chối. ${adminNote ? 'Ghi chú: ' + adminNote : ''}`,
          type: 'info',
          relatedEntityType: 'QuestionSet',
          relatedEntityId: flag.contentId,
        });

        return res.status(200).json(mapId(updated));
      }

      // If sending to expert
      if (action === 'SendToExpert') {
        // Get content owner (expert)
        let expertId;
        if (flag.contentType === 'QuestionSet') {
          const questionSet = await questionSetsRepo.findById(flag.contentId);
          if (!questionSet) {
            return res.status(404).json({
              code: 'NotFound',
              message: 'Content not found',
            });
          }
          expertId = questionSet.userId;
        }

        const updated = await repo.updateById(req.params.id, {
          $set: {
            status: 'SentToExpert',
            reviewedBy: user.id,
            reviewedAt: new Date(),
            action: 'RequestExpertFix',
            adminNote: adminNote || '',
            assignedExpert: expertId,
            sentToExpertAt: new Date(),
          },
        });

        const { notificationsService } = req.app.locals;

        // Notify expert
        await notificationsService.createNotification({
          userId: expertId,
          title: 'Yêu cầu xử lý nội dung',
          message: `Admin đã gửi yêu cầu xem xét nội dung của bạn: ${flag.reason}. ${adminNote ? 'Ghi chú: ' + adminNote : ''}`,
          type: 'warning',
          relatedEntityType: 'QuestionSet',
          relatedEntityId: flag.contentId,
        });

        // Notify reporter - under review
        await notificationsService.createNotification({
          userId: flag.reportedBy._id || flag.reportedBy,
          title: 'Báo cáo đang được xử lý',
          message: 'Báo cáo của bạn đang được xem xét và đã chuyển đến người tạo nội dung',
          type: 'info',
          relatedEntityType: 'QuestionSet',
          relatedEntityId: flag.contentId,
        });

        logger.info({ flagId: flag._id.toString(), expertId }, 'Flag sent to expert');

        return res.status(200).json(mapId(updated));
      }

      res.status(400).json({
        code: 'InvalidAction',
        message: 'Invalid action',
      });
    } catch (e) {
      next(e);
    }
  },

  // PATCH /content-flags/:id/expert-respond - Expert responds after fixing
  expertRespond: async (req, res, next) => {
    try {
      const user = req.user;
      const { response } = req.body;

      if (user.role !== 'Expert') {
        return res.status(403).json({
          code: 'Forbidden',
          message: 'Expert access required',
        });
      }

      if (!response || response.trim().length === 0) {
        return res.status(400).json({
          code: 'ValidationError',
          message: 'Response is required',
        });
      }

      const flag = await repo.findById(req.params.id);
      if (!flag) {
        return res.status(404).json({
          code: 'NotFound',
          message: 'Content flag not found',
        });
      }

      if (flag.status !== 'SentToExpert') {
        return res.status(400).json({
          code: 'InvalidState',
          message: 'Flag is not awaiting expert response',
        });
      }

      // Verify this expert is assigned
      if (String(flag.assignedExpert._id || flag.assignedExpert) !== String(user.id)) {
        return res.status(403).json({
          code: 'Forbidden',
          message: 'This flag is not assigned to you',
        });
      }

      const updated = await repo.updateById(req.params.id, {
        $set: {
          status: 'ExpertResponded',
          expertResponse: response,
          expertRespondedAt: new Date(),
        },
      });

      const { notificationsService } = req.app.locals;

      // Notify admins
      const admins = await usersRepo.find({ role: 'Admin' });
      for (const admin of admins) {
        await notificationsService.createNotification({
          userId: admin._id,
          title: 'Expert đã phản hồi',
          message: `Expert đã phản hồi báo cáo nội dung`,
          type: 'info',
          relatedEntityType: 'QuestionSet',
          relatedEntityId: flag.contentId,
        });
      }

      // Notify reporter
      await notificationsService.createNotification({
        userId: flag.reportedBy._id || flag.reportedBy,
        title: 'Có phản hồi mới',
        message: `Người tạo nội dung đã phản hồi báo cáo của bạn`,
        type: 'info',
        relatedEntityType: 'QuestionSet',
        relatedEntityId: flag.contentId,
      });

      logger.info({ flagId: flag._id.toString() }, 'Expert responded to flag');

      res.status(200).json(mapId(updated));
    } catch (e) {
      next(e);
    }
  },

  // PATCH /content-flags/:id/resolve - Admin resolves the issue
  resolve: async (req, res, next) => {
    try {
      const user = req.user;
      const { resolutionNote } = req.body;

      if (user.role !== 'Admin') {
        return res.status(403).json({
          code: 'Forbidden',
          message: 'Admin access required',
        });
      }

      const flag = await repo.findById(req.params.id);
      if (!flag) {
        return res.status(404).json({
          code: 'NotFound',
          message: 'Content flag not found',
        });
      }

      if (flag.status === 'Resolved' || flag.status === 'Dismissed') {
        return res.status(400).json({
          code: 'InvalidState',
          message: 'Flag is already closed',
        });
      }

      const updated = await repo.updateById(req.params.id, {
        $set: {
          status: 'Resolved',
          resolvedAt: new Date(),
          resolutionNote: resolutionNote || '',
        },
      });

      const { notificationsService } = req.app.locals;

      // Notify reporter
      await notificationsService.createNotification({
        userId: flag.reportedBy._id || flag.reportedBy,
        title: 'Báo cáo đã được giải quyết',
        message: `Báo cáo của bạn đã được giải quyết. ${resolutionNote ? 'Ghi chú: ' + resolutionNote : ''}`,
        type: 'success',
        relatedEntityType: 'QuestionSet',
        relatedEntityId: flag.contentId,
      });

      // Notify expert if assigned
      if (flag.assignedExpert) {
        await notificationsService.createNotification({
          userId: flag.assignedExpert._id || flag.assignedExpert,
          title: 'Báo cáo đã được xử lý xong',
          message: `Báo cáo nội dung đã được giải quyết. ${resolutionNote ? 'Ghi chú: ' + resolutionNote : ''}`,
          type: 'success',
          relatedEntityType: 'QuestionSet',
          relatedEntityId: flag.contentId,
        });
      }

      logger.info({ flagId: flag._id.toString() }, 'Flag resolved');

      res.status(200).json(mapId(updated));
    } catch (e) {
      next(e);
    }
  },
};
