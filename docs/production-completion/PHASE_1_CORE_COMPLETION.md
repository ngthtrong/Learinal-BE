# Phase 1: Core Business Logic Completion

**Timeline:** 3 tuần  
**Priority:** CRITICAL  
**Dependencies:** None (infrastructure already complete)

---

## 📋 Tổng quan

Phase này tập trung vào hoàn thiện **logic nghiệp vụ cốt lõi** còn thiếu:

### ✅ Đã hoàn thành (skip)
- OAuth & JWT authentication
- Email infrastructure (SendGrid)
- Document processing pipeline
- Queue system (Redis + BullMQ)
- Payment webhook (SePay)
- Basic CRUD operations

### 🔴 Cần hoàn thành
1. **Subscription System** (2 tuần)
   - Plans management
   - User subscriptions
   - Entitlement enforcement
   - Background jobs

2. **Expert Workflow** (1.5 tuần)
   - Validation request handling
   - Expert assignment algorithm
   - Review completion
   - Commission calculation

3. **Remove All Stubs** (0.5 tuần)
   - LLM mode = real only
   - Remove mock implementations
   - Real error handling

---

## 1️⃣ Subscription System (CRITICAL)

### 1.1. Subscription Plans CRUD

**File:** `src/controllers/subscriptionPlans.controller.js`

#### Implementation

```javascript
const SubscriptionPlansService = require('../services/subscriptionPlans.service');

class SubscriptionPlansController {
  constructor({ subscriptionPlansService }) {
    this.service = subscriptionPlansService;
  }

  /**
   * GET /subscription-plans
   * Public - List active subscription plans
   */
  async list(req, res, next) {
    try {
      const plans = await this.service.listActivePlans();
      res.status(200).json(plans);
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /subscription-plans
   * Admin only - Create new plan
   */
  async create(req, res, next) {
    try {
      const plan = await this.service.createPlan(req.body);
      res.status(201).json(plan);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /subscription-plans/:id
   * Public - Get plan details
   */
  async get(req, res, next) {
    try {
      const plan = await this.service.getPlanById(req.params.id);
      if (!plan) {
        return res.status(404).json({
          code: 'NotFound',
          message: 'Subscription plan not found',
        });
      }
      res.status(200).json(plan);
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /subscription-plans/:id
   * Admin only - Update plan
   */
  async update(req, res, next) {
    try {
      const plan = await this.service.updatePlan(req.params.id, req.body);
      if (!plan) {
        return res.status(404).json({
          code: 'NotFound',
          message: 'Subscription plan not found',
        });
      }
      res.status(200).json(plan);
    } catch (error) {
      next(error);
    }
  }

  /**
   * DELETE /subscription-plans/:id
   * Admin only - Archive plan (soft delete)
   */
  async archive(req, res, next) {
    try {
      await this.service.archivePlan(req.params.id);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  }
}

module.exports = SubscriptionPlansController;
```

**Service:** `src/services/subscriptionPlans.service.js`

```javascript
class SubscriptionPlansService {
  constructor({ subscriptionPlansRepository }) {
    this.repository = subscriptionPlansRepository;
  }

  async listActivePlans() {
    const plans = await this.repository.find({ status: 'Active' });
    return plans.map(this.mapToDTO);
  }

  async createPlan(data) {
    // Validate entitlements structure
    this.validateEntitlements(data.entitlements);
    
    const plan = await this.repository.create({
      planName: data.planName,
      description: data.description,
      billingCycle: data.billingCycle, // 'Monthly' | 'Yearly'
      price: data.price,
      entitlements: data.entitlements,
      status: 'Active',
    });
    
    return this.mapToDTO(plan);
  }

  async getPlanById(id) {
    const plan = await this.repository.findById(id);
    return plan ? this.mapToDTO(plan) : null;
  }

  async updatePlan(id, data) {
    if (data.entitlements) {
      this.validateEntitlements(data.entitlements);
    }
    
    const plan = await this.repository.update(id, data);
    return plan ? this.mapToDTO(plan) : null;
  }

  async archivePlan(id) {
    await this.repository.update(id, { status: 'Archived' });
  }

  validateEntitlements(entitlements) {
    const required = [
      'maxMonthlyTestGenerations',
      'maxValidationRequests',
      'priorityProcessing',
      'shareLimits',
      'maxSubjects',
      'maxDocumentsPerSubject',
      'maxQuestionsPerSet',
    ];
    
    for (const field of required) {
      if (!(field in entitlements)) {
        throw new Error(`Missing required entitlement: ${field}`);
      }
    }

    // Validate values
    if (entitlements.maxMonthlyTestGenerations !== 'unlimited') {
      const val = parseInt(entitlements.maxMonthlyTestGenerations);
      if (isNaN(val) || val < 0) {
        throw new Error('Invalid maxMonthlyTestGenerations');
      }
    }
  }

  mapToDTO(plan) {
    return {
      id: plan._id.toString(),
      planName: plan.planName,
      description: plan.description,
      billingCycle: plan.billingCycle,
      price: plan.price,
      entitlements: plan.entitlements,
      status: plan.status,
      createdAt: plan.createdAt,
      updatedAt: plan.updatedAt,
    };
  }
}

module.exports = SubscriptionPlansService;
```

