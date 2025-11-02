# Phase 1 (Tiếp): Expert Workflow & Remove Stubs

**Tiếp tục từ Phase 1...**

---

## 2️⃣ Expert Workflow (HIGH PRIORITY)

### 2.1. Validation Request (Real Implementation)

**Hiện tại:** Stub implementation trả về 202 Accepted  
**Cần:** Real logic với expert assignment

**File:** `src/controllers/questionSets.controller.js`

Thay thế method `requestReview`:

```javascript
/**
 * POST /question-sets/:id/review
 * Request expert validation
 */
async requestReview(req, res, next) {
  try {
    const { id: setId } = req.params;
    const userId = req.user.id;

    // 1. Validate ownership
    const questionSet = await this.questionSetsRepo.findById(setId);
    if (!questionSet || questionSet.creatorId.toString() !== userId) {
      return res.status(404).json({
        code: 'NotFound',
        message: 'Question set not found',
      });
    }

    // 2. Check status
    if (questionSet.status === 'UnderReview' || questionSet.status === 'Validated') {
      return res.status(409).json({
        code: 'Conflict',
        message: 'Question set is already under review or validated',
      });
    }

    // 3. Check existing request
    const existingRequest = await this.validationRequestsRepo.findOne({
      setId,
      status: { $in: ['PendingAssignment', 'Assigned'] },
    });

    if (existingRequest) {
      return res.status(409).json({
        code: 'Conflict',
        message: 'Validation request already exists',
        details: {
          requestId: existingRequest._id.toString(),
          status: existingRequest.status,
        },
      });
    }

    // 4. Create validation request
    const validationRequest = await this.validationRequestsRepo.create({
      setId,
      learnerId: userId,
      status: 'PendingAssignment',
      requestTime: new Date(),
    });

    // 5. Update question set status
    await this.questionSetsRepo.update(setId, {
      status: 'PendingReview',
    });

    // 6. Enqueue assignment job
    await this.eventBus.publish('validation.requested', {
      requestId: validationRequest._id.toString(),
      setId,
      learnerId: userId,
    });

    logger.info(
      { requestId: validationRequest._id.toString(), setId, userId },
      'Validation request created'
    );

    res.status(202).json({
      id: validationRequest._id.toString(),
      setId,
      status: 'PendingAssignment',
      requestTime: validationRequest.requestTime,
      message: 'Validation request submitted. An expert will be assigned shortly.',
    });
  } catch (error) {
    next(error);
  }
}
```

---

### 2.2. Expert Assignment Worker

**File:** `src/jobs/review.assigned.js`

Thay thế toàn bộ file:

