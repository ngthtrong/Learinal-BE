const BaseRepository = require("./base.repository");
const { BankAccount } = require("../models");

class BankAccountsRepository extends BaseRepository {
  constructor() {
    super(BankAccount);
  }

  /**
   * Find bank account by expert ID
   */
  async findByExpertId(expertId) {
    return this.findOne({ expertId });
  }

  /**
   * Find all bank accounts with optional status filter
   */
  async findAllWithExperts({ status, page = 1, limit = 20 }) {
    const filter = {};
    if (status) filter.status = status;

    const skip = (page - 1) * limit;
    
    const accounts = await this.model
      .find(filter)
      .populate("expertId", "name email")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();
      
    const total = await this.model.countDocuments(filter);

    return { accounts, total, page, limit };
  }

  /**
   * Verify bank account
   */
  async verify(id, adminId) {
    return this.updateById(id, {
      status: "Verified",
      verifiedBy: adminId,
      verifiedAt: new Date(),
      rejectionReason: null,
    });
  }

  /**
   * Reject bank account
   */
  async reject(id, adminId, reason) {
    return this.updateById(id, {
      status: "Rejected",
      verifiedBy: adminId,
      verifiedAt: new Date(),
      rejectionReason: reason,
    });
  }
}

module.exports = BankAccountsRepository;
