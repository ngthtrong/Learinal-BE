# Phase 2: Admin & Management Tools

**Timeline:** 2 tuần  
**Priority:** HIGH  
**Dependencies:** Phase 1 (Subscription system)

---

## 📋 Tổng quan

Phase này tập trung vào **công cụ quản trị** cho Administrator:

### Scope
1. **User Management** (0.5 tuần)
   - List/search users
   - Update user details
   - Ban/activate users
   - Role assignment

2. **Content Moderation** (0.5 tuần)
   - Review flagged content
   - Remove violations
   - Moderate question sets
   - Moderate comments

3. **System Configuration** (0.5 tuần)
   - Feature flags
   - System settings
   - Email templates
   - Maintenance mode

4. **Analytics & Reporting** (0.5 tuần)
   - User statistics
   - Revenue reports
   - Usage metrics
   - Expert performance

---

## 1️⃣ User Management

### 1.1. Admin Users Controller

**File:** `src/controllers/admin.controller.js`

Expand existing implementation:

```javascript
const AdminService = require('../services/admin.service');

class AdminController {
  constructor({ adminService }) {
    this.service = adminService;
  }

  /**
   * GET /admin/users
   * List all users with filters
   */
  async listUsers(req, res, next) {
    try {
      const { page = 1, pageSize = 20, role, status, search } = req.query;

      const result = await this.service.listUsers({
        page: parseInt(page),
        pageSize: parseInt(pageSize),
        role,
        status,
        search,
      });

      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /admin/users/:id
   * Get user details
   */
  async getUser(req, res, next) {
    try {
      const user = await this.service.getUserById(req.params.id);

      if (!user) {
        return res.status(404).json({
          code: 'NotFound',
          message: 'User not found',
        });
      }

      res.status(200).json(user);
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /admin/users/:id
   * Update user details
   */
  async updateUser(req, res, next) {
    try {
      const { id } = req.params;
      const updates = req.body;

      const user = await this.service.updateUser(id, updates);

      res.status(200).json(user);
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /admin/users/:id/ban
   * Ban user
   */
  async banUser(req, res, next) {
    try {
      const { id } = req.params;
      const { reason } = req.body;

      await this.service.banUser(id, reason);

      res.status(200).json({
        message: 'User banned successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /admin/users/:id/activate
   * Activate banned user
   */
  async activateUser(req, res, next) {
    try {
      const { id } = req.params;

      await this.service.activateUser(id);

      res.status(200).json({
        message: 'User activated successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /admin/users/:id/role
   * Change user role
   */
  async changeRole(req, res, next) {
    try {
      const { id } = req.params;
      const { role } = req.body;

      if (!['Learner', 'Expert', 'Admin'].includes(role)) {
        return res.status(400).json({
          code: 'ValidationError',
          message: 'Invalid role',
        });
      }

      const user = await this.service.changeUserRole(id, role);

      res.status(200).json(user);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /admin/stats
   * Get system statistics
   */
  async getStats(req, res, next) {
    try {
      const stats = await this.service.getSystemStats();
      res.status(200).json(stats);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /admin/revenue
   * Get revenue statistics
   */
  async getRevenue(req, res, next) {
    try {
      const { startDate, endDate } = req.query;

      const revenue = await this.service.getRevenue({
        startDate: startDate ? new Date(startDate) : undefined,
        endDate: endDate ? new Date(endDate) : undefined,
      });

      res.status(200).json(revenue);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /admin/experts/performance
   * Get expert performance metrics
   */
  async getExpertPerformance(req, res, next) {
    try {
      const performance = await this.service.getExpertPerformance();
      res.status(200).json(performance);
    } catch (error) {
      next(error);
    }
  }
}

module.exports = AdminController;
```

---

### 1.2. Admin Service

**File:** `src/services/admin.service.js`

