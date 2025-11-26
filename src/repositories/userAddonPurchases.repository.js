/**
 * User Addon Purchases Repository
 * CRUD operations và query cho lịch sử mua add-on của user
 */
const BaseRepository = require("./base.repository");
const UserAddonPurchase = require("../models/userAddonPurchase.model");

class UserAddonPurchasesRepository extends BaseRepository {
  constructor() {
    super(UserAddonPurchase);
  }

  /**
   * Lấy tất cả add-on purchases của user
   */
  async findByUserId(userId, options = {}) {
    const { status, sort = { purchaseDate: -1 }, limit = 100, skip = 0 } = options;
    const filter = { userId };
    if (status) {
      filter.status = status;
    }
    return this.findMany(filter, { sort, limit, skip });
  }

  /**
   * Lấy add-on purchases đang active và còn quota của user
   */
  async findActiveByUserId(userId) {
    const now = new Date();
    return this.find(
      {
        userId,
        status: "Active",
        $and: [
          {
            $or: [
              { expiryDate: null },
              { expiryDate: { $gt: now } }
            ]
          },
          {
            $or: [
              { remainingTestGenerations: { $gt: 0 } },
              { remainingValidationRequests: { $gt: 0 } }
            ]
          }
        ]
      },
      null,
      { sort: { purchaseDate: 1 }, lean: true } // FIFO - dùng gói mua trước
    );
  }

  /**
   * Lấy tổng số lượt còn lại từ tất cả add-on của user
   */
  async getTotalRemainingQuota(userId) {
    const now = new Date();
    const result = await this.model.aggregate([
      {
        $match: {
          userId: require("mongoose").Types.ObjectId.createFromHexString(userId.toString()),
          status: "Active",
          $or: [
            { expiryDate: null },
            { expiryDate: { $gt: now } }
          ]
        }
      },
      {
        $group: {
          _id: null,
          totalTestGenerations: { $sum: "$remainingTestGenerations" },
          totalValidationRequests: { $sum: "$remainingValidationRequests" }
        }
      }
    ]);

    return result[0] || { totalTestGenerations: 0, totalValidationRequests: 0 };
  }

  /**
   * Lấy tổng số lượt addon đã mua từ đầu (từ packageSnapshot - không thay đổi)
   * Dùng để hiển thị tổng quota: subscription + addon purchased
   * Bao gồm cả addon đã Depleted (hết quota) vì ta muốn biết tổng đã mua
   */
  async getTotalPurchasedQuota(userId) {
    const now = new Date();
    const result = await this.model.aggregate([
      {
        $match: {
          userId: require("mongoose").Types.ObjectId.createFromHexString(userId.toString()),
          // Bao gồm cả Active và Depleted, chỉ loại trừ Expired
          status: { $in: ["Active", "Depleted"] },
          $or: [
            { expiryDate: null },
            { expiryDate: { $gt: now } }
          ]
        }
      },
      {
        $group: {
          _id: null,
          totalTestGenerations: { $sum: "$packageSnapshot.additionalTestGenerations" },
          totalValidationRequests: { $sum: "$packageSnapshot.additionalValidationRequests" }
        }
      }
    ]);

    return result[0] || { totalTestGenerations: 0, totalValidationRequests: 0 };
  }

  /**
   * Tìm add-on purchase có quota cho action type cụ thể (FIFO)
   */
  async findAvailableForAction(userId, actionType) {
    const now = new Date();
    const quotaField = actionType === "question_set_generation" 
      ? "remainingTestGenerations" 
      : "remainingValidationRequests";
    
    return this.findOne(
      {
        userId,
        status: "Active",
        [quotaField]: { $gt: 0 },
        $or: [
          { expiryDate: null },
          { expiryDate: { $gt: now } }
        ]
      },
      null,
      { sort: { purchaseDate: 1 }, lean: false } // FIFO, không lean để có thể save
    );
  }

  /**
   * Tiêu thụ quota từ add-on (FIFO)
   * @returns {Object|null} - Add-on đã tiêu thụ hoặc null nếu không có quota
   */
  async consumeQuota(userId, actionType) {
    const now = new Date();
    const quotaField = actionType === "question_set_generation" 
      ? "remainingTestGenerations" 
      : "remainingValidationRequests";

    // Tìm add-on có quota (FIFO - mua trước dùng trước)
    const addon = await this.model.findOne(
      {
        userId,
        status: "Active",
        [quotaField]: { $gt: 0 },
        $or: [
          { expiryDate: null },
          { expiryDate: { $gt: now } }
        ]
      },
      null,
      { sort: { purchaseDate: 1 } }
    );

    if (!addon) {
      return null;
    }

    // Giảm quota
    addon[quotaField] -= 1;

    // Kiểm tra nếu hết cả 2 loại quota thì đánh dấu Depleted
    if (addon.remainingTestGenerations === 0 && addon.remainingValidationRequests === 0) {
      addon.status = "Depleted";
    }

    await addon.save();
    return addon.toObject();
  }

  /**
   * Đếm số lần user đã mua một gói add-on cụ thể
   */
  async countPurchasesByUser(userId, addonPackageId) {
    return this.count({
      userId,
      addonPackageId
    });
  }

  /**
   * Đánh dấu các add-on đã hết hạn
   */
  async markExpiredAddons() {
    const now = new Date();
    return this.updateMany(
      {
        status: "Active",
        expiryDate: { $lte: now, $ne: null }
      },
      { status: "Expired" }
    );
  }

  /**
   * Lấy lịch sử mua add-on của user với thông tin gói
   */
  async findByUserIdWithPackageInfo(userId, options = {}) {
    const { status, page = 1, pageSize = 20 } = options;
    const filter = { userId };
    if (status) {
      filter.status = status;
    }
    
    const skip = (page - 1) * pageSize;
    const [purchases, total] = await Promise.all([
      this.model
        .find(filter)
        .populate("addonPackageId", "packageName description")
        .sort({ purchaseDate: -1 })
        .skip(skip)
        .limit(pageSize)
        .lean(),
      this.count(filter)
    ]);

    return {
      purchases,
      pagination: {
        page,
        pageSize,
        totalItems: total,
        totalPages: Math.ceil(total / pageSize)
      }
    };
  }
}

module.exports = UserAddonPurchasesRepository;
