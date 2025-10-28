const ValidationRequestsRepository = require('../repositories/validationRequests.repository');
const QuestionSetsRepository = require('../repositories/questionSets.repository');
const UsersRepository = require('../repositories/users.repository');
const CommissionRecordsRepository = require('../repositories/commissionRecords.repository');
const { eventBus } = require('../adapters');
const logger = require('../utils/logger');

/**
 * Map MongoDB document to API DTO
 */
function mapId(doc) {
  if (!doc) return null;
  const { _id, __v, ...rest } = doc;
  return { id: String(_id || rest.id), ...rest };
}

/**
 * ValidationRequestsService - Business logic for validation workflow
 * Handles creating, assigning, and completing validation requests
 * Enforces: 1 open request per set, Expert assignment, commission on completion
 */
class ValidationRequestsService {
  constructor() {
    this.repo = new ValidationRequestsRepository();
    this.questionSetsRepo = new QuestionSetsRepository();
    this.usersRepo = new UsersRepository();
    this.commissionRepo = new CommissionRecordsRepository();
  }

  /**
   * Create validation request for a question set
   * @param {string} userId - Learner creating the request
   * @param {string} setId - Question set to validate
   * @returns {Promise<object>} - Created validation request
   */
  async createRequest(userId, setId) {
    // Verify question set exists and belongs to user
    const questionSet = await this.questionSetsRepo.findByIdAndUser(setId, userId);
    if (!questionSet) {
      throw {
        code: 'NotFound',
        message: 'Question set not found or access denied',
        status: 404,
      };
    }

    // Check question set status - must be Draft or InReview
    if (!['Draft', 'InReview'].includes(questionSet.status)) {
      throw {
        code: 'ValidationError',
        message: `Cannot request validation for question set with status: ${questionSet.status}`,
        status: 400,
        details: { allowedStatuses: ['Draft', 'InReview'] },
      };
    }

    // Check for existing open request (enforced by partial unique index)
    const existingRequest = await this.repo.findOpenRequestBySet(setId);
    if (existingRequest) {
      throw {
        code: 'Conflict',
        message: 'An open validation request already exists for this question set',
        status: 409,
        details: { existingRequestId: String(existingRequest._id) },
      };
    }

    // Create validation request
    const request = {
      setId,
      learnerId: userId,
      status: 'PendingAssignment',
      requestTime: new Date(),
    };

    const created = await this.repo.create(request);

    // Update question set status to InReview
    await this.questionSetsRepo.updateById(setId, {
      $set: { status: 'InReview' },
    });

    logger.info(
      { requestId: created._id, learnerId: userId, setId },
      '[ValidationRequests] Validation request created'
    );

    // Publish event for notifications (admin should be notified)
    try {
      await eventBus.publish('validation.requested', {
        requestId: String(created._id),
        learnerId: userId,
        setId,
      });
    } catch (error) {
      logger.error(
        { error: error.message, requestId: created._id },
        '[ValidationRequests] Failed to publish validation.requested event'
      );
    }

    return mapId(created);
  }

  /**
   * Assign expert to a validation request (Admin only)
   * @param {string} adminId - Admin performing the assignment
   * @param {string} requestId - Validation request ID
   * @param {string} expertId - Expert to assign
   * @returns {Promise<object>} - Updated validation request
   */
  async assignExpert(adminId, requestId, expertId) {
    // Verify request exists and is pending
    const request = await this.repo.findById(requestId);
    if (!request) {
      throw {
        code: 'NotFound',
        message: 'Validation request not found',
        status: 404,
      };
    }

    if (request.status !== 'PendingAssignment') {
      throw {
        code: 'ValidationError',
        message: `Cannot assign expert to request with status: ${request.status}`,
        status: 400,
        details: { currentStatus: request.status },
      };
    }

    // Verify expert exists and has Expert role
    const expert = await this.usersRepo.findById(expertId);
    if (!expert) {
      throw {
        code: 'NotFound',
        message: 'Expert not found',
        status: 404,
      };
    }

    if (expert.role !== 'Expert') {
      throw {
        code: 'ValidationError',
        message: 'Assigned user must have Expert role',
        status: 400,
        details: { userId: expertId, currentRole: expert.role },
      };
    }

    // Assign expert
    const updated = await this.repo.assignExpert(requestId, expertId, adminId);
    if (!updated) {
      throw {
        code: 'Conflict',
        message: 'Failed to assign expert - request may have been modified',
        status: 409,
      };
    }

    logger.info(
      { requestId, expertId, adminId },
      '[ValidationRequests] Expert assigned to validation request'
    );

    // Publish event for notifications (expert should be notified)
    try {
      await eventBus.publish('review.assigned', {
        requestId,
        expertId,
        setId: String(request.setId),
        learnerId: String(request.learnerId),
      });
    } catch (error) {
      logger.error(
        { error: error.message, requestId },
        '[ValidationRequests] Failed to publish review.assigned event'
      );
    }

    return mapId(updated);
  }

