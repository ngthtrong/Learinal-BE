const AdminService = require("../services/admin.service");

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
   * GET /admin/financials?year=YYYY
   * Monthly financial statistics (subscriptions vs commissions)
   */
  getFinancials: async (req, res, next) => {
    try {
      const { year } = req.query;
      const data = await adminService.getFinancials(year);
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
};