**Seed script:** `scripts/seed-subscription-plans.js`

```javascript
const mongoose = require('mongoose');
const SubscriptionPlan = require('../src/models/subscriptionPlan.model');
const config = require('../src/config');

const plans = [
  {
    planName: 'Free',
    description: 'Gói miễn phí cơ bản',
    billingCycle: 'Monthly',
    price: 0,
    entitlements: {
      maxMonthlyTestGenerations: 5,
      maxValidationRequests: 0,
      priorityProcessing: false,
      shareLimits: 5,
      maxSubjects: 3,
      maxDocumentsPerSubject: 5,
      maxQuestionsPerSet: 20,
    },
    status: 'Active',
  },
  {
    planName: 'Standard',
    description: 'Gói cơ bản cho người học - 2000đ/tháng',
    billingCycle: 'Monthly',
    price: 2000,
    entitlements: {
      maxMonthlyTestGenerations: 50,
      maxValidationRequests: 5,
      priorityProcessing: false,
      shareLimits: 20,
      maxSubjects: 10,
      maxDocumentsPerSubject: 20,
      maxQuestionsPerSet: 50,
    },
    status: 'Active',
  },
  {
    planName: 'Pro',
    description: 'Gói nâng cao không giới hạn - 5000đ/tháng',
    billingCycle: 'Monthly',
    price: 5000,
    entitlements: {
      maxMonthlyTestGenerations: 'unlimited',
      maxValidationRequests: 20,
      priorityProcessing: true,
      shareLimits: 100,
      maxSubjects: 999,
      maxDocumentsPerSubject: 'unlimited',
      maxQuestionsPerSet: 200,
    },
    status: 'Active',
  },
];

async function seed() {
  try {
    await mongoose.connect(config.mongo.uri);
    console.log('✅ Connected to MongoDB');

    // Clear existing
    await SubscriptionPlan.deleteMany({});
    console.log('🗑️  Cleared existing plans');

    // Insert new
    await SubscriptionPlan.insertMany(plans);
    console.log('✅ Seeded subscription plans');

    await mongoose.disconnect();
  } catch (error) {
    console.error('❌ Seed failed:', error);
    process.exit(1);
  }
}

seed();
```

**Routes:** `src/routes/subscriptionPlans.routes.js`

```javascript
const express = require('express');
const router = express.Router();
const SubscriptionPlansController = require('../controllers/subscriptionPlans.controller');
const SubscriptionPlansService = require('../services/subscriptionPlans.service');
const SubscriptionPlansRepository = require('../repositories/subscriptionPlans.repository');
const { authenticateJWT, authorizeRole } = require('../middleware');

// Dependencies
const repository = new SubscriptionPlansRepository();
const service = new SubscriptionPlansService({ subscriptionPlansRepository: repository });
const controller = new SubscriptionPlansController({ subscriptionPlansService: service });

// Public routes
router.get('/', controller.list.bind(controller));
router.get('/:id', controller.get.bind(controller));

// Admin routes
router.post('/', 
  authenticateJWT, 
  authorizeRole('Admin'), 
  controller.create.bind(controller)
);

router.patch('/:id', 
  authenticateJWT, 
  authorizeRole('Admin'), 
  controller.update.bind(controller)
);

router.delete('/:id', 
  authenticateJWT, 
  authorizeRole('Admin'), 
  controller.archive.bind(controller)
);

module.exports = router;
```

