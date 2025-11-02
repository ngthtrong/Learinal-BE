# Phase 2: Expert Workflow - Validation & Commission

**Priority:** HIGH  
**Estimated Time:** 2 tuần  
**Dependencies:** Email infrastructure ready ✅, Need Phase 1 (Subscription entitlements)

---

## 🎯 Tổng quan

**Infrastructure Đã Có (Production Ready):** ✅
- ✅ SendGrid email integration (working in production)
- ✅ Email verification flow (tested)
- ✅ EmailClient adapter complete
- ✅ Redis queue system (BullMQ working)
- ✅ Worker process running
- ✅ Models: `ValidationRequest`, `CommissionRecord` complete

**Cần Implement (Missing 70%):**
- ❌ Real validation request logic (replace stub 202)
- ❌ Expert auto-assignment worker (`review.assigned.js` NotImplemented)
- ❌ Review completion workflow (`review.completed.js` NotImplemented)
- ❌ Email notification templates (validation assigned/completed)
- ❌ Commission calculation logic
- ❌ Commission records API

**Hoàn thiện workflow cho Chuyên gia (Expert):**
1. Nhận yêu cầu validation từ Learner
2. Tự động assignment cho Expert phù hợp
3. Review và approve/reject question sets
4. Tính toán commission theo công thức SRS
5. Payment management cho Expert

---

## ✅ Đã Hoàn Thành (Skip Implementation)

### Email Infrastructure - WORKING ✅

**File:** `src/adapters/emailClient.js`

**Tính năng đã có:**
```javascript
// ✅ SendGrid integration
const sgMail = require("@sendgrid/mail");
sgMail.setApiKey(this.config.sendgridApiKey);

// ✅ Send with template
const msg = {
  to,
  from: this.config.fromAddress,
  templateId, // SendGrid template ID
  dynamicTemplateData: variables,
};
await sgMail.send(msg);

// ✅ Fallback HTML if no template
msg.html = this.buildHtml(templateId, variables);
```

**Config required:**
```bash
EMAIL_PROVIDER=sendgrid
SENDGRID_API_KEY=SG.xxxxx
EMAIL_FROM=no-reply@learinal.app
```

**Current templates working:**
- ✅ Email verification (`EMAIL_VERIFY_TEMPLATE_ID`)
- ✅ Password reset (`PASSWORD_RESET_TEMPLATE_ID`)

**New templates needed:**
- ❌ Validation assigned to Expert
- ❌ Validation completed to Learner
- ❌ Commission earned notification

---

## 1. Request Validation Endpoint (NEW IMPLEMENTATION NEEDED)

### 1.1. Controller Update

**File:** `src/controllers/questionSets.controller.js`

Thay thế implementation hiện tại (stub 202) bằng real logic:

```javascript
async requestReview(req, res, next) {
  try {
    const { id: setId } = req.params;
    const userId = req.user.id;

    // 1. Validate ownership
    const questionSet = await this.questionSetsRepo.findById(setId);
    if (!questionSet || questionSet.userId.toString() !== userId) {
      return res.status(404).json({
        code: 'NotFound',
        message: 'Question set not found',
      });
    }

    // 2. Check if already has pending/assigned validation request
    const existingRequest = await this.validationRequestsRepo.findOne({
      setId,
      status: { $in: ['PendingAssignment', 'Assigned'] },
    });

    if (existingRequest) {
      return res.status(409).json({
        code: 'Conflict',
        message: 'Validation request already exists for this question set',
        details: {
          requestId: existingRequest._id.toString(),
          status: existingRequest.status,
        },
      });
    }

    // 3. Check subscription entitlement (already done by middleware)

    // 4. Create validation request
    const validationRequest = await this.validationRequestsRepo.create({
      setId,
      learnerId: userId,
      status: 'PendingAssignment',
      requestTime: new Date(),
    });

    // 5. Enqueue assignment job
    await this.eventBus.publish('validation.requested', {
      requestId: validationRequest._id.toString(),
      setId,
      learnerId: userId,
    });

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

## 2. Expert Assignment Worker

### 2.1. Job Implementation

**File:** `src/jobs/review.assigned.js`

Thay thế `throw new Error('NotImplemented')`:

```javascript
const ValidationRequestsRepository = require('../repositories/validationRequests.repository');
const QuestionSetsRepository = require('../repositories/questionSets.repository');
const SubjectsRepository = require('../repositories/subjects.repository');
const UsersRepository = require('../repositories/users.repository');
const { enqueueEmail } = require('../adapters/queue');
const logger = require('../utils/logger');

