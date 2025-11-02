# Phase 1: Subscription Management API

**Priority:** CRITICAL  
**Estimated Time:** 1.5-2 tuần (giảm từ 2-3 tuần)  
**Dependencies:** None - Payment infrastructure already complete ✅

---

## 🎯 Tổng quan

**Infrastructure Đã Có (Production Ready):** ✅
- ✅ Payment webhook với SePay (auto-activation working)
- ✅ Transaction reconciliation (fetch 20 txs automatic)
- ✅ Signature verification (HMAC SHA256)
- ✅ Auto-update subscriptionStatus → Active
- ✅ Models: `SubscriptionPlan`, `UserSubscription` complete

**Cần Implement (Missing 50%):**
- ❌ SubscriptionPlans CRUD API (admin manage plans)
- ❌ UserSubscriptions API (checkout, view history, cancel)
- ❌ Entitlement checking middleware
- ❌ Background jobs (expiration checker, renewal reminders)
- ❌ Seed data (Standard 2000đ, Pro 5000đ)

**Timeline giảm vì:**
- Payment webhook đã working (không cần implement lại)
- Transaction reconciliation đã automatic
- Models đã complete và tested

---

## ✅ Đã Hoàn Thành (Skip Implementation)

### Payment Webhook - WORKING ✅

**File:** `src/controllers/webhooks.controller.js`

**Tính năng đã có:**
```javascript
// ✅ Signature verification
if (sepay?.webhookSecret) {
  const sig = req.get("Sepay-Signature");
  const computed = crypto.createHmac("sha256", sepay.webhookSecret)
    .update(base).digest("hex");
  // Verify signature...
}

// ✅ Transaction reconciliation (fetch 20 txs)
const client = createSepayClient(sepay);
const data = await client.listTransactions({
  account_number: sepay.qrAccount,
  limit: 20,
});

// ✅ Auto-activation logic
for (const tx of transactions) {
  if (amountIn === 2000 && /SEVQR/i.test(content) && /standard/i.test(content)) {
    const userId = extractUserIdFromText(content); // Extract uid:xxxxx
    if (userId && current.subscriptionStatus === "None") {
      await usersRepo.updateUserById(userId, { subscriptionStatus: "Active" });
    }
  }
}
```

**Config required:**
```bash
SEPAY_ACCOUNT_NUMBER=xxxxx
SEPAY_API_KEY=xxxxx
SEPAY_WEBHOOK_SECRET=xxxxx
```

**Testing:** ✅ Đã test thành công với real transactions

---

## 1. Subscription Plans Management (NEW IMPLEMENTATION NEEDED)

### 1.1. Controller Implementation

**File:** `src/controllers/subscriptionPlans.controller.js`

```javascript
const SubscriptionPlansService = require('../services/subscriptionPlans.service');

class SubscriptionPlansController {
  constructor(service) {
    this.service = service;
  }

  /**
   * GET /subscription-plans
   * Public endpoint - list active plans
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
   * POST /subscription-plans (Admin only)
   * Create new subscription plan
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
   * Get plan details
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
   * PATCH /subscription-plans/:id (Admin only)
   * Update subscription plan
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
   * DELETE /subscription-plans/:id (Admin only)
   * Archive subscription plan (soft delete)
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

### 1.2. Service Implementation

**File:** `src/services/subscriptionPlans.service.js`

```javascript
class SubscriptionPlansService {
  constructor({ subscriptionPlansRepository }) {
    this.repository = subscriptionPlansRepository;
  }

  async listActivePlans() {
    const plans = await this.repository.find({ status: 'Active' });
    return plans.map(this.mapPlanToDTO);
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
    
    return this.mapPlanToDTO(plan);
  }

  async getPlanById(id) {
    const plan = await this.repository.findById(id);
    return plan ? this.mapPlanToDTO(plan) : null;
  }

  async updatePlan(id, data) {
    if (data.entitlements) {
      this.validateEntitlements(data.entitlements);
    }
    
    const plan = await this.repository.update(id, data);
    return plan ? this.mapPlanToDTO(plan) : null;
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
    ];
    
