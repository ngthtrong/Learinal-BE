module.exports = {
  list: async (req, res, next) => {
    try {
      const { subscriptionPlansService } = req.app.locals;
      const plans = await subscriptionPlansService.listActivePlans();
      res.json({ status: "success", data: { plans } });
    } catch (e) {
      next(e);
    }
  },

  // Admin-only via /admin route
  adminList: async (req, res, next) => {
    try {
      const { subscriptionPlansService } = req.app.locals;
      const { status } = req.query; // undefined | 'All' | 'Active' | 'Inactive'
      const plans = await subscriptionPlansService.listPlans({ status: status || undefined });
      res.json({ status: "success", data: { plans } });
    } catch (e) {
      next(e);
    }
  },

  create: async (req, res, next) => {
    try {
      const { subscriptionPlansService } = req.app.locals;
      const auditContext = {
        userId: req.user?.id,
        ipAddress: req.ip || req.headers["x-forwarded-for"],
        reason: req.body.reason, // Optional reason from request body
      };
      const plan = await subscriptionPlansService.createPlan(req.body, auditContext);
      res.status(201).json({ status: "success", data: { plan } });
    } catch (e) {
      next(e);
    }
  },

  get: async (req, res, next) => {
    try {
      const { subscriptionPlansService } = req.app.locals;
      const plan = await subscriptionPlansService.getPlanById(req.params.id);
      if (!plan) {
        throw Object.assign(new Error("Plan not found"), { status: 404 });
      }
      res.json({ status: "success", data: { plan } });
    } catch (e) {
      next(e);
    }
  },

  update: async (req, res, next) => {
    try {
      const { subscriptionPlansService } = req.app.locals;
      const auditContext = {
        userId: req.user?.id,
        ipAddress: req.ip || req.headers["x-forwarded-for"],
        reason: req.body.reason, // Optional reason from request body
      };
      const plan = await subscriptionPlansService.updatePlan(req.params.id, req.body, auditContext);
      if (!plan) {
        throw Object.assign(new Error("Plan not found"), { status: 404 });
      }
      res.json({ status: "success", data: { plan } });
    } catch (e) {
      next(e);
    }
  },

  archive: async (req, res, next) => {
    try {
      const { subscriptionPlansService } = req.app.locals;
      const auditContext = {
        userId: req.user?.id,
        ipAddress: req.ip || req.headers["x-forwarded-for"],
        reason: req.body?.reason,
      };
      await subscriptionPlansService.archivePlan(req.params.id, auditContext);
      res.json({ status: "success", message: "Plan archived" });
    } catch (e) {
      next(e);
    }
  },

  remove: async (req, res, next) => {
    try {
      const { subscriptionPlansService } = req.app.locals;
      const auditContext = {
        userId: req.user?.id,
        ipAddress: req.ip || req.headers["x-forwarded-for"],
        reason: req.body?.reason,
      };
      await subscriptionPlansService.deletePlan(req.params.id, auditContext);
      res.json({ status: "success", message: "Plan deleted" });
    } catch (e) {
      next(e);
    }
  },

  // ============ Audit Log Endpoints ============

  /**
   * Get audit history for a specific plan
   * GET /admin/subscription-plans/:id/audit-logs
   */
  getAuditHistory: async (req, res, next) => {
    try {
      const { subscriptionPlansService } = req.app.locals;
      const { limit = 50, skip = 0 } = req.query;
      const logs = await subscriptionPlansService.getPlanAuditHistory(req.params.id, {
        limit: parseInt(limit, 10),
        skip: parseInt(skip, 10),
      });
      res.json({ status: "success", data: { logs } });
    } catch (e) {
      next(e);
    }
  },

  /**
   * Get all audit logs with filters
   * GET /admin/subscription-plans/audit-logs
   */
  getAllAuditLogs: async (req, res, next) => {
    try {
      const { subscriptionPlansService } = req.app.locals;
      const { limit = 50, skip = 0, action, planId, changedBy } = req.query;
      const { logs, total } = await subscriptionPlansService.getAllAuditLogs({
        limit: parseInt(limit, 10),
        skip: parseInt(skip, 10),
        action,
        planId,
        changedBy,
      });
      res.json({ status: "success", data: { logs, total } });
    } catch (e) {
      next(e);
    }
  },

  /**
   * Get a specific audit log entry
   * GET /admin/subscription-plans/audit-logs/:logId
   */
  getAuditLogDetail: async (req, res, next) => {
    try {
      const { subscriptionPlansService } = req.app.locals;
      const log = await subscriptionPlansService.getAuditLogById(req.params.logId);
      if (!log) {
        throw Object.assign(new Error("Audit log not found"), { status: 404 });
      }
      res.json({ status: "success", data: { log } });
    } catch (e) {
      next(e);
    }
  },
};