const validationRequestsRepo = new ValidationRequestsRepository();
const questionSetsRepo = new QuestionSetsRepository();
const subjectsRepo = new SubjectsRepository();
const usersRepo = new UsersRepository();

async function assignExpertToValidationRequest(event) {
  const { requestId, setId } = event;

  logger.info({ requestId }, 'Assigning expert to validation request');

  try {
    // 1. Find available Expert
    const expert = await findAvailableExpert();

    if (!expert) {
      logger.warn({ requestId }, 'No expert available for assignment');
      // Will retry later
      throw new Error('No expert available');
    }

    // 2. Assign to expert
    await validationRequestsRepo.update(requestId, {
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
      },
      'Validation request assigned'
    );

    // 4. Send notification email to Expert
    const questionSet = await questionSetsRepo.findById(setId);
    const subject = await subjectsRepo.findById(
      questionSet.subjectId.toString()
    );

    await enqueueEmail({
      to: expert.email,
      templateId: 'validationAssigned',
      variables: {
        expertName: expert.fullName,
        setTitle: questionSet.title,
        subjectName: subject?.subjectName || 'Unknown',
        numQuestions: questionSet.questions.length,
        reviewLink: `${process.env.APP_BASE_URL}/expert/validation-requests/${requestId}`,
      },
    });

    logger.info({ expertEmail: expert.email }, 'Notification email sent');
  } catch (error) {
    logger.error(
      {
        requestId,
        error: error.message,
      },
      'Failed to assign validation request'
    );

    throw error; // Will retry
  }
}

/**
 * Find available Expert using "least loaded" strategy
 */
async function findAvailableExpert() {
  // Get all active Experts
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
      const activeCount = await validationRequestsRepo.count({
        expertId: expert._id,
        status: 'Assigned',
      });
      return { expert, activeCount };
    })
  );

  // Sort by load (ascending) - expert with least assignments first
  expertsWithLoad.sort((a, b) => a.activeCount - b.activeCount);

  // Return expert with least load
  return expertsWithLoad[0].expert;
}

module.exports = {
  assignExpertToValidationRequest,
};
```

---

## 3. Review Completion Workflow

### 3.1. ValidationRequests Controller Update

**File:** `src/controllers/validationRequests.controller.js`

Thêm endpoint complete validation:

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

    // 1. Validate request ownership
    const request = await this.validationRequestsRepo.findById(requestId);
    
    if (!request || request.expertId.toString() !== expertId) {
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

    await this.validationRequestsRepo.update(requestId, updateData);

    // 4. Update question set
    const questionSet = await this.questionSetsRepo.findById(
      request.setId.toString()
    );

    if (decision === 'Approved') {
      // Apply corrections if provided
      const finalQuestions = correctedQuestions || questionSet.questions;

      await this.questionSetsRepo.update(request.setId.toString(), {
        status: 'Validated',
        questions: finalQuestions,
      });
    } else {
      // Rejected - back to Draft
      await this.questionSetsRepo.update(request.setId.toString(), {
        status: 'Draft',
      });
    }

    // 5. Emit event for commission calculation (if approved)
    if (decision === 'Approved') {
      await this.eventBus.publish('validation.completed', {
        validationRequestId: requestId,
        expertId,
        setId: request.setId.toString(),
        decision,
      });
    }

    // 6. Send notification to Learner
    const learner = await this.usersRepo.findById(request.learnerId.toString());

    await this.eventBus.publish('email.send', {
      to: learner.email,
      templateId: 'validationCompleted',
      variables: {
        learnerName: learner.fullName,
        setTitle: questionSet.title,
        status: decision === 'Approved' ? 'approved' : 'rejected',
        feedback,
        setLink: `${process.env.APP_BASE_URL}/question-sets/${request.setId}`,
      },
    });

    res.status(200).json({
      id: requestId,
      status: updateData.status,
      decision,
      completionTime: updateData.completionTime,
    });
  } catch (error) {
    next(error);
  }
}
```

### 3.2. Routes Update

