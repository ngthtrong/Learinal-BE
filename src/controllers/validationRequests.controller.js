const ValidationRequestsRepository = require('../repositories/validationRequests.repository');
const QuestionSetsRepository = require('../repositories/questionSets.repository');
const UsersRepository = require('../repositories/users.repository');
const reviewCompleted = require('../jobs/review.completed');
const notificationService = require('../services/notification.service');

const repo = new ValidationRequestsRepository();
const questionSetsRepo = new QuestionSetsRepository();
const usersRepo = new UsersRepository();

function mapId(doc) { if (!doc) return doc; const { _id, __v, ...rest } = doc; return { id: String(_id || rest.id), ...rest }; }

module.exports = {
  // GET /validation-requests
  list: async (req, res, next) => {
    try {
      const page = Math.max(1, parseInt(req.query.page || '1', 10));
      const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize || '20', 10)));
      const { items, totalItems, totalPages } = await repo.paginate({}, { page, pageSize, sort: { createdAt: -1 } });
      res.status(200).json({ items: (items || []).map(mapId), meta: { page, pageSize, total: totalItems, totalPages } });
    } catch (e) { next(e); }
  },
  
  // GET /validation-requests/:id
  get: async (req, res, next) => {
    try {
      const item = await repo.findById(req.params.id);
      if (!item) return res.status(404).json({ code: 'NotFound', message: 'Not found' });
      res.status(200).json(mapId(item));
    } catch (e) { next(e); }
  },
  
  // PATCH /validation-requests/:id
  update: async (req, res, next) => {
    try {
      const allowed = {}; if (req.body.status) allowed.status = req.body.status; if (req.body.expertId) allowed.expertId = req.body.expertId;
      const updated = await repo.updateById(req.params.id, { $set: allowed }, { new: true });
      if (!updated) return res.status(404).json({ code: 'NotFound', message: 'Not found' });
      
      // Emit real-time notification if assigned to expert
      if (req.body.expertId && req.body.status === 'Assigned') {
        notificationService.emitValidationAssigned(req.body.expertId, updated);
      }
      
      res.status(200).json(mapId(updated));
    } catch (e) { next(e); }
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
          code: 'NotFound',
          message: 'Validation request not found',
        });
      }

      if (request.status !== 'Assigned') {
        return res.status(400).json({
          code: 'InvalidState',
          message: 'Validation request is not in Assigned state',
        });
      }

      // 2. Validate decision
      if (!['Approved', 'Rejected'].includes(decision)) {
        return res.status(400).json({
          code: 'ValidationError',
          message: 'Decision must be Approved or Rejected',
        });
      }

      // 3. Update validation request
      const updateData = {
        status: 'Completed',
        decision,
        feedback,
        completionTime: new Date(),
      };

      await repo.updateById(requestId, updateData);

      // 4. Update question set
      const questionSet = await questionSetsRepo.findById(
        request.setId.toString()
      );

      if (decision === 'Approved') {
        // Apply corrections if provided
        const finalQuestions = correctedQuestions || questionSet.questions;

        await questionSetsRepo.updateById(request.setId.toString(), {
          status: 'Validated',
          questions: finalQuestions,
        });
      } else {
        // Rejected - back to Draft
        await questionSetsRepo.updateById(request.setId.toString(), {
          status: 'Draft',
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
