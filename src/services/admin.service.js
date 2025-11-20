const UsersRepository = require("../repositories/users.repository");
const UserSubscriptionsRepository = require("../repositories/userSubscriptions.repository");
const SubscriptionPlansRepository = require("../repositories/subscriptionPlans.repository");
const ValidationRequestsRepository = require("../repositories/validationRequests.repository");
const CommissionRecordsRepository = require("../repositories/commissionRecords.repository");

class AdminService {
  constructor({
    usersRepository,
    userSubscriptionsRepository,
    subscriptionPlansRepository,
    validationRequestsRepository,
    commissionRecordsRepository,
  }) {
    this.usersRepo = usersRepository || new UsersRepository();
    this.subscriptionsRepo = userSubscriptionsRepository || new UserSubscriptionsRepository();
    this.plansRepo = subscriptionPlansRepository || new SubscriptionPlansRepository();
    this.validationRequestsRepo =
      validationRequestsRepository || new ValidationRequestsRepository();
    this.commissionRecordsRepo = commissionRecordsRepository || new CommissionRecordsRepository();
  }

  /**
   * List all users with pagination and filters
   */
  async listUsers(options) {
    const { page = 1, pageSize = 20, role, status, search } = options;

    const query = {};
    if (role) query.role = role;
    if (status) query.status = status;
    if (search) {
      query.$or = [
        { fullName: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
      ];
    }

    const result = await this.usersRepo.paginate(query, {
      page,
      pageSize,
      sort: { createdAt: -1 },
    });

    return {
      users: result.items.map(this.mapUserToDTO),
      pagination: {
        page: result.page,
        pageSize: result.pageSize,
        total: result.totalItems,
        totalPages: result.totalPages,
      },
    };
  }

  /**
   * Get user details by ID
   */
  async getUserById(id) {
    const user = await this.usersRepo.findById(id);
    if (!user) {
      throw Object.assign(new Error("User not found"), { status: 404 });
    }

    // Get user's subscriptions
    const UserSubscription = this.subscriptionsRepo.model;
    const subscriptions = await UserSubscription.find({ userId: id })
      .populate("planId")
      .sort({ createdAt: -1 })
      .limit(5)
      .lean();

    return {
      ...this.mapUserToDTO(user),
      subscriptions: subscriptions.map(this.mapSubscriptionToDTO),
    };
  }

  /**
   * Update user details
   */
  async updateUser(id, updates) {
    const allowedFields = ["fullName", "email", "status"];
    const sanitized = {};

    for (const field of allowedFields) {
      if (updates[field] !== undefined) {
        sanitized[field] = updates[field];
      }
    }

    const user = await this.usersRepo.updateById(id, sanitized, { new: true });
    if (!user) {
      throw Object.assign(new Error("User not found"), { status: 404 });
    }

    return this.mapUserToDTO(user);
  }

  /**
   * Ban user
   */
  async banUser(id, reason) {
    await this.usersRepo.updateById(id, {
      status: "Banned",
      bannedAt: new Date(),
      banReason: reason,
    });

    // TODO:
    // - Cancel active subscriptions
    // - Send notification email
  }

  /**
   * Activate user
   */
  async activateUser(id) {
    await this.usersRepo.updateById(id, {
      status: "Active",
      bannedAt: null,
      banReason: null,
    });

    // TODO: Send notification email
  }

  /**
   * Change user role
   */
  async changeUserRole(id, newRole) {
    const validRoles = ["Learner", "Expert", "Admin"];
    if (!validRoles.includes(newRole)) {
      throw Object.assign(new Error("Invalid role"), { status: 400 });
    }

    const user = await this.usersRepo.updateById(id, { role: newRole }, { new: true });
    if (!user) {
      throw Object.assign(new Error("User not found"), { status: 404 });
    }

    return this.mapUserToDTO(user);
  }

  /**
   * Get system statistics
   */
  async getSystemStats() {
    const User = require("../models/user.model");
    const QuestionSet = require("../models/questionSet.model");
    const QuizAttempt = require("../models/quizAttempt.model");
    const UserSubscription = require("../models/userSubscription.model");

    const [
      totalUsers,
      activeUsers,
      learners,
      experts,
      totalQuestionSets,
      totalQuizAttempts,
      activeSubscriptions,
    ] = await Promise.all([
      User.countDocuments({}),
      User.countDocuments({ status: "Active" }),
      User.countDocuments({ role: "Learner" }),
      User.countDocuments({ role: "Expert" }),
      QuestionSet.countDocuments({}),
      QuizAttempt.countDocuments({}),
      UserSubscription.countDocuments({ status: "Active" }),
    ]);

    return {
      users: {
        total: totalUsers,
        active: activeUsers,
        learners,
        experts,
      },
      content: {
        questionSets: totalQuestionSets,
        quizAttempts: totalQuizAttempts,
      },
      subscriptions: {
        active: activeSubscriptions,
      },
    };
  }

  /**
   * Get revenue report
   */
  async getRevenue(options) {
    const { startDate, endDate } = options;

    const UserSubscription = require("../models/userSubscription.model");

    const query = {
      status: "Active",
      createdAt: {},
    };

    if (startDate) query.createdAt.$gte = new Date(startDate);
    if (endDate) query.createdAt.$lte = new Date(endDate);

    const subscriptions = await UserSubscription.find(query).populate("planId");

    const revenue = {
      total: 0,
      byPlan: {},
      count: subscriptions.length,
    };

    for (const sub of subscriptions) {
      const plan = sub.planId;
      if (!plan) continue;

      revenue.total += plan.price || 0;

      if (!revenue.byPlan[plan.planName]) {
        revenue.byPlan[plan.planName] = {
          count: 0,
          revenue: 0,
        };
      }

      revenue.byPlan[plan.planName].count += 1;
      revenue.byPlan[plan.planName].revenue += plan.price || 0;
    }

    return revenue;
  }

  /**
   * Financial statistics (monthly for a given year)
   * Aggregates subscription gross and commissions paid to compute net.
   */
  async getFinancials(yearInput) {
    const year = parseInt(yearInput, 10) || new Date().getFullYear();
    const startOfYear = new Date(year, 0, 1, 0, 0, 0, 0);
    const endOfYear = new Date(year, 11, 31, 23, 59, 59, 999);

    const UserSubscription = require("../models/userSubscription.model");
    const SubscriptionPlan = require("../models/subscriptionPlan.model");
    const CommissionRecord = require("../models/commissionRecord.model");

    // Fetch all active subscriptions started within year (approx revenue attribution on start)
    const subs = await UserSubscription.find({
      startDate: { $gte: startOfYear, $lte: endOfYear },
      status: { $in: ["Active", "Expired", "Cancelled", "PendingPayment"] },
    })
      .populate("planId")
      .lean();

    // Fetch paid commissions within year (using paidAt if present else createdAt)
    const commissions = await CommissionRecord.find({
      status: "Paid",
      $or: [
        { paidAt: { $gte: startOfYear, $lte: endOfYear } },
        { paidAt: { $exists: false }, createdAt: { $gte: startOfYear, $lte: endOfYear } },
      ],
    }).lean();

    // Build months skeleton
    const months = Array.from({ length: 12 }, (_, i) => ({
      month: i + 1,
      subscriptionRevenue: 0,
      commissionsPaid: 0,
      net: 0,
    }));

    // Aggregate subscriptions
    for (const s of subs) {
      const date = s.startDate instanceof Date ? s.startDate : new Date(s.startDate);
      const m = date.getMonth(); // 0-11
      const price = s.planId?.price || 0;
      months[m].subscriptionRevenue += price;
    }

    // Aggregate commissions
    for (const c of commissions) {
      const date = c.paidAt
        ? c.paidAt instanceof Date
          ? c.paidAt
          : new Date(c.paidAt)
        : c.createdAt instanceof Date
          ? c.createdAt
          : new Date(c.createdAt);
      const m = date.getMonth();
      months[m].commissionsPaid += c.commissionAmount || 0;
    }

    // Compute net and totals
    let totalSubs = 0;
    let totalCommissions = 0;
    for (const row of months) {
      row.net = row.subscriptionRevenue - row.commissionsPaid;
      totalSubs += row.subscriptionRevenue;
      totalCommissions += row.commissionsPaid;
    }

    return {
      year,
      months,
      totals: {
        subscriptionRevenue: totalSubs,
        commissionsPaid: totalCommissions,
        net: totalSubs - totalCommissions,
      },
    };
  }

  /**
   * Admin: list user subscription purchases with optional search and pagination
   */
  async adminListUserSubscriptions({ page = 1, pageSize = 20, search }) {
    page = Math.max(1, parseInt(page, 10));
    pageSize = Math.min(100, Math.max(1, parseInt(pageSize, 10)));

    const UserSubscription = require("../models/userSubscription.model");
    const User = require("../models/user.model");
    const SubscriptionPlan = require("../models/subscriptionPlan.model");

    const baseQuery = {};
    // We fetch then filter in-memory if search spans user fullName/email or planName
    const skip = (page - 1) * pageSize;
    let subs = await UserSubscription.find(baseQuery)
      .populate("userId")
      .populate("planId")
      .sort({ startDate: -1 })
      .skip(skip)
      .limit(pageSize)
      .lean();

    let total = await UserSubscription.countDocuments(baseQuery);

    if (search && search.trim()) {
      const q = search.trim().toLowerCase();
      // Fetch all (simpler) if search provided to avoid pagination mismatch
      const allSubs = await UserSubscription.find(baseQuery)
        .populate("userId")
        .populate("planId")
        .sort({ startDate: -1 })
        .lean();
      const filtered = allSubs.filter((s) => {
        const userName = s.userId?.fullName?.toLowerCase() || "";
        const email = s.userId?.email?.toLowerCase() || "";
        const planName = s.planId?.planName?.toLowerCase() || "";
        return (
          userName.includes(q) ||
          email.includes(q) ||
          planName.includes(q) ||
          (s.planId?.billingCycle || "").toLowerCase().includes(q)
        );
      });
      total = filtered.length;
      subs = filtered.slice(skip, skip + pageSize);
    }

    const items = subs.map((s) => ({
      id: s._id.toString(),
      userName: s.userId?.fullName,
      userEmail: s.userId?.email,
      userId: s.userId?._id?.toString(),
      planName: s.planId?.planName,
      billingCycle: s.planId?.billingCycle,
      price: s.planId?.price || 0,
      status: s.status,
      startDate: s.startDate,
      endDate: s.endDate,
      renewalDate: s.renewalDate,
    }));

    return {
      items,
      meta: {
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      },
    };
  }

  /**
   * Get expert performance metrics
   */
  async getExpertPerformance() {
    const ValidationRequest = require("../models/validationRequest.model");
    const User = require("../models/user.model");

    const experts = await User.find({ role: "Expert" });

    const performance = await Promise.all(
      experts.map(async (expert) => {
        const [totalAssigned, completed, avgResponseTime] = await Promise.all([
          ValidationRequest.countDocuments({ expertId: expert._id }),
          ValidationRequest.countDocuments({ expertId: expert._id, status: "Completed" }),
          this.calculateAvgResponseTime(expert._id),
        ]);

        return {
          expertId: expert._id.toString(),
          expertName: expert.fullName,
          totalAssigned,
          completed,
          completionRate: totalAssigned > 0 ? (completed / totalAssigned) * 100 : 0,
          avgResponseTimeHours: avgResponseTime,
        };
      })
    );

    return performance;
  }

  async calculateAvgResponseTime(expertId) {
    const ValidationRequest = require("../models/validationRequest.model");

    const requests = await ValidationRequest.find({
      expertId,
      status: "Completed",
      assignedTime: { $exists: true },
      completedTime: { $exists: true },
    });

    if (requests.length === 0) return 0;

    const totalHours = requests.reduce((sum, req) => {
      const diff = req.completedTime - req.assignedTime;
      return sum + diff / (1000 * 60 * 60); // Convert to hours
    }, 0);

    return totalHours / requests.length;
  }

  // DTO mappers
  mapUserToDTO(user) {
    return {
      id: user._id.toString(),
      fullName: user.fullName,
      email: user.email,
      role: user.role,
      status: user.status,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  mapSubscriptionToDTO(subscription) {
    return {
      id: subscription._id.toString(),
      planName: subscription.planId?.planName,
      status: subscription.status,
      startDate: subscription.startDate,
      endDate: subscription.endDate,
    };
  }
}

module.exports = AdminService;
