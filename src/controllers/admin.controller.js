const AdminService = require("../services/admin.service");
const { ProcessedTransaction, UserSubscription } = require("../models");

const adminService = new AdminService({});

module.exports = {
  /**
   * GET /admin/users
   * List all users with pagination and filters
   */
  listUsers: async (req, res, next) => {
    try {
      const { page, pageSize, role, status, search } = req.query;

      const result = await adminService.listUsers({
        page: parseInt(page) || 1,
        pageSize: parseInt(pageSize) || 20,
        role,
        status,
        search,
      });

      res.json(result);
    } catch (e) {
      next(e);
    }
  },

  /**
   * GET /admin/users/:id
   * Get user details
   */
  getUser: async (req, res, next) => {
    try {
      const user = await adminService.getUserById(req.params.id);
      res.json(user);
    } catch (e) {
      next(e);
    }
  },

  /**
   * PATCH /admin/users/:id
   * Update user details
   */
  updateUser: async (req, res, next) => {
    try {
      const user = await adminService.updateUser(req.params.id, req.body);
      res.json(user);
    } catch (e) {
      next(e);
    }
  },

  /**
   * POST /admin/users/:id/ban
   * Ban a user
   */
  banUser: async (req, res, next) => {
    try {
      const { reason } = req.body;
      await adminService.banUser(req.params.id, reason);
      res.json({ message: "User banned successfully" });
    } catch (e) {
      next(e);
    }
  },

  /**
   * POST /admin/users/:id/activate
   * Activate a user
   */
  activateUser: async (req, res, next) => {
    try {
      await adminService.activateUser(req.params.id);
      res.json({ message: "User activated successfully" });
    } catch (e) {
      next(e);
    }
  },

  /**
   * PATCH /admin/users/:id/role
   * Change user role
   */
  changeRole: async (req, res, next) => {
    try {
      const { role } = req.body;
      const user = await adminService.changeUserRole(req.params.id, role);
      res.json(user);
    } catch (e) {
      next(e);
    }
  },

  /**
   * GET /admin/stats
   * Get system statistics
   */
  getStats: async (req, res, next) => {
    try {
      const stats = await adminService.getSystemStats();
      res.json(stats);
    } catch (e) {
      next(e);
    }
  },

  /**
   * GET /admin/revenue
   * Get revenue report
   */
  getRevenue: async (req, res, next) => {
    try {
      const { startDate, endDate } = req.query;
      const revenue = await adminService.getRevenue({ startDate, endDate });
      res.json(revenue);
    } catch (e) {
      next(e);
    }
  },

  /**
   * GET /admin/financials?year=YYYY or ?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
   * Monthly financial statistics (subscriptions vs commissions)
   */
  getFinancials: async (req, res, next) => {
    try {
      const { year, startDate, endDate } = req.query;
      const data = await adminService.getFinancials({ year, startDate, endDate });
      res.json(data);
    } catch (e) {
      next(e);
    }
  },

  /**
   * GET /admin/user-subscriptions
   * List user subscription purchases (invoices) for admin
   */
  getUserSubscriptionsAdmin: async (req, res, next) => {
    try {
      const { page, pageSize, search } = req.query;
      const data = await adminService.adminListUserSubscriptions({ page, pageSize, search });
      res.json(data);
    } catch (e) {
      next(e);
    }
  },

  /**
   * GET /admin/experts/performance
   * Get expert performance metrics
   */
  getExpertPerformance: async (req, res, next) => {
    try {
      const performance = await adminService.getExpertPerformance();
      res.json(performance);
    } catch (e) {
      next(e);
    }
  },

  /**
   * GET /admin/processed-transactions
   * List processed transactions (for debugging)
   */
  getProcessedTransactions: async (req, res, next) => {
    try {
      const { page = 1, pageSize = 20, userId, type } = req.query;
      const filter = {};
      if (userId) filter.userId = userId;
      if (type) filter.type = type;

      const skip = (parseInt(page) - 1) * parseInt(pageSize);
      const limit = parseInt(pageSize);

      const [transactions, total] = await Promise.all([
        ProcessedTransaction.find(filter)
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .lean(),
        ProcessedTransaction.countDocuments(filter)
      ]);

      res.json({
        status: "success",
        data: { transactions },
        pagination: {
          page: parseInt(page),
          pageSize: parseInt(pageSize),
          total,
          totalPages: Math.ceil(total / limit)
        }
      });
    } catch (e) {
      next(e);
    }
  },

  /**
   * DELETE /admin/processed-transactions/:transactionId
   * Delete a processed transaction (to allow reprocessing for testing)
   */
  deleteProcessedTransaction: async (req, res, next) => {
    try {
      const { transactionId } = req.params;
      const result = await ProcessedTransaction.findOneAndDelete({ transactionId });
      
      if (!result) {
        return res.status(404).json({
          status: "error",
          message: "Processed transaction not found"
        });
      }

      res.json({
        status: "success",
        message: "Processed transaction deleted, webhook can now reprocess this transaction",
        data: { deleted: result }
      });
    } catch (e) {
      next(e);
    }
  },

  /**
   * DELETE /admin/processed-transactions/user/:userId
   * Delete all processed transactions for a user (for testing)
   */
  deleteUserProcessedTransactions: async (req, res, next) => {
    try {
      const { userId } = req.params;
      const result = await ProcessedTransaction.deleteMany({ userId });
      
      res.json({
        status: "success",
        message: `Deleted ${result.deletedCount} processed transactions for user`,
        data: { deletedCount: result.deletedCount }
      });
    } catch (e) {
      next(e);
    }
  },

  /**
   * POST /admin/cleanup-duplicate-subscriptions
   * Clean up duplicate UserSubscription records - keep only the most recent one per user+plan
   */
  cleanupDuplicateSubscriptions: async (req, res, next) => {
    try {
      // Find all users with duplicate subscriptions for the same plan
      const duplicates = await UserSubscription.aggregate([
        {
          $group: {
            _id: { userId: "$userId", planId: "$planId" },
            count: { $sum: 1 },
            ids: { $push: "$_id" },
            docs: { $push: { _id: "$_id", status: "$status", startDate: "$startDate", createdAt: "$createdAt" } }
          }
        },
        {
          $match: { count: { $gt: 1 } }
        }
      ]);

      let totalDeleted = 0;
      const cleanupDetails = [];

      for (const dup of duplicates) {
        // Sort by startDate desc, then createdAt desc - keep the most recent one
        const sorted = dup.docs.sort((a, b) => {
          const dateA = new Date(a.startDate || a.createdAt);
          const dateB = new Date(b.startDate || b.createdAt);
          return dateB - dateA;
        });

        // Keep the first one (most recent), delete the rest
        const toKeep = sorted[0];
        const toDelete = sorted.slice(1).map(d => d._id);

        if (toDelete.length > 0) {
          await UserSubscription.deleteMany({ _id: { $in: toDelete } });
          totalDeleted += toDelete.length;
          cleanupDetails.push({
            userId: dup._id.userId,
            planId: dup._id.planId,
            kept: toKeep._id,
            deleted: toDelete,
            deletedCount: toDelete.length
          });
        }
      }

      res.json({
        status: "success",
        message: `Cleaned up ${totalDeleted} duplicate subscription records`,
        data: {
          totalDuplicateGroups: duplicates.length,
          totalDeleted,
          details: cleanupDetails
        }
      });
    } catch (e) {
      next(e);
    }
  },
};