```javascript
// src/routes/validationRequests.routes.js

router.patch(
  '/:id/complete',
  authenticateJWT,
  authorizeRole('Expert'),
  inputValidation(completeValidationSchema),
  controller.complete
);

// Validation schema
const completeValidationSchema = Joi.object({
  params: Joi.object({
    id: Joi.string().required(),
  }),
  body: Joi.object({
    decision: Joi.string().valid('Approved', 'Rejected').required(),
    feedback: Joi.string().max(2000).optional(),
    correctedQuestions: Joi.array().optional(),
  }),
});
```

---

## 4. Commission Calculation System

### 4.1. Commission Worker

**File:** `src/jobs/commission.calculate.js`

Implement công thức từ SRS 4.1.2:

```javascript
const CommissionRecordsRepository = require('../repositories/commissionRecords.repository');
const QuizAttemptsRepository = require('../repositories/quizAttempts.repository');
const ValidationRequestsRepository = require('../repositories/validationRequests.repository');
const QuestionSetsRepository = require('../repositories/questionSets.repository');
const UsersRepository = require('../repositories/users.repository');
const logger = require('../utils/logger');

const commissionsRepo = new CommissionRecordsRepository();
const attemptsRepo = new QuizAttemptsRepository();
const validationRequestsRepo = new ValidationRequestsRepository();
const questionSetsRepo = new QuestionSetsRepository();
const usersRepo = new UsersRepository();

// Configuration (should be in database or config)
const COMMISSION_CONFIG = {
  commissionPoolRate: 0.3, // 30% of revenue
  ratePublished: 0.4, // 40% of per-attempt unit
  rateValidated: 0.2, // 20% of per-attempt unit
  entitlementDays: 180, // 6 months
};

async function calculateCommissionForAttempt(event) {
  const { attemptId, expertId, setId } = event;

  logger.info({ attemptId, expertId }, 'Calculating commission');

  try {
    // 1. Get quiz attempt
    const attempt = await attemptsRepo.findById(attemptId);
    if (!attempt || !attempt.isCompleted) {
      throw new Error('Invalid quiz attempt');
    }

    // 2. Get user subscription info
    const user = await usersRepo.findById(attempt.userId.toString());
    if (user.subscriptionStatus !== 'Active') {
      logger.info(
        { attemptId },
        'User not premium - no commission'
      );
      return; // No commission for free users
    }

    // 3. Get question set
    const questionSet = await questionSetsRepo.findById(setId);

    // 4. Determine commission type and expert
    let commissionExpert;
    let commissionRate;
    let commissionType;

    if (questionSet.status === 'Published' && questionSet.userId.toString() === expertId) {
      // Expert-created content
      commissionExpert = expertId;
      commissionRate = COMMISSION_CONFIG.ratePublished;
      commissionType = 'Published';
    } else if (questionSet.status === 'Validated') {
      // Validated content - find validator
      const validation = await validationRequestsRepo.findOne({
        setId,
        status: 'Completed',
        decision: 'Approved',
      });

      if (validation) {
        // Check if still within entitlement period
        const daysSinceValidation = Math.floor(
          (Date.now() - validation.completionTime.getTime()) / (1000 * 60 * 60 * 24)
        );

        if (daysSinceValidation <= COMMISSION_CONFIG.entitlementDays) {
          commissionExpert = validation.expertId.toString();
          commissionRate = COMMISSION_CONFIG.rateValidated;
          commissionType = 'Validated';
        }
      }
    }

    if (!commissionExpert) {
      logger.info({ attemptId }, 'No commission applicable');
      return;
    }

    // 5. Calculate commission amount
    // Simplified formula: base rate per question
    const baseRatePerQuestion = 1000; // VND (should be configurable)
    const numQuestions = questionSet.questions.length;
    const perAttemptUnit = numQuestions * baseRatePerQuestion;
    const commissionAmount = perAttemptUnit * commissionRate;

    // 6. Create commission record
    await commissionsRepo.create({
      expertId: commissionExpert,
      attemptId,
      setId,
      commissionAmount,
      commissionType,
      transactionDate: new Date(),
      status: 'Pending',
    });

    logger.info(
      {
        expertId: commissionExpert,
        setId,
        amount: commissionAmount,
        type: commissionType,
      },
      'Commission calculated'
    );

    // 7. Notify expert
    const expert = await usersRepo.findById(commissionExpert);
    await require('../adapters/queue').enqueueEmail({
      to: expert.email,
      templateId: 'commissionEarned',
      variables: {
        expertName: expert.fullName,
        amount: commissionAmount,
        setTitle: questionSet.title,
        type: commissionType,
      },
    });
  } catch (error) {
    logger.error(
      {
        attemptId,
        error: error.message,
      },
      'Commission calculation failed'
    );

    throw error;
  }
}

module.exports = {
  calculateCommissionForAttempt,
};
```