```javascript
class AdminService {
  constructor({
    usersRepository,
    userSubscriptionsRepository,
    questionSetsRepository,
    validationRequestsRepository,
    commissionRecordsRepository,
    eventBus,
  }) {
    this.usersRepo = usersRepository;
    this.subscriptionsRepo = userSubscriptionsRepository;
    this.questionSetsRepo = questionSetsRepository;
    this.validationRepo = validationRequestsRepository;
    this.commissionRepo = commissionRecordsRepository;
    this.eventBus = eventBus;
  }

  async listUsers(options) {
    const { page, pageSize, role, status, search } = options;

    const filter = {};
    if (role) filter.role = role;
    if (status) filter.status = status;
    if (search) {
      filter.$or = [
        { fullName: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
      ];
    }

    const skip = (page - 1) * pageSize;

    const users = await this.usersRepo.find(filter, {
      skip,
      limit: pageSize,
      sort: { createdAt: -1 },
    });

    const total = await this.usersRepo.count(filter);

    return {
      items: users.map(this.mapUserToDTO),
      meta: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  async getUserById(id) {
    const user = await this.usersRepo.findById(id);
    if (!user) return null;

    // Include additional info
    const subscription = await this.subscriptionsRepo.findOne({
      userId: id,
      status: 'Active',
    });

    const questionSetsCount = await this.questionSetsRepo.count({
      creatorId: id,
    });

    return {
      ...this.mapUserToDTO(user),
      subscription: subscription ? this.mapSubscriptionToDTO(subscription) : null,
      stats: {
        questionSetsCreated: questionSetsCount,
      },
    };
  }

  async updateUser(id, updates) {
    const allowedFields = ['fullName', 'email', 'status'];
    const filtered = {};

    for (const field of allowedFields) {
      if (updates[field] !== undefined) {
        filtered[field] = updates[field];
      }
    }

    const user = await this.usersRepo.updateById(id, filtered);
    return this.mapUserToDTO(user);
  }

  async banUser(id, reason) {
    await this.usersRepo.updateById(id, {
      status: 'Deactivated',
      banReason: reason,
      bannedAt: new Date(),
    });

    // Publish event
    await this.eventBus.publish('user.banned', {
      userId: id,
      reason,
    });

    // Could also:
    // - Cancel active subscriptions
    // - Invalidate sessions
    // - Send notification email
  }

  async activateUser(id) {
    await this.usersRepo.updateById(id, {
      status: 'Active',
      banReason: null,
      bannedAt: null,
    });

    await this.eventBus.publish('user.activated', {
      userId: id,
    });
  }

  async changeUserRole(id, newRole) {
    const user = await this.usersRepo.updateById(id, {
      role: newRole,
    });

    await this.eventBus.publish('user.role_changed', {
      userId: id,
      newRole,
    });

    return this.mapUserToDTO(user);
  }

  async getSystemStats() {
    const User = require('../models/user.model');
    const UserSubscription = require('../models/userSubscription.model');
    const QuestionSet = require('../models/questionSet.model');
    const QuizAttempt = require('../models/quizAttempt.model');

    const [
      totalUsers,
      activeUsers,
      totalLearners,
      totalExperts,
      totalAdmins,
      activeSubscriptions,
      totalQuestionSets,
      totalQuizAttempts,
      todaySignups,
    ] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ status: 'Active' }),
      User.countDocuments({ role: 'Learner' }),
      User.countDocuments({ role: 'Expert' }),
      User.countDocuments({ role: 'Admin' }),
      UserSubscription.countDocuments({ status: 'Active' }),
      QuestionSet.countDocuments(),
      QuizAttempt.countDocuments(),
      User.countDocuments({
        createdAt: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) },
      }),
    ]);

    return {
      users: {
        total: totalUsers,
        active: activeUsers,
        byRole: {
          learners: totalLearners,
          experts: totalExperts,
          admins: totalAdmins,
        },
        todaySignups,
      },
      subscriptions: {
        active: activeSubscriptions,
      },
      content: {
        questionSets: totalQuestionSets,
        quizAttempts: totalQuizAttempts,
      },
    };
  }

  async getRevenue(options) {
    const { startDate, endDate } = options;

    const SubscriptionPlan = require('../models/subscriptionPlan.model');
    const UserSubscription = require('../models/userSubscription.model');

    const filter = {
      status: { $in: ['Active', 'Expired', 'Cancelled'] },
    };

    if (startDate || endDate) {
      filter.startDate = {};
      if (startDate) filter.startDate.$gte = startDate;
      if (endDate) filter.startDate.$lte = endDate;
    }

    const subscriptions = await UserSubscription.find(filter).populate('planId');

    const revenue = {
      total: 0,
      byPlan: {},
      count: subscriptions.length,
    };

    subscriptions.forEach((sub) => {
      const plan = sub.planId;
      if (!plan) return;

      revenue.total += plan.price;

      if (!revenue.byPlan[plan.planName]) {
        revenue.byPlan[plan.planName] = {
          count: 0,
          amount: 0,
        };
      }

      revenue.byPlan[plan.planName].count += 1;
      revenue.byPlan[plan.planName].amount += plan.price;
    });

    return revenue;
  }

  async getExpertPerformance() {
    const ValidationRequest = require('../models/validationRequest.model');
    const CommissionRecord = require('../models/commissionRecord.model');

    const experts = await this.usersRepo.find({ role: 'Expert' });

    const performance = await Promise.all(
      experts.map(async (expert) => {
        const [completedValidations, totalCommission, pendingCommission] = await Promise.all([
          ValidationRequest.countDocuments({
            expertId: expert._id,
            status: 'Completed',
          }),
          CommissionRecord.aggregate([
            { $match: { expertId: expert._id } },
            { $group: { _id: null, total: { $sum: '$amount' } } },
          ]),
          CommissionRecord.aggregate([
            { $match: { expertId: expert._id, status: 'Pending' } },
            { $group: { _id: null, total: { $sum: '$amount' } } },
          ]),
        ]);

        return {
          expertId: expert._id.toString(),
          expertName: expert.fullName,
          email: expert.email,
          completedValidations,
          totalCommission: totalCommission[0]?.total || 0,
          pendingCommission: pendingCommission[0]?.total || 0,
        };
      })
    );

    // Sort by completed validations
    performance.sort((a, b) => b.completedValidations - a.completedValidations);

    return performance;
  }

  mapUserToDTO(user) {
    return {
      id: user._id.toString(),
      fullName: user.fullName,
      email: user.email,
      role: user.role,
      status: user.status,
      subscriptionStatus: user.subscriptionStatus,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  mapSubscriptionToDTO(subscription) {
    return {
      id: subscription._id.toString(),
      planId: subscription.planId.toString(),
      status: subscription.status,
      startDate: subscription.startDate,
      endDate: subscription.endDate,
    };
  }
}

module.exports = AdminService;
```