```javascript
const ValidationRequestsRepository = require('../repositories/validationRequests.repository');
const QuestionSetsRepository = require('../repositories/questionSets.repository');
const SubjectsRepository = require('../repositories/subjects.repository');
const UsersRepository = require('../repositories/users.repository');
const { enqueueEmail } = require('../adapters/queue');
const logger = require('../utils/logger');

const validationRepo = new ValidationRequestsRepository();
const questionSetsRepo = new QuestionSetsRepository();
const subjectsRepo = new SubjectsRepository();
const usersRepo = new UsersRepository();

/**
 * Assign expert to validation request using "least loaded" algorithm
 */
async function assignExpertToValidationRequest(payload) {
  const { requestId, setId, learnerId } = payload;

  logger.info({ requestId, setId }, 'Processing expert assignment');

  try {
    // 1. Find available expert
    const expert = await findLeastLoadedExpert();

    if (!expert) {
      logger.warn({ requestId }, 'No expert available, will retry');
      throw new Error('No expert available for assignment');
    }

    // 2. Assign to expert
    await validationRepo.update(requestId, {
      expertId: expert._id,
      status: 'Assigned',
      assignedTime: new Date(),
    });

    // 3. Update question set status
    await questionSetsRepo.update(setId, {
      status: 'UnderReview',
    });

    logger.info(
      {
        requestId,
        expertId: expert._id.toString(),
        expertEmail: expert.email,
      },
      'Validation request assigned to expert'
    );

    // 4. Send notification email to Expert
    const questionSet = await questionSetsRepo.findById(setId);
    const subject = await subjectsRepo.findById(questionSet.subjectId.toString());
    const learner = await usersRepo.findById(learnerId);

    await enqueueEmail({
      to: expert.email,
      templateId: 'validationAssigned',
      variables: {
        expertName: expert.fullName,
        setTitle: questionSet.title || 'Untitled Question Set',
        subjectName: subject?.subjectName || 'Unknown Subject',
        learnerName: learner?.fullName || 'Unknown User',
        numQuestions: questionSet.questions.length,
        reviewLink: `${process.env.APP_BASE_URL}/expert/validation-requests/${requestId}`,
        dueDate: calculateDueDate(),
      },
    });

    // 5. Send notification to Learner
    await enqueueEmail({
      to: learner.email,
      templateId: 'validationAssignedToLearner',
      variables: {
        learnerName: learner.fullName,
        setTitle: questionSet.title,
        expertName: expert.fullName,
        estimatedDays: 3,
      },
    });

    logger.info({ requestId }, 'Notification emails queued');

    return {
      requestId,
      expertId: expert._id.toString(),
      status: 'Assigned',
    };
  } catch (error) {
    logger.error(
      { requestId, error: error.message },
      'Failed to assign validation request'
    );
    throw error; // Will trigger retry
  }
}

/**
 * Find expert with least active assignments (load balancing)
 */
async function findLeastLoadedExpert() {
  // Get all active experts
  const experts = await usersRepo.find({
    role: 'Expert',
    status: 'Active',
  });

  if (experts.length === 0) {
    return null;
  }

  // Count active assignments for each expert
  const expertsWithLoad = await Promise.all(
    experts.map(async (expert) => {
      const activeCount = await validationRepo.count({
        expertId: expert._id,
        status: 'Assigned', // Only count currently assigned, not completed
      });
      return { expert, activeCount };
    })
  );

  // Sort by load (ascending) - expert with least assignments first
  expertsWithLoad.sort((a, b) => a.activeCount - b.activeCount);

  logger.info(
    {
      experts: expertsWithLoad.map((e) => ({
        id: e.expert._id.toString(),
        name: e.expert.fullName,
        load: e.activeCount,
      })),
    },
    'Expert load distribution'
  );

  // Return expert with least load
  return expertsWithLoad[0].expert;
}

/**
 * Calculate due date (3 days from now)
 */
function calculateDueDate() {
  const due = new Date();
  due.setDate(due.getDate() + 3);
  return due.toISOString().split('T')[0];
}

module.exports = assignExpertToValidationRequest;
```

**Register job in worker:**

```javascript
// src/worker.js
const assignExpertToValidationRequest = require('./jobs/review.assigned');

// Add handler
async function handleValidationRequested(job) {
  const { requestId, setId, learnerId } = job.data;
  await assignExpertToValidationRequest({ requestId, setId, learnerId });
}

// Register
worker.process('validation.requested', handleValidationRequested);
```

---

### 2.3. Review Completion Workflow

**File:** `src/controllers/validationRequests.controller.js`

Thêm endpoint complete:

```javascript
/**
 * PATCH /validation-requests/:id/complete
 * Expert completes validation
 */
async complete(req, res, next) {
  try {
    const { id: requestId } = req.params;
    const { decision, feedback, correctedQuestions } = req.body;
    const expertId = req.user.id;

    // Validate decision
    if (!['Approved', 'Rejected'].includes(decision)) {
      return res.status(400).json({
        code: 'ValidationError',
        message: 'Decision must be either "Approved" or "Rejected"',
      });
    }

    // 1. Find and validate request
    const request = await this.validationRepo.findById(requestId);

    if (!request) {
      return res.status(404).json({
        code: 'NotFound',
        message: 'Validation request not found',
      });
    }

    if (request.expertId.toString() !== expertId) {
      return res.status(403).json({
        code: 'Forbidden',
        message: 'You are not assigned to this validation request',
      });
    }

    if (request.status !== 'Assigned') {
      return res.status(409).json({
        code: 'Conflict',
        message: 'Validation request is not in Assigned status',
      });
    }

    // 2. Update validation request
    await this.validationRepo.update(requestId, {
      status: 'Completed',
      decision,
      feedback,
      reviewedAt: new Date(),
    });

    // 3. Update question set
    const questionSet = await this.questionSetsRepo.findById(request.setId.toString());

    if (decision === 'Approved') {
      // Apply corrections if provided
      if (correctedQuestions && correctedQuestions.length > 0) {
        await this.questionSetsRepo.update(request.setId, {
          questions: correctedQuestions,
          status: 'Validated',
        });
      } else {
        await this.questionSetsRepo.update(request.setId, {
          status: 'Validated',
        });
      }
    } else {
      // Rejected
      await this.questionSetsRepo.update(request.setId, {
        status: 'Rejected',
      });
    }

    logger.info(
      {
        requestId,
        setId: request.setId.toString(),
        decision,
      },
      'Validation completed'
    );

    // 4. Publish event for notifications and commission
    await this.eventBus.publish('validation.completed', {
      requestId,
      setId: request.setId.toString(),
      learnerId: request.learnerId.toString(),
      expertId,
      decision,
      feedback,
    });

    res.status(200).json({
      id: requestId,
      status: 'Completed',
      decision,
      message: `Question set ${decision.toLowerCase()} successfully`,
    });
  } catch (error) {
    next(error);
  }
}
```

**Routes:**

```javascript
// src/routes/validationRequests.routes.js
router.patch('/:id/complete',
  authenticateJWT,
  authorizeRole('Expert', 'Admin'),
  controller.complete.bind(controller)
);
```

---

### 2.4. Review Completion Job

**File:** `src/jobs/review.completed.js`

Thay thế toàn bộ file:

```javascript
const ValidationRequestsRepository = require('../repositories/validationRequests.repository');
const QuestionSetsRepository = require('../repositories/questionSets.repository');
const UsersRepository = require('../repositories/users.repository');
const CommissionRecordsRepository = require('../repositories/commissionRecords.repository');
const { enqueueEmail } = require('../adapters/queue');
const logger = require('../utils/logger');

const validationRepo = new ValidationRequestsRepository();
const questionSetsRepo = new QuestionSetsRepository();
const usersRepo = new UsersRepository();
const commissionRepo = new CommissionRecordsRepository();

/**
 * Handle validation completion
 * - Send notifications
 * - Create commission record if approved
 */
async function handleValidationCompleted(payload) {
  const { requestId, setId, learnerId, expertId, decision, feedback } = payload;

  logger.info({ requestId, decision }, 'Processing validation completion');

  try {
    // 1. Get entities
    const questionSet = await questionSetsRepo.findById(setId);
    const learner = await usersRepo.findById(learnerId);
    const expert = await usersRepo.findById(expertId);

    // 2. Send notification to Learner
    await enqueueEmail({
      to: learner.email,
      templateId: decision === 'Approved' ? 'validationApproved' : 'validationRejected',
      variables: {
        learnerName: learner.fullName,
        setTitle: questionSet.title || 'Untitled Set',
        expertName: expert.fullName,
        feedback: feedback || 'No additional feedback provided',
        viewLink: `${process.env.APP_BASE_URL}/question-sets/${setId}`,
      },
    });

    logger.info({ learnerEmail: learner.email }, 'Learner notification sent');

    // 3. If approved, create commission record
    if (decision === 'Approved') {
      // Base commission for validation
      const baseCommission = 500; // 500 VND per validation

      await commissionRepo.create({
        expertId,
        type: 'Validation',
        relatedEntityId: setId,
        relatedEntityType: 'QuestionSet',
        amount: baseCommission,
        status: 'Pending',
        description: `Validation of question set: ${questionSet.title}`,
      });

      logger.info(
        { expertId: expertId.toString(), amount: baseCommission },
        'Commission record created for validation'
      );

      // Send commission notification to Expert
      await enqueueEmail({
        to: expert.email,
        templateId: 'commissionEarned',
        variables: {
          expertName: expert.fullName,
          amount: baseCommission,
          type: 'Validation',
          setTitle: questionSet.title,
          dashboardLink: `${process.env.APP_BASE_URL}/expert/commissions`,
        },
      });
    }

    logger.info({ requestId }, 'Validation completion processed');
  } catch (error) {
    logger.error(
      { requestId, error: error.message },
      'Failed to process validation completion'
    );
    throw error;
  }
}

module.exports = handleValidationCompleted;
```