### 4.2. Trigger Commission Calculation

Update quiz attempt submission để trigger commission:

```javascript
// src/controllers/quizAttempts.controller.js

async submit(req, res, next) {
  try {
    // ... existing scoring logic ...

    // Trigger commission calculation if set is validated
    const questionSet = await this.questionSetsRepo.findById(
      attempt.setId.toString()
    );

    if (['Validated', 'Published'].includes(questionSet.status)) {
      await this.eventBus.publish('quiz.completed', {
        attemptId: attempt._id.toString(),
        setId: questionSet._id.toString(),
        userId: userId,
      });
    }

    // ... rest of response ...
  } catch (error) {
    next(error);
  }
}
```

---

## 5. Commission Records API

### 5.1. Controller Implementation

**File:** `src/controllers/commissionRecords.controller.js`

```javascript
const CommissionRecordsRepository = require('../repositories/commissionRecords.repository');
const UsersRepository = require('../repositories/users.repository');

class CommissionRecordsController {
  constructor(commissionsRepo, usersRepo) {
    this.commissionsRepo = commissionsRepo;
    this.usersRepo = usersRepo;
  }

  /**
   * GET /commission-records
   * Expert view - my commissions
   */
  async list(req, res, next) {
    try {
      const expertId = req.user.id;
      const page = Math.max(1, parseInt(req.query.page || '1', 10));
      const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize || '20', 10)));

      const { items, totalItems, totalPages } = await this.commissionsRepo.paginate(
        { expertId },
        { page, pageSize, sort: { transactionDate: -1 } }
      );

      const mapped = items.map((record) => ({
        id: record._id.toString(),
        setId: record.setId.toString(),
        attemptId: record.attemptId.toString(),
        amount: record.commissionAmount,
        type: record.commissionType,
        status: record.status,
        transactionDate: record.transactionDate,
      }));

      res.status(200).json({
        items: mapped,
        meta: {
          page,
          pageSize,
          total: totalItems,
          totalPages,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /commission-records/summary
   * Expert commission summary
   */
  async summary(req, res, next) {
    try {
      const expertId = req.user.id;

      // Calculate totals
      const records = await this.commissionsRepo.find({ expertId });

      const totalEarned = records.reduce(
        (sum, r) => sum + r.commissionAmount,
        0
      );

      const pendingAmount = records
        .filter((r) => r.status === 'Pending')
        .reduce((sum, r) => sum + r.commissionAmount, 0);

      const paidAmount = records
        .filter((r) => r.status === 'Paid')
        .reduce((sum, r) => sum + r.commissionAmount, 0);

      res.status(200).json({
        totalEarned,
        pendingAmount,
        paidAmount,
        recordCount: records.length,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /admin/commission-records
   * Admin view - all commissions
   */
  async listAll(req, res, next) {
    try {
      const page = Math.max(1, parseInt(req.query.page || '1', 10));
      const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize || '20', 10)));
      const status = req.query.status; // Filter by status

      const filter = status ? { status } : {};

      const { items, totalItems, totalPages } = await this.commissionsRepo.paginate(
        filter,
        { page, pageSize, sort: { transactionDate: -1 } }
      );

      // Populate expert details
      const mapped = await Promise.all(
        items.map(async (record) => {
          const expert = await this.usersRepo.findById(
            record.expertId.toString()
          );

          return {
            id: record._id.toString(),
            expertId: record.expertId.toString(),
            expertName: expert?.fullName || 'Unknown',
            expertEmail: expert?.email,
            setId: record.setId.toString(),
            amount: record.commissionAmount,
            type: record.commissionType,
            status: record.status,
            transactionDate: record.transactionDate,
          };
        })
      );

      res.status(200).json({
        items: mapped,
        meta: {
          page,
          pageSize,
          total: totalItems,
          totalPages,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /admin/commission-records/:id/mark-paid
   * Admin marks commission as paid
   */
  async markPaid(req, res, next) {
    try {
      const { id } = req.params;
      const { paymentDetails } = req.body;

      const record = await this.commissionsRepo.findById(id);

      if (!record) {
        return res.status(404).json({
          code: 'NotFound',
          message: 'Commission record not found',
        });
      }

      if (record.status === 'Paid') {
        return res.status(400).json({
          code: 'AlreadyPaid',
          message: 'Commission already marked as paid',
        });
      }

      await this.commissionsRepo.update(id, {
        status: 'Paid',
        paidAt: new Date(),
        paymentDetails,
      });

      // Notify expert
      const expert = await this.usersRepo.findById(
        record.expertId.toString()
      );

      await require('../adapters/queue').enqueueEmail({
        to: expert.email,
        templateId: 'commissionPaid',
        variables: {
          expertName: expert.fullName,
          amount: record.commissionAmount,
          transactionDate: record.transactionDate.toISOString().split('T')[0],
        },
      });

      res.status(200).json({
        id,
        status: 'Paid',
        paidAt: new Date(),
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = CommissionRecordsController;
```