---

## 2️⃣ Content Moderation

### 2.1. Flagging System

**Model:** `src/models/contentFlag.model.js`

```javascript
const mongoose = require('mongoose');

const contentFlagSchema = new mongoose.Schema(
  {
    contentType: {
      type: String,
      enum: ['QuestionSet', 'Question', 'Comment'],
      required: true,
    },
    contentId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    reportedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    reason: {
      type: String,
      enum: ['Inappropriate', 'Spam', 'Incorrect', 'Copyright', 'Other'],
      required: true,
    },
    description: String,
    status: {
      type: String,
      enum: ['Pending', 'Reviewed', 'Resolved', 'Dismissed'],
      default: 'Pending',
    },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    reviewedAt: Date,
    action: {
      type: String,
      enum: ['None', 'Warning', 'ContentRemoved', 'UserBanned'],
    },
    notes: String,
  },
  { timestamps: true }
);

contentFlagSchema.index({ contentType: 1, contentId: 1 });
contentFlagSchema.index({ status: 1 });
contentFlagSchema.index({ reportedBy: 1 });

module.exports = mongoose.model('ContentFlag', contentFlagSchema);
```

---

### 2.2. Moderation Controller

**File:** `src/controllers/moderation.controller.js`

```javascript
const ModerationService = require('../services/moderation.service');

class ModerationController {
  constructor({ moderationService }) {
    this.service = moderationService;
  }

  /**
   * POST /moderation/flag
   * Report inappropriate content
   */
  async flagContent(req, res, next) {
    try {
      const { contentType, contentId, reason, description } = req.body;
      const userId = req.user.id;

      const flag = await this.service.flagContent({
        contentType,
        contentId,
        reportedBy: userId,
        reason,
        description,
      });

      res.status(201).json(flag);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /admin/moderation/flags
   * List flagged content (Admin only)
   */
  async listFlags(req, res, next) {
    try {
      const { page = 1, pageSize = 20, status } = req.query;

      const result = await this.service.listFlags({
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
   * PATCH /admin/moderation/flags/:id/review
   * Review flagged content
   */
  async reviewFlag(req, res, next) {
    try {
      const { id } = req.params;
      const { action, notes } = req.body;
      const adminId = req.user.id;

      const flag = await this.service.reviewFlag(id, {
        action,
        notes,
        reviewedBy: adminId,
      });

      res.status(200).json(flag);
    } catch (error) {
      next(error);
    }
  }
}

module.exports = ModerationController;
```