  /**
   * Complete validation request (Expert only)
   * @param {string} expertId - Expert completing the review
   * @param {string} requestId - Validation request ID
   * @param {object} payload - { approved: boolean, feedback?: string }
   * @returns {Promise<object>} - Updated validation request with commission
   */
  async completeReview(expertId, requestId, payload) {
    const { approved, feedback } = payload;

    // Verify request exists and is assigned to this expert
    const request = await this.repo.findById(requestId);
    if (!request) {
      throw {
        code: 'NotFound',
        message: 'Validation request not found',
        status: 404,
      };
    }

    if (request.status !== 'Assigned') {
      throw {
        code: 'ValidationError',
        message: `Cannot complete request with status: ${request.status}`,
        status: 400,
        details: { currentStatus: request.status },
      };
    }

    if (String(request.expertId) !== String(expertId)) {
      throw {
        code: 'Forbidden',
        message: 'Only the assigned expert can complete this review',
        status: 403,
      };
    }

    // Complete validation request
    const updated = await this.repo.complete(requestId);
    if (!updated) {
      throw {
        code: 'Conflict',
        message: 'Failed to complete request - request may have been modified',
        status: 409,
      };
    }

    // Update question set status based on approval
    const newStatus = approved ? 'Validated' : 'Draft';
    await this.questionSetsRepo.updateById(request.setId, {
      $set: { status: newStatus },
    });

    logger.info(
      { requestId, expertId, approved, newStatus },
      '[ValidationRequests] Validation request completed'
    );

    // Create commission record if approved
    let commissionRecord = null;
    if (approved) {
      commissionRecord = await this._createCommission(expertId, request.setId);
    }

    // Publish event for notifications (learner should be notified)
    try {
      await eventBus.publish('review.completed', {
        requestId,
        expertId,
        setId: String(request.setId),
        learnerId: String(request.learnerId),
        approved,
        feedback,
      });
    } catch (error) {
      logger.error(
        { error: error.message, requestId },
        '[ValidationRequests] Failed to publish review.completed event'
      );
    }

    return {
      ...mapId(updated),
      approved,
      feedback,
      commission: commissionRecord ? mapId(commissionRecord) : null,
    };
  }

  /**
   * Get validation request by ID
   * @param {string} requestId
   * @param {object} user - Current user context
   * @returns {Promise<object>}
   */
  async getById(requestId, user) {
    const request = await this.repo.findById(requestId);
    if (!request) {
      throw {
        code: 'NotFound',
        message: 'Validation request not found',
        status: 404,
      };
    }

    // Check access: Admin, or assigned Expert, or Learner who created
    const isAdmin = user.role === 'Admin';
    const isAssignedExpert = request.expertId && String(request.expertId) === String(user.id);
    const isLearner = String(request.learnerId) === String(user.id);

    if (!isAdmin && !isAssignedExpert && !isLearner) {
      throw {
        code: 'Forbidden',
        message: 'Access denied to this validation request',
        status: 403,
      };
    }

    return mapId(request);
  }

  /**
   * List validation requests with filters
   * @param {object} user - Current user context
   * @param {object} options - { page, pageSize, status, role-specific filters }
   * @returns {Promise<{items, meta}>}
   */
  async list(user, { page = 1, pageSize = 20, status } = {}) {
    let result;

    if (user.role === 'Admin') {
      // Admin sees all requests, optionally filtered by status
      result = status
        ? await this.repo.findByStatus(status, { page, pageSize })
        : await this.repo.paginate({}, { page, pageSize, sort: { requestTime: -1 } });
    } else if (user.role === 'Expert') {
      // Expert sees only their assigned requests
      result = await this.repo.findByExpert(user.id, { page, pageSize, status });
    } else {
      // Learner sees only their own requests
      result = await this.repo.findByLearner(user.id, { page, pageSize, status });
    }

    return {
      items: result.items.map(mapId),
      meta: result.meta,
    };
  }

  // ===== PRIVATE HELPERS =====

  /**
   * Create commission record for validated question set
   * @private
   */
  async _createCommission(expertId, setId) {
    try {
      // Check if commission already exists
      const existing = await this.commissionRepo.findMany({ expertId, setId });
      if (existing && existing.length > 0) {
        logger.debug({ expertId, setId }, '[ValidationRequests] Commission already exists');
        return existing[0];
      }

      // Create commission record
      // Note: Commission amount calculation depends on business rules
      // Placeholder: Fixed amount or percentage-based
      const commission = {
        expertId,
        setId,
        amount: 10.0, // TODO: Implement dynamic commission calculation
        status: 'Pending',
        transactionDate: new Date(),
      };

      const created = await this.commissionRepo.create(commission);

      logger.info(
        { commissionId: created._id, expertId, setId, amount: commission.amount },
        '[ValidationRequests] Commission record created'
      );

      return created;
    } catch (error) {
      logger.error(
        { expertId, setId, error: error.message },
        '[ValidationRequests] Failed to create commission record'
      );
      // Non-fatal - don't block review completion
      return null;
    }
  }
}

module.exports = ValidationRequestsService;
