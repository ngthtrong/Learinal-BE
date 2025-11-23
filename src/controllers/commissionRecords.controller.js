const CommissionRecordsRepository = require("../repositories/commissionRecords.repository");

const repo = new CommissionRecordsRepository();

function mapId(doc) {
  if (!doc) return doc;
  const { _id, __v, ...rest } = doc;
  return { id: String(_id || rest.id), ...rest };
}

module.exports = {
  // GET /commission-records (for Experts - my commissions)
  list: async (req, res, next) => {
    try {
      const userId = req.user.id;
      const page = Math.max(1, parseInt(req.query.page || "1", 10));
      const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize || "20", 10)));

      const statusFilter = (req.query.status || "").trim();
      const q = (req.query.q || "").trim();
      const filter = req.user.role === "Expert" ? { expertId: userId } : {}; // Admin can see all
      if (statusFilter === "Pending" || statusFilter === "Paid") {
        filter.status = statusFilter;
      }
      // Admin search: by exact expertId or fuzzy expertName (requires aggregation populate)
      if (q && req.user.role === "Admin") {
        // If looks like ObjectId -> direct match on expertId
        const isObjectId = /^[0-9a-fA-F]{24}$/.test(q);
        if (isObjectId) {
          filter.expertId = q;
        } else {
          // Fallback: we'll later post-filter after query because commission record doesn't store expertName
        }
      }

      const paginateResult = await repo.paginate(filter, {
        page,
        pageSize,
        sort: { createdAt: -1 },
      });
      let items = paginateResult.items || [];
      let totalItems =
        paginateResult.totalItems ??
        paginateResult.meta?.totalItems ??
        paginateResult.meta?.total ??
        0;
      let totalPages = paginateResult.totalPages ?? paginateResult.meta?.totalPages ?? 1;

      // If fuzzy name search requested (q not ObjectId) and role Admin: fetch users matching name and filter
      if (q && req.user.role === "Admin" && !/^[0-9a-fA-F]{24}$/.test(q)) {
        const User = require("../models/user.model");
        const matchedExperts = await User.find({
          role: "Expert",
          fullName: { $regex: q, $options: "i" },
        })
          .select("_id")
          .lean();
        const allowedIds = new Set(matchedExperts.map((u) => String(u._id)));
        items = items.filter((it) => allowedIds.has(String(it.expertId)));
        totalItems = items.length;
        totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
      }

      // Attach expertName for each item
      if (items.length > 0) {
        const User = require("../models/user.model");
        const expertIds = [...new Set(items.map((it) => String(it.expertId)))];
        const experts = await User.find({ _id: { $in: expertIds } })
          .select("_id fullName")
          .lean();
        const nameMap = new Map(experts.map((u) => [String(u._id), u.fullName]));
        items = items.map((it) => ({ ...it, expertName: nameMap.get(String(it.expertId)) }));
      }

      // Calculate total earnings (using commissionAmount)
      const totalEarnings = items.reduce((sum, item) => {
        return sum + (item.status === "Paid" ? item.commissionAmount || 0 : 0);
      }, 0);

      const pendingEarnings = items.reduce((sum, item) => {
        return sum + (item.status === "Pending" ? item.commissionAmount || 0 : 0);
      }, 0);

      res.status(200).json({
        items: (items || []).map(mapId),
        meta: {
          page,
          pageSize,
          total: totalItems,
          totalPages,
          totalEarnings,
          pendingEarnings,
        },
      });
    } catch (e) {
      next(e);
    }
  },

  // GET /commission-records/:id
  get: async (req, res, next) => {
    try {
      const item = await repo.findById(req.params.id);
      if (!item) {
        return res.status(404).json({
          code: "NotFound",
          message: "Commission record not found",
        });
      }

      // Verify ownership for Experts
      if (req.user.role === "Expert" && item.expertId.toString() !== req.user.id) {
        return res.status(403).json({
          code: "Forbidden",
          message: "Access denied",
        });
      }
      // Attach expertName
      try {
        const User = require("../models/user.model");
        const expert = await User.findById(item.expertId).select("fullName").lean();
        if (expert) {
          item.expertName = expert.fullName;
        }
      } catch (_) {
        // non-fatal
      }

      res.status(200).json(mapId(item));
    } catch (e) {
      next(e);
    }
  },

  // PATCH /admin/commission-records/:id (Admin only - mark as Paid)
  markAsPaid: async (req, res, next) => {
    try {
      const { id } = req.params;
      const { paymentReference } = req.body;

      const commission = await repo.findById(id);
      if (!commission) {
        return res.status(404).json({
          code: "NotFound",
          message: "Commission record not found",
        });
      }

      if (commission.status !== "Pending") {
        return res.status(400).json({
          code: "InvalidState",
          message: "Commission must be in Pending state",
        });
      }

      const updated = await repo.updateById(id, {
        status: "Paid",
        paidAt: new Date(),
        paymentReference,
      });

      res.status(200).json(mapId(updated));
    } catch (e) {
      next(e);
    }
  },

  // GET /commission-records/summary (Expert - earnings summary)
  summary: async (req, res, next) => {
    try {
      const userId = req.user.id;

      // Get all commissions for this expert
      const commissions = await repo.find({ expertId: userId });

      const totalEarned = commissions
        .filter((c) => c.status === "Paid")
        .reduce((sum, c) => sum + (c.commissionAmount || 0), 0);

      const totalPending = commissions
        .filter((c) => c.status === "Pending")
        .reduce((sum, c) => sum + (c.commissionAmount || 0), 0);

      const totalValidations = commissions.length;

      res.status(200).json({
        totalEarned,
        totalPending,
        totalValidations,
        averagePerValidation:
          totalValidations > 0 ? (totalEarned + totalPending) / totalValidations : 0,
      });
    } catch (e) {
      next(e);
    }
  },
};