#### Testing

```javascript
// tests/integration/subscriptionPlans.test.js
describe('Subscription Plans API', () => {
  describe('GET /subscription-plans', () => {
    it('should list active plans', async () => {
      const res = await request(app)
        .get('/api/v1/subscription-plans')
        .expect(200);

      expect(res.body).toBeInstanceOf(Array);
      expect(res.body.length).toBeGreaterThan(0);
      expect(res.body[0]).toHaveProperty('planName');
      expect(res.body[0]).toHaveProperty('price');
      expect(res.body[0]).toHaveProperty('entitlements');
    });

    it('should not include archived plans', async () => {
      const res = await request(app)
        .get('/api/v1/subscription-plans')
        .expect(200);

      const archived = res.body.find(p => p.status === 'Archived');
      expect(archived).toBeUndefined();
    });
  });

  describe('POST /subscription-plans', () => {
    it('should create plan (admin)', async () => {
      const res = await request(app)
        .post('/api/v1/subscription-plans')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          planName: 'Enterprise',
          description: 'Enterprise plan',
          billingCycle: 'Yearly',
          price: 50000,
          entitlements: {
            maxMonthlyTestGenerations: 'unlimited',
            maxValidationRequests: 'unlimited',
            priorityProcessing: true,
            shareLimits: 'unlimited',
            maxSubjects: 'unlimited',
            maxDocumentsPerSubject: 'unlimited',
            maxQuestionsPerSet: 500,
          },
        })
        .expect(201);

      expect(res.body).toHaveProperty('id');
      expect(res.body.planName).toBe('Enterprise');
    });

    it('should reject missing entitlements', async () => {
      const res = await request(app)
        .post('/api/v1/subscription-plans')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          planName: 'Invalid',
          price: 1000,
          entitlements: {
            maxMonthlyTestGenerations: 10,
            // missing other required fields
          },
        })
        .expect(400);

      expect(res.body.code).toBe('ValidationError');
    });

    it('should reject non-admin', async () => {
      await request(app)
        .post('/api/v1/subscription-plans')
        .set('Authorization', `Bearer ${learnerToken}`)
        .send({ planName: 'Test' })
        .expect(403);
    });
  });
});
```

---

### 1.2. User Subscriptions API

**Controller:** `src/controllers/userSubscriptions.controller.js`

```javascript
const UserSubscriptionsService = require('../services/userSubscriptions.service');

class UserSubscriptionsController {
  constructor({ userSubscriptionsService }) {
    this.service = userSubscriptionsService;
  }

  /**
   * GET /user-subscriptions/me
   * Get current user subscription history
   */
  async me(req, res, next) {
    try {
      const userId = req.user.id;
      const subscriptions = await this.service.getUserSubscriptions(userId);
      res.status(200).json(subscriptions);
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /subscriptions
   * Create subscription (checkout)
   */
  async create(req, res, next) {
    try {
      const userId = req.user.id;
      const { planId } = req.body;

      const result = await this.service.createSubscription(userId, planId);

      res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /user-subscriptions/:id/cancel
   * Cancel active subscription
   */
  async cancel(req, res, next) {
    try {
      const userId = req.user.id;
      const subscriptionId = req.params.id;

      const subscription = await this.service.cancelSubscription(
        userId,
        subscriptionId
      );

      res.status(200).json(subscription);
    } catch (error) {
      next(error);
    }
  }
}

module.exports = UserSubscriptionsController;
```

**Service:** `src/services/userSubscriptions.service.js`