---

### 2.5. Commission Calculation

**File:** `src/jobs/commission.calculate.js`

Implement commission calculation based on quiz attempts (theo SRS section 4.1.2):

```javascript
const QuizAttemptsRepository = require('../repositories/quizAttempts.repository');
const QuestionSetsRepository = require('../repositories/questionSets.repository');
const CommissionRecordsRepository = require('../repositories/commissionRecords.repository');
const ValidationRequestsRepository = require('../repositories/validationRequests.repository');
const logger = require('../utils/logger');

const quizAttemptsRepo = new QuizAttemptsRepository();
const questionSetsRepo = new QuestionSetsRepository();
const commissionRepo = new CommissionRecordsRepository();
const validationRepo = new ValidationRequestsRepository();

/**
 * Calculate commission for expert when learner completes quiz
 * Formula (from SRS 4.1.2):
 * - Validated set by expert: 10% of learner's subscription fee per quiz attempt
 * - Expert-created published set: 20% of subscription fee per attempt
 */
async function calculateQuizCommission(payload) {
  const { quizAttemptId, userId, setId } = payload;

  logger.info({ quizAttemptId, setId }, 'Calculating commission for quiz attempt');

  try {
    // 1. Get quiz attempt and question set
    const quizAttempt = await quizAttemptsRepo.findById(quizAttemptId);
    const questionSet = await questionSetsRepo.findById(setId);

    if (!quizAttempt || !questionSet) {
      logger.warn({ quizAttemptId, setId }, 'Quiz attempt or question set not found');
      return;
    }

    // 2. Determine commission type and expert
    let expertId = null;
    let commissionType = null;
    let commissionRate = 0;

    // Check if set was validated by expert
    const validation = await validationRepo.findOne({
      setId,
      status: 'Completed',
      decision: 'Approved',
    });

    if (validation && questionSet.status === 'Validated') {
      // Validated by expert
      expertId = validation.expertId;
      commissionType = 'QuizAttempt';
      commissionRate = 0.1; // 10%
    } else if (
      questionSet.status === 'Published' &&
      questionSet.creatorId.toString() !== userId
    ) {
      // Expert-created published set (check if creator is Expert)
      const UsersRepository = require('../repositories/users.repository');
      const usersRepo = new UsersRepository();
      const creator = await usersRepo.findById(questionSet.creatorId);

      if (creator && creator.role === 'Expert') {
        expertId = creator._id;
        commissionType = 'QuizAttempt';
        commissionRate = 0.2; // 20%
      }
    }

    if (!expertId) {
      logger.info({ setId }, 'No commission applicable for this quiz attempt');
      return;
    }

    // 3. Calculate commission amount
    // Get learner's subscription
    const UserSubscriptionsRepository = require('../repositories/userSubscriptions.repository');
    const subscriptionsRepo = new UserSubscriptionsRepository();

    const subscription = await subscriptionsRepo.findOne({
      userId,
      status: 'Active',
    });

    if (!subscription) {
      logger.warn({ userId }, 'User has no active subscription');
      return;
    }

    // Get subscription plan to get price
    const SubscriptionPlansRepository = require('../repositories/subscriptionPlans.repository');
    const plansRepo = new SubscriptionPlansRepository();
    const plan = await plansRepo.findById(subscription.planId);

    const commissionAmount = Math.round(plan.price * commissionRate);

    // 4. Check if commission already exists
    const existing = await commissionRepo.findOne({
      expertId,
      relatedEntityId: quizAttemptId,
      relatedEntityType: 'QuizAttempt',
    });

    if (existing) {
      logger.info({ quizAttemptId }, 'Commission already exists');
      return;
    }

    // 5. Create commission record
    await commissionRepo.create({
      expertId,
      type: commissionType,
      relatedEntityId: quizAttemptId,
      relatedEntityType: 'QuizAttempt',
      amount: commissionAmount,
      status: 'Pending',
      description: `Quiz attempt commission (${commissionRate * 100}%) for set: ${questionSet.title}`,
    });

    logger.info(
      {
        expertId: expertId.toString(),
        amount: commissionAmount,
        rate: commissionRate,
      },
      'Commission record created for quiz attempt'
    );

    // 6. Update expert's total commission (optional)
    // This could be done in a separate aggregation job
  } catch (error) {
    logger.error(
      { quizAttemptId, error: error.message },
      'Failed to calculate quiz commission'
    );
    throw error;
  }
}

module.exports = {
  calculateQuizCommission,
};
```