### 5.2. Routes

**File:** `src/routes/commissionRecords.routes.js`

```javascript
const express = require('express');
const CommissionRecordsController = require('../controllers/commissionRecords.controller');
const CommissionRecordsRepository = require('../repositories/commissionRecords.repository');
const UsersRepository = require('../repositories/users.repository');
const authenticateJWT = require('../middleware/authenticateJWT');
const authorizeRole = require('../middleware/authorizeRole');

const router = express.Router();

const commissionsRepo = new CommissionRecordsRepository();
const usersRepo = new UsersRepository();
const controller = new CommissionRecordsController(commissionsRepo, usersRepo);

// Expert endpoints
router.get(
  '/',
  authenticateJWT,
  authorizeRole('Expert'),
  (req, res, next) => controller.list(req, res, next)
);

router.get(
  '/summary',
  authenticateJWT,
  authorizeRole('Expert'),
  (req, res, next) => controller.summary(req, res, next)
);

// Admin endpoints
router.get(
  '/admin/all',
  authenticateJWT,
  authorizeRole('Admin'),
  (req, res, next) => controller.listAll(req, res, next)
);

router.patch(
  '/:id/mark-paid',
  authenticateJWT,
  authorizeRole('Admin'),
  (req, res, next) => controller.markPaid(req, res, next)
);

module.exports = router;
```

---

## 6. Expert Dashboard Features

### 6.1. Expert Statistics Endpoint

```javascript
// src/controllers/expert.controller.js (new file)

class ExpertController {
  async getStats(req, res, next) {
    try {
      const expertId = req.user.id;

      // Validation requests stats
      const pendingValidations = await this.validationRequestsRepo.count({
        expertId,
        status: 'Assigned',
      });

      const completedValidations = await this.validationRequestsRepo.count({
        expertId,
        status: 'Completed',
      });

      // Commission stats
      const commissions = await this.commissionsRepo.find({ expertId });
      const totalEarned = commissions.reduce(
        (sum, c) => sum + c.commissionAmount,
        0
      );
      const pendingEarnings = commissions
        .filter((c) => c.status === 'Pending')
        .reduce((sum, c) => sum + c.commissionAmount, 0);

      res.status(200).json({
        validations: {
          pending: pendingValidations,
          completed: completedValidations,
        },
        earnings: {
          total: totalEarned,
          pending: pendingEarnings,
          paid: totalEarned - pendingEarnings,
        },
      });
    } catch (error) {
      next(error);
    }
  }
}
```

---

## 7. Email Templates

### 7.1. Validation Assigned Template

```javascript
// templates/validationAssigned.js

module.exports = {
  subject: 'New Validation Request Assigned',
  html: (vars) => `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h1>New Validation Request</h1>
      <p>Hi ${vars.expertName},</p>
      <p>A new question set has been assigned to you for review.</p>
      
      <div style="background: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0;">
        <h3>${vars.setTitle}</h3>
        <ul>
          <li><strong>Subject:</strong> ${vars.subjectName}</li>
          <li><strong>Number of Questions:</strong> ${vars.numQuestions}</li>
        </ul>
      </div>
      
      <a href="${vars.reviewLink}" style="display: inline-block; padding: 12px 24px; background: #007bff; color: white; text-decoration: none; border-radius: 4px;">
        Start Review
      </a>
      
      <p style="color: #666; font-size: 14px; margin-top: 30px;">
        Please complete the review within 48 hours to maintain your response time rating.
      </p>
    </div>
  `,
};
```

### 7.2. Commission Earned Template