---

## 3️⃣ System Configuration

### 3.1. System Settings

**Model:** `src/models/systemSetting.model.js`

```javascript
const mongoose = require('mongoose');

const systemSettingSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
    },
    value: mongoose.Schema.Types.Mixed,
    type: {
      type: String,
      enum: ['string', 'number', 'boolean', 'json'],
      required: true,
    },
    description: String,
    category: {
      type: String,
      enum: ['general', 'email', 'payment', 'features', 'limits'],
      default: 'general',
    },
    isPublic: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('SystemSetting', systemSettingSchema);
```

---

### 3.2. Configuration Controller

**File:** `src/controllers/config.controller.js`

```javascript
const ConfigService = require('../services/config.service');

class ConfigController {
  constructor({ configService }) {
    this.service = configService;
  }

  /**
   * GET /config
   * Get public configuration
   */
  async getPublic(req, res, next) {
    try {
      const config = await this.service.getPublicConfig();
      res.status(200).json(config);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /admin/config
   * Get all configuration (Admin only)
   */
  async getAll(req, res, next) {
    try {
      const config = await this.service.getAllConfig();
      res.status(200).json(config);
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /admin/config/:key
   * Update configuration value
   */
  async update(req, res, next) {
    try {
      const { key } = req.params;
      const { value } = req.body;

      const setting = await this.service.updateConfig(key, value);

      res.status(200).json(setting);
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /admin/maintenance
   * Enable/disable maintenance mode
   */
  async setMaintenanceMode(req, res, next) {
    try {
      const { enabled, message } = req.body;

      await this.service.setMaintenanceMode(enabled, message);

      res.status(200).json({
        maintenanceMode: enabled,
        message,
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = ConfigController;
```

---

## 4️⃣ Email Template Management

### 4.1. Email Templates

**Model:** `src/models/emailTemplate.model.js`

```javascript
const mongoose = require('mongoose');

const emailTemplateSchema = new mongoose.Schema(
  {
    templateId: {
      type: String,
      required: true,
      unique: true,
    },
    name: String,
    subject: String,
    htmlBody: String,
    textBody: String,
    variables: [String], // List of required variables
    category: {
      type: String,
      enum: ['auth', 'notification', 'subscription', 'expert'],
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('EmailTemplate', emailTemplateSchema);
```

---

### 4.2. Seed Email Templates

**File:** `scripts/seed-email-templates.js`