**Trigger from quiz submission:**

```javascript
// In src/controllers/quizAttempts.controller.js - submit method
// After saving quiz attempt...

// Publish event for commission calculation
await this.eventBus.publish('quiz.completed', {
  quizAttemptId: attempt._id.toString(),
  userId: req.user.id,
  setId,
});
```

---

### 2.6. Commission Records API

**Controller:** `src/controllers/commissionRecords.controller.js`

```javascript
const CommissionRecordsService = require('../services/commissionRecords.service');

class CommissionRecordsController {
  constructor({ commissionRecordsService }) {
    this.service = commissionRecordsService;
  }

  /**
   * GET /commission-records/me
   * Get expert's commission records
   */
  async me(req, res, next) {
    try {
      const expertId = req.user.id;
      const { page = 1, pageSize = 20, status } = req.query;

      const result = await this.service.getExpertCommissions(expertId, {
        page: parseInt(page),
        pageSize: parseInt(pageSize),
        status,
      });

      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /commission-records/me/summary
   * Get expert's commission summary
   */
  async summary(req, res, next) {
    try {
      const expertId = req.user.id;
      const summary = await this.service.getCommissionSummary(expertId);
      res.status(200).json(summary);
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /commission-records/:id/paid
   * Admin marks commission as paid
   */
  async markPaid(req, res, next) {
    try {
      const { id } = req.params;
      const { paymentMethod, transactionId } = req.body;

      const record = await this.service.markAsPaid(id, {
        paymentMethod,
        transactionId,
      });

      res.status(200).json(record);
    } catch (error) {
      next(error);
    }
  }
}

module.exports = CommissionRecordsController;
```

**Service:** `src/services/commissionRecords.service.js`