```javascript
class UserSubscriptionsService {
  constructor({
    userSubscriptionsRepository,
    subscriptionPlansRepository,
    usersRepository,
    paymentClient,
    eventBus,
  }) {
    this.subscriptionsRepo = userSubscriptionsRepository;
    this.plansRepo = subscriptionPlansRepository;
    this.usersRepo = usersRepository;
    this.paymentClient = paymentClient;
    this.eventBus = eventBus;
  }

  async getUserSubscriptions(userId) {
    const subscriptions = await this.subscriptionsRepo.find({ userId });
    return subscriptions.map(this.mapToDTO);
  }

  async createSubscription(userId, planId) {
    // 1. Validate plan exists
    const plan = await this.plansRepo.findById(planId);
    if (!plan || plan.status !== 'Active') {
      throw new Error('Invalid subscription plan');
    }

    // 2. Check if user already has active subscription
    const existing = await this.subscriptionsRepo.findOne({
      userId,
      status: 'Active',
    });

    if (existing) {
      throw new Error('User already has an active subscription');
    }

    // 3. Create pending subscription
    const startDate = new Date();
    const endDate = this.calculateEndDate(startDate, plan.billingCycle);

    const subscription = await this.subscriptionsRepo.create({
      userId,
      planId,
      startDate,
      endDate,
      renewalDate: endDate,
      status: 'PendingPayment',
      entitlementsSnapshot: plan.entitlements,
    });

    // 4. Generate QR code for payment
    const qrData = await this.paymentClient.generateQR({
      amount: plan.price,
      content: `LEARINAL ${plan.planName.toUpperCase()} uid:${userId} sid:${subscription._id}`,
    });

    // 5. Publish event
    await this.eventBus.publish('subscription.created', {
      userId,
      subscriptionId: subscription._id.toString(),
      planName: plan.planName,
      amount: plan.price,
    });

    return {
      ...this.mapToDTO(subscription),
      checkoutUrl: qrData.qrUrl,
      qrCodeData: qrData.qrDataUrl,
      paymentInstructions: {
        amount: plan.price,
        content: qrData.content,
        bankInfo: this.paymentClient.getBankInfo(),
      },
    };
  }

  async cancelSubscription(userId, subscriptionId) {
    const subscription = await this.subscriptionsRepo.findById(subscriptionId);

    if (!subscription || subscription.userId.toString() !== userId) {
      throw new Error('Subscription not found');
    }

    if (subscription.status !== 'Active') {
      throw new Error('Only active subscriptions can be cancelled');
    }

    // Cancel but keep active until end date
    const updated = await this.subscriptionsRepo.update(subscriptionId, {
      status: 'Cancelled',
      cancelledAt: new Date(),
    });

    // Update user status
    await this.usersRepo.updateById(userId, {
      subscriptionStatus: 'Cancelled',
    });

    // Publish event
    await this.eventBus.publish('subscription.cancelled', {
      userId,
      subscriptionId,
    });

    return this.mapToDTO(updated);
  }

  calculateEndDate(startDate, billingCycle) {
    const end = new Date(startDate);
    if (billingCycle === 'Monthly') {
      end.setMonth(end.getMonth() + 1);
    } else if (billingCycle === 'Yearly') {
      end.setFullYear(end.getFullYear() + 1);
    }
    return end;
  }

  mapToDTO(subscription) {
    return {
      id: subscription._id.toString(),
      userId: subscription.userId.toString(),
      planId: subscription.planId.toString(),
      startDate: subscription.startDate,
      endDate: subscription.endDate,
      renewalDate: subscription.renewalDate,
      status: subscription.status,
      entitlementsSnapshot: subscription.entitlementsSnapshot,
      createdAt: subscription.createdAt,
      updatedAt: subscription.updatedAt,
    };
  }
}

module.exports = UserSubscriptionsService;
```

---

### 1.3. Entitlement Middleware

**File:** `src/middleware/checkEntitlement.js`

