const BaseRepository = require("./base.repository");
const { PaymentBatch } = require("../models");

class PaymentBatchesRepository extends BaseRepository {
  constructor() {
    super(PaymentBatch);
  }

  /**
   * Find payment batches with filters
   */
  async findAllWithDetails({ status, expertId, page = 1, limit = 20 }) {
    const filter = {};
    if (status) filter.status = status;
    if (expertId) filter.expertId = expertId;

    const skip = (page - 1) * limit;
    const [batches, total] = await Promise.all([
      this.model
        .find(filter)
        .populate("expertId", "name email")
        .populate("createdBy", "name")
        .populate("completedBy", "name")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.model.countDocuments(filter),
    ]);

    return { batches, total, page, limit };
  }

  /**
   * Create a new payment batch
   */
  async createBatch(batchData) {
    return this.create(batchData);
  }

  /**
   * Mark batch as completed
   */
  async markAsCompleted(id, adminId, paymentNote) {
    return this.updateById(id, {
      status: "Completed",
      completedBy: adminId,
      completedAt: new Date(),
      paymentNote: paymentNote || undefined,
    });
  }

  /**
   * Cancel batch
   */
  async cancel(id) {
    return this.updateById(id, {
      status: "Cancelled",
    });
  }
}

module.exports = PaymentBatchesRepository;