```javascript
// templates/commissionEarned.js

module.exports = {
  subject: 'Commission Earned',
  html: (vars) => `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h1>💰 Commission Earned!</h1>
      <p>Hi ${vars.expertName},</p>
      <p>You've earned a commission for the following question set:</p>
      
      <div style="background: #e8f5e9; padding: 15px; border-radius: 5px; margin: 20px 0;">
        <h3>${vars.setTitle}</h3>
        <p style="font-size: 24px; font-weight: bold; color: #2e7d32;">
          ${vars.amount.toLocaleString('vi-VN')} VND
        </p>
        <p style="color: #666;">
          Type: ${vars.type === 'Published' ? 'Expert-Created Content' : 'Validated Content'}
        </p>
      </div>
      
      <p style="color: #666; font-size: 14px;">
        This amount will be included in your next payment cycle.
      </p>
    </div>
  `,
};
```

---

## 8. Testing

### 8.1. Unit Tests

```javascript
// tests/unit/jobs/review.assigned.test.js

describe('Expert Assignment', () => {
  it('should assign to expert with least load', async () => {
    // Setup experts with different loads
    const expert1 = await User.create({ role: 'Expert', /* ... */ });
    const expert2 = await User.create({ role: 'Expert', /* ... */ });

    // Expert 1 has 3 active requests
    await ValidationRequest.create([
      { expertId: expert1._id, status: 'Assigned' },
      { expertId: expert1._id, status: 'Assigned' },
      { expertId: expert1._id, status: 'Assigned' },
    ]);

    // Expert 2 has 1 active request
    await ValidationRequest.create([
      { expertId: expert2._id, status: 'Assigned' },
    ]);

    const assigned = await findAvailableExpert();

    expect(assigned._id).toEqual(expert2._id);
  });
});
```

### 8.2. Integration Tests

```javascript
// tests/integration/validation-workflow.test.js

describe('Validation Workflow', () => {
  it('should complete full workflow', async () => {
    // 1. Create question set
    const questionSet = await QuestionSet.create(/* ... */);

    // 2. Request validation
    const reqRes = await request(app)
      .post(`/api/v1/question-sets/${questionSet._id}/review`)
      .set('Authorization', `Bearer ${learnerToken}`)
      .expect(202);

    expect(reqRes.body.status).toBe('PendingAssignment');

    // 3. Process assignment job
    await assignExpertToValidationRequest({
      requestId: reqRes.body.id,
      setId: questionSet._id.toString(),
    });

    // 4. Expert completes review
    const completeRes = await request(app)
      .patch(`/api/v1/validation-requests/${reqRes.body.id}/complete`)
      .set('Authorization', `Bearer ${expertToken}`)
      .send({
        decision: 'Approved',
        feedback: 'Great questions!',
      })
      .expect(200);

    expect(completeRes.body.decision).toBe('Approved');

    // 5. Verify question set updated
    const updated = await QuestionSet.findById(questionSet._id);
    expect(updated.status).toBe('Validated');

    // 6. Verify commission record created (async)
    await new Promise((resolve) => setTimeout(resolve, 100));
    
    const commission = await CommissionRecord.findOne({
      setId: questionSet._id,
    });
    
    expect(commission).toBeDefined();
    expect(commission.status).toBe('Pending');
  });
});
```

---

## Checklist

### Implementation
- [ ] Request validation endpoint (real logic)
- [ ] Expert assignment worker
- [ ] Review completion endpoint
- [ ] Commission calculation worker
- [ ] Commission records API (Expert + Admin)
- [ ] Expert dashboard stats endpoint
- [ ] Email templates

### Testing
- [ ] Unit tests for assignment logic
- [ ] Unit tests for commission calculation
- [ ] Integration tests for full workflow
- [ ] E2E test: Learner → Expert → Commission
- [ ] Load testing for expert assignment

### Documentation
- [ ] Expert onboarding guide
- [ ] Commission calculation documentation
- [ ] API documentation updated
- [ ] Admin payment workflow guide

### Production Readiness
- [ ] Commission calculation cron job
- [ ] Expert performance monitoring
- [ ] Commission reconciliation reports
- [ ] Error tracking for failed assignments
- [ ] SLA monitoring (48h review time)

---

## Next Steps

Sau khi hoàn thành Phase 2, tiếp tục với:
- **Phase 3:** Content Processing (Document & Question Generation)