```javascript
const UsersRepository = require('../repositories/users.repository');
const UserSubscriptionsRepository = require('../repositories/userSubscriptions.repository');
const SubscriptionPlansRepository = require('../repositories/subscriptionPlans.repository');

const usersRepo = new UsersRepository();
const subscriptionsRepo = new UserSubscriptionsRepository();
const plansRepo = new SubscriptionPlansRepository();

/**
 * Check if user has exceeded monthly test generation limit
 */
async function checkTestGenerationLimit(req, res, next) {
  try {
    const userId = req.user.id;

    // Get active subscription
    const subscription = await subscriptionsRepo.findOne({
      userId,
      status: 'Active',
    });

    if (!subscription) {
      return res.status(403).json({
        code: 'NoActiveSubscription',
        message: 'Please subscribe to a plan to generate tests',
      });
    }

    const { maxMonthlyTestGenerations } = subscription.entitlementsSnapshot;

    // If unlimited, allow
    if (maxMonthlyTestGenerations === 'unlimited') {
      return next();
    }

    // Count tests generated this month
    const QuestionSetsRepository = require('../repositories/questionSets.repository');
    const questionSetsRepo = new QuestionSetsRepository();

    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const count = await questionSetsRepo.count({
      creatorId: userId,
      createdAt: { $gte: startOfMonth },
    });

    if (count >= maxMonthlyTestGenerations) {
      return res.status(403).json({
        code: 'QuotaExceeded',
        message: 'Monthly test generation limit exceeded',
        details: {
          limit: maxMonthlyTestGenerations,
          used: count,
        },
      });
    }

    next();
  } catch (error) {
    next(error);
  }
}

/**
 * Check if user can request validation
 */
async function checkValidationRequestLimit(req, res, next) {
  try {
    const userId = req.user.id;

    const subscription = await subscriptionsRepo.findOne({
      userId,
      status: 'Active',
    });

    if (!subscription) {
      return res.status(403).json({
        code: 'NoActiveSubscription',
        message: 'Please subscribe to a plan to request validation',
      });
    }

    const { maxValidationRequests } = subscription.entitlementsSnapshot;

    if (maxValidationRequests === 0) {
      return res.status(403).json({
        code: 'FeatureNotAvailable',
        message: 'Validation requests not available in your plan',
      });
    }

    if (maxValidationRequests === 'unlimited') {
      return next();
    }

    // Count validation requests this month
    const ValidationRequestsRepository = require('../repositories/validationRequests.repository');
    const validationRepo = new ValidationRequestsRepository();

    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const count = await validationRepo.count({
      learnerId: userId,
      createdAt: { $gte: startOfMonth },
    });

    if (count >= maxValidationRequests) {
      return res.status(403).json({
        code: 'QuotaExceeded',
        message: 'Monthly validation request limit exceeded',
        details: {
          limit: maxValidationRequests,
          used: count,
        },
      });
    }

    next();
  } catch (error) {
    next(error);
  }
}

module.exports = {
  checkTestGenerationLimit,
  checkValidationRequestLimit,
};
```

**Usage in routes:**

```javascript
// src/routes/questionSets.routes.js
const { checkTestGenerationLimit, checkValidationRequestLimit } = require('../middleware/checkEntitlement');

// Apply to generation endpoint
router.post('/generate',
  authenticateJWT,
  checkTestGenerationLimit, // Check quota
  controller.generate.bind(controller)
);

// Apply to validation request
router.post('/:id/review',
  authenticateJWT,
  checkValidationRequestLimit, // Check quota
  controller.requestReview.bind(controller)
);
```

---

### 1.4. Background Jobs

**Job 1:** Subscription Expiration Checker

**File:** `src/jobs/subscription.expiration.js`

```javascript
const UserSubscriptionsRepository = require('../repositories/userSubscriptions.repository');
const UsersRepository = require('../repositories/users.repository');
const logger = require('../utils/logger');

const subscriptionsRepo = new UserSubscriptionsRepository();
const usersRepo = new UsersRepository();

/**
 * Check and expire subscriptions that have passed their end date
 * Run this job daily
 */
async function processSubscriptionExpiration() {
  logger.info('Starting subscription expiration check');

  try {
    const now = new Date();

    // Find all active subscriptions that should expire
    const expiredSubscriptions = await subscriptionsRepo.find({
      status: 'Active',
      endDate: { $lte: now },
    });

    logger.info({ count: expiredSubscriptions.length }, 'Found expired subscriptions');

    for (const subscription of expiredSubscriptions) {
      // Update subscription status
      await subscriptionsRepo.update(subscription._id, {
        status: 'Expired',
      });

      // Update user status
      await usersRepo.updateById(subscription.userId, {
        subscriptionStatus: 'Expired',
        subscriptionPlanId: null,
      });

      logger.info(
        { 
          userId: subscription.userId.toString(),
          subscriptionId: subscription._id.toString(),
        },
        'Subscription expired'
      );

      // Send notification (optional)
      // await eventBus.publish('subscription.expired', { ... });
    }

    logger.info('Subscription expiration check completed');
  } catch (error) {
    logger.error({ error: error.message }, 'Subscription expiration check failed');
    throw error;
  }
}

module.exports = processSubscriptionExpiration;
```

