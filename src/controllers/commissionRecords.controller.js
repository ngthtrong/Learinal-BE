const CommissionRecordsRepository = require('../repositories/commissionRecords.repository');

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
      const page = Math.max(1, parseInt(req.query.page || '1', 10));
      const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize || '20', 10)));
      
      const filter = req.user.role === 'Expert' 
        ? { expertId: userId } 
        : {}; // Admin can see all

      const { items, totalItems, totalPages } = await repo.paginate(
        filter,
        { page, pageSize, sort: { createdAt: -1 } }
      );

      // Calculate total earnings
      const totalEarnings = items.reduce((sum, item) => {
        return sum + (item.status === 'Paid' ? item.amount : 0);
      }, 0);

      const pendingEarnings = items.reduce((sum, item) => {
        return sum + (item.status === 'Pending' ? item.amount : 0);
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
          code: 'NotFound',
          message: 'Commission record not found',
        });
      }

      // Verify ownership for Experts
      if (req.user.role === 'Expert' && item.expertId.toString() !== req.user.id) {
        return res.status(403).json({
          code: 'Forbidden',
          message: 'Access denied',
        });
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
          code: 'NotFound',
          message: 'Commission record not found',
        });
      }

      if (commission.status !== 'Pending') {
        return res.status(400).json({
          code: 'InvalidState',
          message: 'Commission must be in Pending state',
        });
      }

      const updated = await repo.updateById(id, {
        status: 'Paid',
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
        .filter((c) => c.status === 'Paid')
        .reduce((sum, c) => sum + c.amount, 0);

      const totalPending = commissions
        .filter((c) => c.status === 'Pending')
        .reduce((sum, c) => sum + c.amount, 0);

      const totalValidations = commissions.length;

      res.status(200).json({
        totalEarned,
        totalPending,
        totalValidations,
        averagePerValidation: totalValidations > 0 ? (totalEarned + totalPending) / totalValidations : 0,
      });
    } catch (e) {
      next(e);
    }
  },
};