```javascript
const mongoose = require('mongoose');
const EmailTemplate = require('../src/models/emailTemplate.model');
const config = require('../src/config');

const templates = [
  {
    templateId: 'emailVerification',
    name: 'Email Verification',
    category: 'auth',
    subject: 'Verify your email - Learinal',
    variables: ['userName', 'verificationLink'],
    htmlBody: `
      <h1>Welcome to Learinal, {{userName}}!</h1>
      <p>Please verify your email address by clicking the link below:</p>
      <a href="{{verificationLink}}">Verify Email</a>
    `,
  },
  {
    templateId: 'passwordReset',
    name: 'Password Reset',
    category: 'auth',
    subject: 'Reset your password - Learinal',
    variables: ['userName', 'resetLink'],
    htmlBody: `
      <h1>Password Reset Request</h1>
      <p>Hi {{userName}},</p>
      <p>Click the link below to reset your password:</p>
      <a href="{{resetLink}}">Reset Password</a>
    `,
  },
  {
    templateId: 'validationAssigned',
    name: 'Validation Assigned to Expert',
    category: 'expert',
    subject: 'New validation request assigned',
    variables: ['expertName', 'setTitle', 'numQuestions', 'reviewLink'],
    htmlBody: `
      <h1>New Validation Request</h1>
      <p>Hi {{expertName}},</p>
      <p>You have been assigned a new validation request:</p>
      <ul>
        <li>Question Set: {{setTitle}}</li>
        <li>Number of Questions: {{numQuestions}}</li>
      </ul>
      <a href="{{reviewLink}}">Review Now</a>
    `,
  },
  {
    templateId: 'validationApproved',
    name: 'Validation Approved',
    category: 'notification',
    subject: 'Your question set has been validated',
    variables: ['learnerName', 'setTitle', 'expertName', 'viewLink'],
    htmlBody: `
      <h1>Question Set Validated! ✅</h1>
      <p>Hi {{learnerName}},</p>
      <p>Your question set "{{setTitle}}" has been validated by {{expertName}}.</p>
      <a href="{{viewLink}}">View Question Set</a>
    `,
  },
  {
    templateId: 'commissionEarned',
    name: 'Commission Earned',
    category: 'expert',
    subject: 'You earned commission!',
    variables: ['expertName', 'amount', 'type', 'dashboardLink'],
    htmlBody: `
      <h1>Commission Earned! 💰</h1>
      <p>Hi {{expertName}},</p>
      <p>You earned {{amount}} VND from {{type}}.</p>
      <a href="{{dashboardLink}}">View Dashboard</a>
    `,
  },
];

async function seed() {
  try {
    await mongoose.connect(config.mongo.uri);
    console.log('✅ Connected to MongoDB');

    await EmailTemplate.deleteMany({});
    console.log('🗑️  Cleared existing templates');

    await EmailTemplate.insertMany(templates);
    console.log('✅ Seeded email templates');

    await mongoose.disconnect();
  } catch (error) {
    console.error('❌ Seed failed:', error);
    process.exit(1);
  }
}

seed();
```

---

## ✅ Acceptance Criteria - Phase 2

### User Management
- [ ] Admin can list/search all users
- [ ] Admin can update user details
- [ ] Admin can ban/activate users
- [ ] Admin can change user roles
- [ ] User activity tracked

### Content Moderation
- [ ] Users can flag inappropriate content
- [ ] Admin can review flagged content
- [ ] Admin can take action (remove/warn/ban)
- [ ] Moderation history tracked

### System Configuration
- [ ] Admin can view/update system settings
- [ ] Maintenance mode can be enabled
- [ ] Email templates manageable
- [ ] Feature flags controllable

### Analytics & Reporting
- [ ] System statistics dashboard
- [ ] Revenue reports
- [ ] Expert performance metrics
- [ ] User growth analytics

### Testing
- [ ] Unit tests ≥ 85%
- [ ] Integration tests for admin flows
- [ ] Permission tests (only admins can access)

---

**Timeline:** 2 tuần  
**Next:** Phase 3 - Production Features
