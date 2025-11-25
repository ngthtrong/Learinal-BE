const { Types } = require("mongoose");
const ValidationRequestsRepository = require("../repositories/validationRequests.repository");
const QuestionSetsRepository = require("../repositories/questionSets.repository");
const UsersRepository = require("../repositories/users.repository");
const reviewCompleted = require("../jobs/review.completed");
const notificationService = require("../services/notification.service");

const repo = new ValidationRequestsRepository();
const questionSetsRepo = new QuestionSetsRepository();
const _usersRepo = new UsersRepository();

function mapId(doc) {
  if (!doc) return doc;
  const { _id, __v, ...rest } = doc;
  return { id: String(_id || rest.id), ...rest };
}

module.exports = {
  // GET /validation-requests
  list: async (req, res, next) => {
    try {
      const user = req.user;
      const page = Math.max(1, parseInt(req.query.page || "1", 10));
      const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize || "20", 10)));

      // Build filter depending on role & desired visibility
      const status = (req.query.status || '').trim();
      const setId = (req.query.setId || '').trim();
      const setIdFilter = setId && Types.ObjectId.isValid(setId) ? new Types.ObjectId(setId) : null;
      let filter;
      if (user.role === 'Learner') {
        filter = { learnerId: user.id };
        if (status) filter.status = status;
        if (setIdFilter) filter.setId = setIdFilter;
      } else if (user.role === 'Expert') {
        // Show assigned to this expert OR unassigned (PendingAssignment) unless a specific status is requested
        if (status) {
          if (status === 'PendingAssignment') {
            filter = { status: 'PendingAssignment' };
            if (setIdFilter) filter.setId = setIdFilter;
          } else {
            filter = { expertId: user.id, status };
            if (setIdFilter) filter.setId = setIdFilter;
          }
        } else {
          filter = { $or: [ { expertId: user.id }, { status: 'PendingAssignment' } ] };
          if (setIdFilter) filter.setId = setIdFilter; // narrow both arms by setId using $and-like pattern (handled below)
        }
      } else {
        // Admin sees all (optionally filtered by status)
        filter = {};
        if (status) filter.status = status;
        if (setIdFilter) filter.setId = setIdFilter;
      }

      // If setId provided with $or filter, convert to $and to ensure both branches constrained
      if (filter.$or && filter.setId) {
        const or = filter.$or;
        const setConstraint = { setId: filter.setId };
        delete filter.setId;
        filter = { $and: [ { $or: or }, setConstraint ] };
      }

      // Debug logging
      console.log('[ValidationRequests.list] setId param:', setId, 'converted to ObjectId:', setIdFilter);
      console.log('[ValidationRequests.list] Final filter:', JSON.stringify(filter, null, 2));

      const { items, totalItems, totalPages } = await repo.paginate(
        filter,
        { page, pageSize, sort: { createdAt: -1 } }
      );

      console.log('[ValidationRequests.list] Found', items.length, 'items. SetIds:', items.map(i => String(i.setId)));

      let enriched = items || [];
      // Attach question set title, learner name, expert name
      if (enriched.length > 0) {
        const QuestionSetsRepository = require('../repositories/questionSets.repository');
        const UsersRepository = require('../repositories/users.repository');
        const qsRepo = new QuestionSetsRepository();
        const usersRepo = new UsersRepository();
        const setIds = [...new Set(enriched.map(r => String(r.setId)))];
        const learnerIds = [...new Set(enriched.map(r => String(r.learnerId)))];
        const expertIds = [...new Set(enriched.filter(r => !!r.expertId).map(r => String(r.expertId)))];
        const sets = setIds.length ? await qsRepo.find({ _id: { $in: setIds } }) : [];
        const learners = learnerIds.length ? await usersRepo.find({ _id: { $in: learnerIds } }) : [];
        const experts = expertIds.length ? await usersRepo.find({ _id: { $in: expertIds } }) : [];
        const setMap = new Map(sets.map(s => [String(s._id), { title: s.title, questionCount: (s.questions||[]).length }]));
        const learnerMap = new Map(learners.map(u => [String(u._id), { name: u.fullName || u.displayName || u.email }]));
        const expertMap = new Map(experts.map(u => [String(u._id), { name: u.fullName || u.displayName || u.email }]));
        enriched = enriched.map(r => ({
          ...r,
          questionSetTitle: setMap.get(String(r.setId))?.title,
          questionCount: setMap.get(String(r.setId))?.questionCount,
          learnerName: learnerMap.get(String(r.learnerId))?.name,
          expertName: r.expertId ? expertMap.get(String(r.expertId))?.name : undefined,
        }));
      }

      res.status(200).json({
        items: enriched.map(mapId),
        meta: { page, pageSize, total: totalItems, totalPages },
      });
    } catch (e) {
      next(e);
    }
  },

  // GET /validation-requests/:id
  get: async (req, res, next) => {
    try {
      const item = await repo.findById(req.params.id);
      if (!item) return res.status(404).json({ code: "NotFound", message: "Not found" });
      res.status(200).json(mapId(item));
    } catch (e) {
      next(e);
    }
  },

  // GET /validation-requests/:id/detail
  detail: async (req, res, next) => {
    try {
      const user = req.user;
      const request = await repo.findById(req.params.id);
      if (!request) return res.status(404).json({ code: 'NotFound', message: 'Not found' });

      // Authorization: learner (owner), assigned expert, or admin
      const isLearner = String(request.learnerId) === String(user.id);
      const isExpert = request.expertId && String(request.expertId) === String(user.id);
      const isAdmin = user.role === 'Admin';
      if (!isLearner && !isExpert && !isAdmin) {
        return res.status(403).json({ code: 'Forbidden', message: 'Access denied' });
      }

      const QuestionSetsRepository = require('../repositories/questionSets.repository');
      const UsersRepository = require('../repositories/users.repository');
      const qsRepo = new QuestionSetsRepository();
      const usersRepo = new UsersRepository();

      const questionSet = await qsRepo.findById(String(request.setId));
      const learner = await usersRepo.findById(String(request.learnerId));
      const expert = request.expertId ? await usersRepo.findById(String(request.expertId)) : null;

      res.status(200).json({
        request: mapId(request),
        questionSet: questionSet ? {
          id: String(questionSet._id),
            title: questionSet.title,
            description: questionSet.description,
            status: questionSet.status,
            questions: questionSet.questions || [],
            questionCount: (questionSet.questions || []).length,
        } : null,
        learner: learner ? {
          id: String(learner._id),
          name: learner.fullName || learner.displayName || learner.email,
          email: learner.email,
        } : null,
        expert: expert ? {
          id: String(expert._id),
          name: expert.fullName || expert.displayName || expert.email,
        } : null,
      });
    } catch (e) {
      next(e);
    }
  },

  // PATCH /validation-requests/:id
  update: async (req, res, next) => {
    try {
      const allowed = {};
      if (req.body.status) allowed.status = req.body.status;
      if (req.body.expertId) allowed.expertId = req.body.expertId;
      const updated = await repo.updateById(req.params.id, { $set: allowed }, { new: true });
      if (!updated) return res.status(404).json({ code: "NotFound", message: "Not found" });

      // Emit real-time notification if assigned to expert
      if (req.body.expertId && req.body.status === "Assigned") {
        notificationService.emitValidationAssigned(req.body.expertId, updated);
      }

      res.status(200).json(mapId(updated));
    } catch (e) {
      next(e);
    }
  },

  // PATCH /validation-requests/:id/claim
  // Expert claims a pending assignment request
  claim: async (req, res, next) => {
    try {
      const expertId = req.user.id;
      const requestId = req.params.id;
      const request = await repo.findById(requestId);
      if (!request) return res.status(404).json({ code: 'NotFound', message: 'Not found' });
      if (request.status !== 'PendingAssignment' || request.expertId) {
        return res.status(400).json({ code: 'InvalidState', message: 'Request is not available to claim' });
      }
      const updated = await repo.updateById(requestId, { $set: { expertId, status: 'Assigned', claimedAt: new Date() } }, { new: true });
      notificationService.emitValidationAssigned(expertId, updated);
      res.status(200).json(mapId(updated));
    } catch (e) {
      next(e);
    }
  },

  // PATCH /validation-requests/:id/complete
  // Expert completes validation
  complete: async (req, res, next) => {
    try {
      const { id: requestId } = req.params;
      const { decision, feedback, correctedQuestions } = req.body;
      const expertId = req.user.id;

      // 1. Validate request ownership
      const request = await repo.findById(requestId);

      if (!request || request.expertId?.toString() !== expertId) {
        return res.status(404).json({
          code: "NotFound",
          message: "Validation request not found",
        });
      }

      if (request.status !== "Assigned") {
        return res.status(400).json({
          code: "InvalidState",
          message: "Validation request is not in Assigned state",
        });
      }

      // 2. Validate decision
      if (!["Approved", "Rejected"].includes(decision)) {
        return res.status(400).json({
          code: "ValidationError",
          message: "Decision must be Approved or Rejected",
        });
      }

      // 3. Update validation request
      const updateData = {
        status: "Completed",
        decision,
        feedback,
        completionTime: new Date(),
      };

      await repo.updateById(requestId, updateData);

      // 4. Update question set
      const questionSet = await questionSetsRepo.findById(request.setId.toString());

      if (decision === "Approved") {
        // Apply corrections if provided
        const finalQuestions = correctedQuestions || questionSet.questions;

        await questionSetsRepo.updateById(request.setId.toString(), {
          status: "Validated",
          questions: finalQuestions,
        });
      } else {
        // Rejected - back to Draft
        await questionSetsRepo.updateById(request.setId.toString(), {
          status: "Draft",
        });
      }

      // 5. Trigger completion job (email + commission)
      await reviewCompleted({
        validationRequestId: requestId,
        expertId,
        setId: request.setId.toString(),
        decision,
      });

      // 6. Emit real-time notification to learner
      const updatedRequest = await repo.findById(requestId);
      if (updatedRequest && updatedRequest.requestedBy) {
        notificationService.emitValidationCompleted(
          updatedRequest.requestedBy.toString(),
          updatedRequest
        );
      }

      res.status(200).json({
        id: requestId,
        status: updateData.status,
        decision,
        completionTime: updateData.completionTime,
      });
    } catch (e) {
      next(e);
    }
  },
};