```javascript
class CommissionRecordsService {
  constructor({ commissionRecordsRepository }) {
    this.repository = commissionRecordsRepository;
  }

  async getExpertCommissions(expertId, options) {
    const { page, pageSize, status } = options;

    const filter = { expertId };
    if (status) {
      filter.status = status;
    }

    const skip = (page - 1) * pageSize;

    const records = await this.repository.find(filter, {
      skip,
      limit: pageSize,
      sort: { createdAt: -1 },
    });

    const total = await this.repository.count(filter);

    return {
      items: records.map(this.mapToDTO),
      meta: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  async getCommissionSummary(expertId) {
    const CommissionRecord = require('../models/commissionRecord.model');

    const summary = await CommissionRecord.aggregate([
      { $match: { expertId: expertId } },
      {
        $group: {
          _id: '$status',
          total: { $sum: '$amount' },
          count: { $sum: 1 },
        },
      },
    ]);

    const result = {
      totalEarned: 0,
      totalPending: 0,
      totalPaid: 0,
      countPending: 0,
      countPaid: 0,
    };

    summary.forEach((item) => {
      if (item._id === 'Pending') {
        result.totalPending = item.total;
        result.countPending = item.count;
      } else if (item._id === 'Paid') {
        result.totalPaid = item.total;
        result.countPaid = item.count;
      }
    });

    result.totalEarned = result.totalPending + result.totalPaid;

    return result;
  }

  async markAsPaid(id, data) {
    const record = await this.repository.update(id, {
      status: 'Paid',
      paidAt: new Date(),
      paymentMethod: data.paymentMethod,
      transactionId: data.transactionId,
    });

    return this.mapToDTO(record);
  }

  mapToDTO(record) {
    return {
      id: record._id.toString(),
      expertId: record.expertId.toString(),
      type: record.type,
      amount: record.amount,
      status: record.status,
      description: record.description,
      relatedEntityType: record.relatedEntityType,
      relatedEntityId: record.relatedEntityId?.toString(),
      paidAt: record.paidAt,
      paymentMethod: record.paymentMethod,
      transactionId: record.transactionId,
      createdAt: record.createdAt,
    };
  }
}

module.exports = CommissionRecordsService;
```

---

## 3️⃣ Remove All Stubs

### 3.1. LLM Mode - Real Only

**File:** `src/adapters/llmClient.js`

Remove stub logic:

```javascript
// BEFORE:
async generateQuestions(input) {
  const mode = process.env.LLM_MODE || "stub";
  // ...
  if (mode === "stub" || !this.config.apiKey) {
    // Return stub questions
  }
  // ...
}

// AFTER:
async generateQuestions(input) {
  if (!this.config.apiKey) {
    throw new Error('LLM API key not configured');
  }
  // Only real implementation
  const safeContext = String(contextText).slice(0, 20000);
  // ... actual API call
}
```

**Environment:**

```env
# Remove these:
# LLM_MODE=stub|real

# Keep only:
GEMINI_API_KEY=your-real-key
GEMINI_MODEL=gemini-2.5-flash
```

---

### 3.2. Remove Feature Flags

**File:** `src/config/env.js`

Remove stub mode flags:

```javascript
// REMOVE:
authMode: process.env.AUTH_MODE || "stub",
llmMode: process.env.LLM_MODE || "stub",
queueMode: process.env.QUEUE_MODE || "stub",
paymentMode: process.env.PAYMENT_MODE || "stub",

// All modes are now REAL only
```

---

### 3.3. Remove NotImplemented Errors

Search và replace tất cả:

```bash
# Find all NotImplemented
grep -r "NotImplemented" src/

# Replace với actual implementation
```

**File:** `src/controllers/webhooks.controller.js`

```javascript
// BEFORE:
async stripe(req, res, next) {
  throw Object.assign(new Error("NotImplemented"), { status: 501 });
}

// AFTER:
async stripe(req, res, next) {
  // Actual Stripe webhook handling if needed
  // Or remove if not using Stripe
  res.status(200).send('OK');
}
```

---

## ✅ Acceptance Criteria - Phase 1 Complete

### Subscription System
- [ ] Plans CRUD working
- [ ] User subscriptions working
- [ ] Entitlement limits enforced
- [ ] Background jobs running
- [ ] Zero stub implementations

### Expert Workflow
- [ ] Validation request creates real ValidationRequest
- [ ] Expert assignment algorithm working
- [ ] Review completion working
- [ ] Commission calculation accurate
- [ ] Commission records API working

### Remove Stubs
- [ ] LLM_MODE removed, real only
- [ ] AUTH_MODE removed, real only
- [ ] QUEUE_MODE removed, real only
- [ ] All NotImplemented errors resolved

### Testing
- [ ] Unit tests ≥ 85%
- [ ] Integration tests for all flows
- [ ] E2E test for subscription → validation → commission flow

---

**Timeline:** 3 tuần  
**Next:** Phase 2 - Admin & Management Tools