    for (const field of required) {
      if (!(field in entitlements)) {
        throw new Error(`Missing required entitlement: ${field}`);
      }
    }
  }

  mapPlanToDTO(plan) {
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

### 1.3. Seed Data

**File:** `scripts/seed-subscription-plans.js`

```javascript
const mongoose = require('mongoose');
const SubscriptionPlan = require('../src/models/subscriptionPlan.model');

const plans = [
  {
    planName: 'Standard',
    description: 'Gói cơ bản cho người học',
    billingCycle: 'Monthly',
    price: 2000, // VND
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
    description: 'Gói nâng cao không giới hạn',
    billingCycle: 'Monthly',
    price: 5000, // VND
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

async function seedPlans() {
  await mongoose.connect(process.env.MONGODB_URI);
  
  // Clear existing plans
  await SubscriptionPlan.deleteMany({});
  
  // Insert new plans
  await SubscriptionPlan.insertMany(plans);
  
  console.log('✅ Subscription plans seeded successfully');
  await mongoose.disconnect();
}

seedPlans().catch(console.error);
```

---

## 2. User Subscriptions Management

### 2.1. Controller Implementation

**File:** `src/controllers/userSubscriptions.controller.js`

```javascript
const UserSubscriptionsService = require('../services/userSubscriptions.service');

class UserSubscriptionsController {
  constructor(service) {
    this.service = service;
  }

  /**
   * GET /user-subscriptions/me
   * Get current user's subscription history
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
   * Create new subscription (checkout)
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

### 2.2. Service Implementation

**File:** `src/services/userSubscriptions.service.js`

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
    return subscriptions.map(this.mapSubscriptionToDTO);
  }

  async createSubscription(userId, planId) {
    // Get plan details
    const plan = await this.plansRepo.findById(planId);
    if (!plan || plan.status !== 'Active') {
      throw Object.assign(new Error('Invalid subscription plan'), {
        status: 400,
        code: 'InvalidPlan',
      });
    }

    // Check for existing active subscription
    const existingActive = await this.subscriptionsRepo.findOne({
      userId,
      status: 'Active',
    });

    if (existingActive) {
      throw Object.assign(
        new Error('User already has an active subscription'),
        { status: 409, code: 'ActiveSubscriptionExists' }
      );
    }

    // Create payment order
    const paymentOrder = await this.paymentClient.createOrder({
      amount: plan.price,
      description: `Subscription: ${plan.planName} - ${plan.billingCycle}`,
      metadata: {
        userId,
        planId,
        type: 'subscription',
      },
    });

    // Create subscription record with PendingPayment status
    const startDate = new Date();
    const renewalDate = new Date(startDate);
    renewalDate.setMonth(
      renewalDate.getMonth() + (plan.billingCycle === 'Yearly' ? 12 : 1)
    );

    const subscription = await this.subscriptionsRepo.create({
      userId,
      planId,
      startDate,
      endDate: null,
      renewalDate,
      status: 'PendingPayment',
      entitlementsSnapshot: plan.entitlements,
    });

    // Emit event
    await this.eventBus.publish('subscription.created', {
      subscriptionId: subscription._id.toString(),
      userId,
      planId,
      status: 'PendingPayment',
    });

    return {
      id: subscription._id.toString(),
      status: 'PendingPayment',
      checkoutUrl: paymentOrder.checkoutUrl,
      orderId: paymentOrder.orderId,
    };
  }

  async cancelSubscription(userId, subscriptionId) {
    const subscription = await this.subscriptionsRepo.findOne({
      _id: subscriptionId,
      userId,
    });

    if (!subscription) {
      throw Object.assign(new Error('Subscription not found'), {
        status: 404,
        code: 'NotFound',
      });
    }

    if (subscription.status !== 'Active') {
      throw Object.assign(
        new Error('Can only cancel active subscriptions'),
        { status: 400, code: 'InvalidStatus' }
      );
    }

    // Update subscription
    const updated = await this.subscriptionsRepo.update(subscriptionId, {
      status: 'Cancelled',
      endDate: new Date(),
    });

    // Update user record
    await this.usersRepo.update(userId, {
      subscriptionStatus: 'Cancelled',
      subscriptionPlanId: null,
    });

    // Emit event
    await this.eventBus.publish('subscription.cancelled', {
      subscriptionId,
      userId,
    });

    return this.mapSubscriptionToDTO(updated);
  }

  async activateSubscription(subscriptionId, paymentDetails) {
    const subscription = await this.subscriptionsRepo.findById(subscriptionId);
    
    if (!subscription) {
      throw new Error('Subscription not found');
    }

    // Update subscription status
    const updated = await this.subscriptionsRepo.update(subscriptionId, {
      status: 'Active',
    });

    // Update user record
    await this.usersRepo.update(subscription.userId.toString(), {
      subscriptionPlanId: subscription.planId,
      subscriptionStatus: 'Active',
      subscriptionRenewalDate: subscription.renewalDate,
    });

    // Emit event
    await this.eventBus.publish('subscription.activated', {
      subscriptionId,
      userId: subscription.userId.toString(),
      planId: subscription.planId.toString(),
    });

    return updated;
  }

  mapSubscriptionToDTO(sub) {
    return {
      id: sub._id.toString(),
      userId: sub.userId.toString(),
      planId: sub.planId.toString(),
      startDate: sub.startDate,
      endDate: sub.endDate,
      renewalDate: sub.renewalDate,
      status: sub.status,
      entitlementsSnapshot: sub.entitlementsSnapshot,
    };
  }
}

module.exports = UserSubscriptionsService;
```

---

## 3. Entitlement Checking Middleware

### 3.1. Middleware Implementation

**File:** `src/middleware/checkEntitlement.js`

```javascript
const UsersRepository = require('../repositories/users.repository');
const SubscriptionPlansRepository = require('../repositories/subscriptionPlans.repository');
const QuestionSetsRepository = require('../repositories/questionSets.repository');
const ValidationRequestsRepository = require('../repositories/validationRequests.repository');

const usersRepo = new UsersRepository();
const plansRepo = new SubscriptionPlansRepository();
const questionSetsRepo = new QuestionSetsRepository();
const validationRequestsRepo = new ValidationRequestsRepository();

/**
 * Check if user can generate question sets
 */
async function checkQuestionGenerationLimit(req, res, next) {
  try {
    const userId = req.user.id;
    const user = await usersRepo.findById(userId);

    if (!user.subscriptionPlanId) {
      // Free tier - no generation allowed
      return res.status(403).json({
        code: 'SubscriptionRequired',
        message: 'Please subscribe to generate question sets',
      });
    }

    const plan = await plansRepo.findById(user.subscriptionPlanId);
    const limit = plan.entitlements.maxMonthlyTestGenerations;

    if (limit === 'unlimited') {
      return next();
    }

    // Count this month's generations
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const count = await questionSetsRepo.count({
      userId,
      createdAt: { $gte: startOfMonth },
    });

    if (count >= limit) {
      return res.status(403).json({
        code: 'QuotaExceeded',
        message: `Monthly generation limit reached (${limit})`,
        details: { used: count, limit },
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
    const user = await usersRepo.findById(userId);

    if (!user.subscriptionPlanId) {
      return res.status(403).json({
        code: 'SubscriptionRequired',
        message: 'Please subscribe to request validation',
      });
    }

    const plan = await plansRepo.findById(user.subscriptionPlanId);
    const limit = plan.entitlements.maxValidationRequests;

    if (limit === 'unlimited') {
      return next();
    }

    // Count this month's requests
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const count = await validationRequestsRepo.count({
      learnerId: userId,
      requestTime: { $gte: startOfMonth },
    });

    if (count >= limit) {
      return res.status(403).json({
        code: 'QuotaExceeded',
        message: `Monthly validation request limit reached (${limit})`,
        details: { used: count, limit },
      });
    }

    next();
  } catch (error) {
    next(error);
  }
}

module.exports = {
  checkQuestionGenerationLimit,
  checkValidationRequestLimit,
};
```

### 3.2. Routes Update

Áp dụng middleware vào routes:

```javascript
// src/routes/questionSets.routes.js
const { checkQuestionGenerationLimit } = require('../middleware/checkEntitlement');

router.post(
  '/generate',
  authenticateJWT,
  checkQuestionGenerationLimit, // <-- Add this
  inputValidation(generateQuestionSetSchema),
  controller.generate
);

router.post(
  '/:id/review',
  authenticateJWT,
  checkValidationRequestLimit, // <-- Add this
  controller.requestReview
);
```

---

## 4. Payment Webhook Handler

### 4.1. Webhook Controller

**File:** `src/controllers/webhooks.controller.js`

```javascript
const crypto = require('crypto');
const UserSubscriptionsService = require('../services/userSubscriptions.service');

class WebhooksController {
  constructor(subscriptionsService, config) {
    this.subscriptionsService = subscriptionsService;
    this.webhookSecret = config.sepay.webhookSecret;
  }

  /**
   * POST /webhooks/sepay
   * Handle SePay payment webhook
   */
  async handleSePay(req, res, next) {
    try {
      // Verify webhook signature
      const signature = req.headers['x-sepay-signature'];
      const isValid = this.verifySignature(req.body, signature);

      if (!isValid) {
        return res.status(401).json({
          code: 'InvalidSignature',
          message: 'Webhook signature verification failed',
        });
      }

      const event = req.body;

      switch (event.type) {
        case 'payment.success':
          await this.handlePaymentSuccess(event.data);
          break;

        case 'payment.failed':
          await this.handlePaymentFailed(event.data);
          break;

        case 'subscription.renewed':
          await this.handleSubscriptionRenewed(event.data);
          break;

        default:
          console.log(`Unhandled webhook event: ${event.type}`);
      }

      res.status(200).json({ received: true });
    } catch (error) {
      console.error('Webhook processing error:', error);
      next(error);
    }
  }

  verifySignature(payload, signature) {
    const hmac = crypto.createHmac('sha256', this.webhookSecret);
    const digest = hmac.update(JSON.stringify(payload)).digest('hex');
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(digest)
    );
  }

  async handlePaymentSuccess(data) {
    const { orderId, subscriptionId, amount } = data.metadata;

    // Activate subscription
    await this.subscriptionsService.activateSubscription(subscriptionId, {
      orderId,
      amount,
      paidAt: new Date(),
    });

    console.log(`✅ Subscription ${subscriptionId} activated`);
  }

  async handlePaymentFailed(data) {
    const { subscriptionId } = data.metadata;

    // Mark subscription as failed
    await this.subscriptionsService.markPaymentFailed(subscriptionId);

    console.log(`❌ Payment failed for subscription ${subscriptionId}`);
  }

  async handleSubscriptionRenewed(data) {
    const { subscriptionId } = data;

    await this.subscriptionsService.renewSubscription(subscriptionId);

    console.log(`🔄 Subscription ${subscriptionId} renewed`);
  }
}

module.exports = WebhooksController;
```

---

## 5. Background Jobs

### 5.1. Subscription Expiration Checker

**File:** `src/jobs/subscription.expiration.js`

```javascript
const UserSubscriptionsRepository = require('../repositories/userSubscriptions.repository');
const UsersRepository = require('../repositories/users.repository');

async function checkExpiredSubscriptions() {
  const subscriptionsRepo = new UserSubscriptionsRepository();
  const usersRepo = new UsersRepository();

  const now = new Date();

  // Find expired subscriptions
  const expired = await subscriptionsRepo.find({
    status: 'Active',
    renewalDate: { $lte: now },
  });

  for (const sub of expired) {
    // Mark as expired
    await subscriptionsRepo.update(sub._id, {
      status: 'Expired',
      endDate: now,
    });

    // Update user
    await usersRepo.update(sub.userId.toString(), {
      subscriptionStatus: 'Expired',
      subscriptionPlanId: null,
    });

    console.log(`⏰ Subscription ${sub._id} expired`);
  }

  console.log(`Checked ${expired.length} expired subscriptions`);
}

module.exports = { checkExpiredSubscriptions };
```

### 5.2. Renewal Reminder

**File:** `src/jobs/subscription.renewal-reminder.js`

```javascript
const UserSubscriptionsRepository = require('../repositories/userSubscriptions.repository');
const UsersRepository = require('../repositories/users.repository');
const { enqueueEmail } = require('../adapters/queue');

async function sendRenewalReminders() {
  const subscriptionsRepo = new UserSubscriptionsRepository();
  const usersRepo = new UsersRepository();

  const threeDaysFromNow = new Date();
  threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3);

  const sevenDaysFromNow = new Date();
  sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);

  // Find subscriptions expiring in 3-7 days
  const expiringSoon = await subscriptionsRepo.find({
    status: 'Active',
    renewalDate: {
      $gte: threeDaysFromNow,
      $lte: sevenDaysFromNow,
    },
  });

  for (const sub of expiringSoon) {
    const user = await usersRepo.findById(sub.userId.toString());

    await enqueueEmail({
      to: user.email,
      templateId: 'subscriptionRenewalReminder',
      variables: {
        userName: user.fullName,
        renewalDate: sub.renewalDate.toISOString().split('T')[0],
        planName: sub.planId, // Should populate plan details
      },
    });

    console.log(`📧 Sent renewal reminder to ${user.email}`);
  }

  console.log(`Sent ${expiringSoon.length} renewal reminders`);
}

module.exports = { sendRenewalReminders };
```

---

## 6. Testing

### 6.1. Unit Tests

```javascript
// tests/unit/services/subscriptionPlans.service.test.js

describe('SubscriptionPlansService', () => {
  describe('createPlan', () => {
    it('should validate entitlements structure', async () => {
      const invalidData = {
        planName: 'Test',
        price: 1000,
        entitlements: {}, // Missing required fields
      };

      await expect(service.createPlan(invalidData)).rejects.toThrow(
        'Missing required entitlement'
      );
    });

    it('should create plan successfully', async () => {
      const data = {
        planName: 'Test Plan',
        billingCycle: 'Monthly',
        price: 2000,
        entitlements: {
          maxMonthlyTestGenerations: 50,
          maxValidationRequests: 5,
          priorityProcessing: false,
          shareLimits: 20,
          maxSubjects: 10,
        },
      };

      const plan = await service.createPlan(data);
      expect(plan.planName).toBe('Test Plan');
      expect(plan.price).toBe(2000);
    });
  });
});
```

### 6.2. Integration Tests

```javascript
// tests/integration/subscriptions.test.js

describe('Subscription Flow', () => {
  it('should complete subscription checkout flow', async () => {
    // 1. List plans
    const plansRes = await request(app)
      .get('/api/v1/subscription-plans')
      .expect(200);

    const standardPlan = plansRes.body.find((p) => p.planName === 'Standard');

    // 2. Create subscription
    const createRes = await request(app)
      .post('/api/v1/subscriptions')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ planId: standardPlan.id })
      .expect(201);

    expect(createRes.body.status).toBe('PendingPayment');
    expect(createRes.body.checkoutUrl).toBeDefined();

    // 3. Simulate payment webhook
    const webhookRes = await request(app)
      .post('/api/v1/webhooks/sepay')
      .set('x-sepay-signature', generateTestSignature())
      .send({
        type: 'payment.success',
        data: {
          metadata: {
            subscriptionId: createRes.body.id,
            orderId: 'test-order-123',
            amount: 2000,
          },
        },
      })
      .expect(200);

    // 4. Verify subscription activated
    const subRes = await request(app)
      .get('/api/v1/user-subscriptions/me')
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    const activeSub = subRes.body.find((s) => s.status === 'Active');
    expect(activeSub).toBeDefined();
  });
});
```

---

## Checklist

### Implementation
- [ ] SubscriptionPlans Controller & Service
- [ ] UserSubscriptions Controller & Service
- [ ] Entitlement checking middleware
- [ ] Payment webhook handler
- [ ] Subscription expiration job
- [ ] Renewal reminder job
- [ ] Seed data scripts

### Testing
- [ ] Unit tests for services (≥85% coverage)
- [ ] Integration tests for API endpoints
- [ ] E2E subscription flow test
- [ ] Webhook signature verification test
- [ ] Entitlement enforcement tests

### Documentation
- [ ] API documentation updated
- [ ] Webhook integration guide
- [ ] Admin subscription management guide
- [ ] User subscription guide

### Production Readiness
- [ ] Payment gateway credentials configured
- [ ] Webhook endpoint secured
- [ ] Cron jobs scheduled
- [ ] Error monitoring setup
- [ ] Revenue tracking dashboard

---

## Next Steps

Sau khi hoàn thành Phase 1, tiếp tục với:
- **Phase 2:** Expert Workflow (Validation & Commission)
