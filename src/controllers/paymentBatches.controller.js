const logger = require("../utils/logger");

module.exports = {
  /**
   * Create payment batch for an expert (Admin only)
   * POST /admin/payment-batches
   */
  createBatch: async (req, res, next) => {
    try {
      const { paymentBatchService } = req.app.locals;
      const adminId = req.user?.id;
      const { expertId } = req.body;

      if (!adminId) {
        return res.status(401).json({ code: "Unauthorized", message: "Missing user" });
      }

      if (!expertId) {
        return res.status(400).json({
          code: "BadRequest",
          message: "Vui lòng cung cấp ID chuyên gia",
        });
      }

      const batch = await paymentBatchService.createBatchForExpert(expertId, adminId);

      return res.status(201).json({
        code: "Success",
        message: "Tạo đợt thanh toán thành công",
        data: batch,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Complete payment batch (Admin only)
   * PUT /admin/payment-batches/:id/complete
   */
  completeBatch: async (req, res, next) => {
    try {
      const { paymentBatchService } = req.app.locals;
      const adminId = req.user?.id;
      const { id } = req.params;
      const { paymentNote } = req.body;

      if (!adminId) {
        return res.status(401).json({ code: "Unauthorized", message: "Missing user" });
      }

      const batch = await paymentBatchService.completeBatch(id, adminId, paymentNote);

      logger.info(
        { adminId, batchId: id, expertId: batch.expertId, totalAmount: batch.totalAmount },
        "[PaymentBatch] Admin completed payment batch"
      );

      return res.status(200).json({
        code: "Success",
        message: "Xác nhận thanh toán thành công",
        data: batch,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Get all payment batches (Admin only)
   * GET /admin/payment-batches
   */
  getAllBatches: async (req, res, next) => {
    try {
      const { paymentBatchService } = req.app.locals;
      const { status, expertId, page = 1, limit = 20 } = req.query;

      const result = await paymentBatchService.getAllBatches({
        status,
        expertId,
        page: parseInt(page),
        limit: parseInt(limit),
      });

      return res.status(200).json({
        code: "Success",
        data: result,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Get batch by ID (Admin only)
   * GET /admin/payment-batches/:id
   */
  getBatchById: async (req, res, next) => {
    try {
      const { paymentBatchService } = req.app.locals;
      const { id } = req.params;

      const batch = await paymentBatchService.getBatchById(id);

      if (!batch) {
        return res.status(404).json({
          code: "NotFound",
          message: "Không tìm thấy đợt thanh toán",
        });
      }

      return res.status(200).json({
        code: "Success",
        data: batch,
      });
    } catch (error) {
      next(error);
    }
  },
};