**Job 2:** Renewal Reminders

**File:** `src/jobs/subscription.renewal-reminder.js`

```javascript
const UserSubscriptionsRepository = require('../repositories/userSubscriptions.repository');
const UsersRepository = require('../repositories/users.repository');
const { enqueueEmail } = require('../adapters/queue');
const logger = require('../utils/logger');

const subscriptionsRepo = new UserSubscriptionsRepository();
const usersRepo = new UsersRepository();

/**
 * Send renewal reminders to users 3 days before expiration
 * Run this job daily
 */
async function processRenewalReminders() {
  logger.info('Starting renewal reminder check');

  try {
    const now = new Date();
    const threeDaysLater = new Date(now);
    threeDaysLater.setDate(threeDaysLater.getDate() + 3);

    // Find subscriptions expiring in 3 days
    const expiringSubscriptions = await subscriptionsRepo.find({
      status: 'Active',
      endDate: {
        $gte: now,
        $lte: threeDaysLater,
      },
    });

    logger.info({ count: expiringSubscriptions.length }, 'Found expiring subscriptions');

    for (const subscription of expiringSubscriptions) {
      const user = await usersRepo.findById(subscription.userId);

      if (!user) continue;

      // Send reminder email
      await enqueueEmail({
        to: user.email,
        templateId: 'subscriptionRenewalReminder',
        variables: {
          userName: user.fullName,
          expirationDate: subscription.endDate.toISOString().split('T')[0],
          renewLink: `${process.env.APP_BASE_URL}/subscription/renew`,
        },
      });

      logger.info(
        { 
          userId: user._id.toString(),
          email: user.email,
        },
        'Renewal reminder sent'
      );
    }

    logger.info('Renewal reminder check completed');
  } catch (error) {
    logger.error({ error: error.message }, 'Renewal reminder check failed');
    throw error;
  }
}

module.exports = processRenewalReminders;
```

**Cron setup:** `src/worker.js`

```javascript
// Add to worker.js
const processSubscriptionExpiration = require('./jobs/subscription.expiration');
const processRenewalReminders = require('./jobs/subscription.renewal-reminder');

// Schedule jobs
const cron = require('node-cron');

// Run daily at 2 AM
cron.schedule('0 2 * * *', async () => {
  try {
    await processSubscriptionExpiration();
  } catch (error) {
    logger.error('Subscription expiration job failed:', error);
  }
});

// Run daily at 3 AM
cron.schedule('0 3 * * *', async () => {
  try {
    await processRenewalReminders();
  } catch (error) {
    logger.error('Renewal reminder job failed:', error);
  }
});
```

---

## ✅ Acceptance Criteria - Subscription System

### Functional
- [ ] Admin có thể create/update/archive subscription plans
- [ ] Users có thể xem danh sách plans (public)
- [ ] Users có thể subscribe to a plan
- [ ] System tạo QR code và payment instructions
- [ ] Payment webhook activate subscription automatically
- [ ] Users có thể cancel subscription
- [ ] Entitlement limits được enforce (generation + validation)
- [ ] Subscriptions tự động expire sau end date
- [ ] Renewal reminders được gửi 3 ngày trước

### Technical
- [ ] Zero stub implementations
- [ ] Proper error handling
- [ ] Input validation
- [ ] Tests coverage ≥ 85%
- [ ] Background jobs running
- [ ] Logs có user/subscription context

---

**Tiếp tục với Expert Workflow trong phần tiếp theo...**
