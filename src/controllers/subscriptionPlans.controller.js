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
      const plan = await subscriptionPlansService.createPlan(req.body);
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
      const plan = await subscriptionPlansService.updatePlan(req.params.id, req.body);
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
      await subscriptionPlansService.archivePlan(req.params.id);
      res.json({ status: "success", message: "Plan archived" });
    } catch (e) {
      next(e);
    }
  },

  remove: async (req, res, next) => {
    try {
      const { subscriptionPlansService } = req.app.locals;
      await subscriptionPlansService.deletePlan(req.params.id);
      res.json({ status: "success", message: "Plan deleted" });
    } catch (e) {
      next(e);
    }
  },
};
