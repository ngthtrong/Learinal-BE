/**
 * Addon Packages Service
 * Business logic cho gói add-on: mua, sử dụng, kiểm tra quota
 * - Gói add-on không có thời hạn riêng, theo chu kỳ subscription hiện tại của learner
 */
const logger = require("../utils/logger");

class AddonPackagesService {
  constructor({ 
    addonPackagesRepository, 
    userAddonPurchasesRepository,
    usersRepository,
    userSubscriptionsRepository
  }) {
    this.addonPackagesRepo = addonPackagesRepository;
    this.userAddonPurchasesRepo = userAddonPurchasesRepository;
    this.usersRepo = usersRepository;
    this.userSubscriptionsRepo = userSubscriptionsRepository;
  }

  // ==================== ADDON PACKAGES CRUD (Admin) ====================

  /**
   * Lấy danh sách tất cả gói add-on (cho admin)
   */
  async getAllPackages(options = {}) {
    return this.addonPackagesRepo.findAllWithPagination(options);
  }

  /**
   * Lấy danh sách gói add-on đang active (cho user)
   */
  async getActivePackages() {
    return this.addonPackagesRepo.findActivePackages();
  }

  /**
   * Lấy chi tiết gói add-on theo ID
   */
  async getPackageById(packageId) {
    const pkg = await this.addonPackagesRepo.findById(packageId);
    if (!pkg) {
      throw Object.assign(new Error("Gói add-on không tồn tại"), {
        status: 404,
        code: "NotFound"
      });
    }
    return pkg;
  }

  /**
   * Tạo gói add-on mới (Admin)
   */
  async createPackage(data) {
    // Kiểm tra tên gói đã tồn tại chưa
    const existing = await this.addonPackagesRepo.findByName(data.packageName);
    if (existing) {
      throw Object.assign(new Error("Tên gói add-on đã tồn tại"), {
        status: 400,
        code: "DuplicateName"
      });
    }

    return this.addonPackagesRepo.create(data);
  }

  /**
   * Cập nhật gói add-on (Admin)
   */
  async updatePackage(packageId, data) {
    const pkg = await this.addonPackagesRepo.findById(packageId);
    if (!pkg) {
      throw Object.assign(new Error("Gói add-on không tồn tại"), {
        status: 404,
        code: "NotFound"
      });
    }

    // Nếu đổi tên, kiểm tra trùng
    if (data.packageName && data.packageName !== pkg.packageName) {
      const existing = await this.addonPackagesRepo.findByName(data.packageName);
      if (existing) {
        throw Object.assign(new Error("Tên gói add-on đã tồn tại"), {
          status: 400,
          code: "DuplicateName"
        });
      }
    }

    return this.addonPackagesRepo.updateById(packageId, data);
  }

  /**
   * Xóa gói add-on (Admin) - chỉ nên inactive thay vì xóa
   */
  async deletePackage(packageId) {
    const pkg = await this.addonPackagesRepo.findById(packageId);
    if (!pkg) {
      throw Object.assign(new Error("Gói add-on không tồn tại"), {
        status: 404,
        code: "NotFound"
      });
    }
    return this.addonPackagesRepo.deleteById(packageId);
  }

  // ==================== USER ADDON PURCHASES ====================

  /**
   * Mua gói add-on
   */
  async purchaseAddon(userId, addonPackageId, paymentReference, amountPaid) {
    // Lấy thông tin gói
    const pkg = await this.addonPackagesRepo.findById(addonPackageId);
    if (!pkg) {
      throw Object.assign(new Error("Gói add-on không tồn tại"), {
        status: 404,
        code: "NotFound"
      });
    }

    if (pkg.status !== "Active") {
      throw Object.assign(new Error("Gói add-on không còn khả dụng"), {
        status: 400,
        code: "PackageInactive"
      });
    }

    // Kiểm tra giới hạn mua (nếu có)
    if (pkg.maxPurchasesPerUser > 0) {
      const purchaseCount = await this.userAddonPurchasesRepo.countPurchasesByUser(userId, addonPackageId);
      if (purchaseCount >= pkg.maxPurchasesPerUser) {
        throw Object.assign(
          new Error(`Bạn đã mua gói này ${purchaseCount} lần. Giới hạn tối đa: ${pkg.maxPurchasesPerUser}`),
          { status: 400, code: "MaxPurchasesReached" }
        );
      }
    }

    // Verify số tiền thanh toán
    if (amountPaid !== pkg.price) {
      logger.warn(
        { userId, addonPackageId, expected: pkg.price, actual: amountPaid },
        "[AddonService] Amount mismatch"
      );
      throw Object.assign(
        new Error(`Số tiền thanh toán không khớp. Yêu cầu: ${pkg.price}, Nhận được: ${amountPaid}`),
        { status: 400, code: "AmountMismatch" }
      );
    }

    // Lấy subscription hiện tại của user để xác định expiryDate
    const currentSubscription = await this.userSubscriptionsRepo.findOne(
      { userId, status: "Active" },
      null,
      { sort: { startDate: -1 } }
    );

    if (!currentSubscription) {
      throw Object.assign(
        new Error("Bạn cần có gói subscription đang hoạt động để mua gói add-on"),
        { status: 400, code: "NoActiveSubscription" }
      );
    }

    // expiryDate của addon = endDate của subscription hiện tại
    const expiryDate = currentSubscription.endDate || null;

    // Tạo purchase record
    const purchase = await this.userAddonPurchasesRepo.create({
      userId,
      addonPackageId,
      packageSnapshot: {
        packageName: pkg.packageName,
        price: pkg.price,
        additionalTestGenerations: pkg.additionalTestGenerations,
        additionalValidationRequests: pkg.additionalValidationRequests
      },
      remainingTestGenerations: pkg.additionalTestGenerations,
      remainingValidationRequests: pkg.additionalValidationRequests,
      status: "Active",
      purchaseDate: new Date(),
      subscriptionId: currentSubscription._id,
      expiryDate,
      paymentReference,
      amountPaid
    });

    logger.info(
      { 
        userId, 
        addonPackageId, 
        packageName: pkg.packageName,
        purchaseId: purchase._id,
        testGenerations: pkg.additionalTestGenerations,
        validationRequests: pkg.additionalValidationRequests
      },
      "[AddonService] Addon purchased successfully"
    );

    return purchase;
  }

  /**
   * Lấy tổng quota add-on còn lại của user (remaining - đã bị trừ khi sử dụng)
   */
  async getUserAddonQuota(userId) {
    return this.userAddonPurchasesRepo.getTotalRemainingQuota(userId);
  }

  /**
   * Lấy tổng quota add-on đã mua từ đầu của user (purchased - không thay đổi)
   */
  async getUserAddonPurchasedQuota(userId) {
    return this.userAddonPurchasesRepo.getTotalPurchasedQuota(userId);
  }

  /**
   * Lấy danh sách add-on đã mua của user
   */
  async getUserAddons(userId, options = {}) {
    return this.userAddonPurchasesRepo.findByUserIdWithPackageInfo(userId, options);
  }

  /**
   * Lấy danh sách add-on đang active của user
   */
  async getUserActiveAddons(userId) {
    return this.userAddonPurchasesRepo.findActiveByUserId(userId);
  }

  /**
   * Kiểm tra và lấy quota từ add-on cho một action
   * @returns {boolean} true nếu có quota từ add-on và đã consume
   */
  async tryConsumeAddonQuota(userId, actionType) {
    const consumed = await this.userAddonPurchasesRepo.consumeQuota(userId, actionType);
    if (consumed) {
      logger.info(
        { 
          userId, 
          actionType, 
          purchaseId: consumed._id,
          remainingTestGenerations: consumed.remainingTestGenerations,
          remainingValidationRequests: consumed.remainingValidationRequests
        },
        "[AddonService] Addon quota consumed"
      );
      return true;
    }
    return false;
  }

  /**
   * Kiểm tra user có quota add-on cho action không (không consume)
   */
  async hasAddonQuotaFor(userId, actionType) {
    const addon = await this.userAddonPurchasesRepo.findAvailableForAction(userId, actionType);
    return !!addon;
  }

  /**
   * Đánh dấu các add-on đã hết hạn (chạy periodic job)
   */
  async expireAddons() {
    const result = await this.userAddonPurchasesRepo.markExpiredAddons();
    if (result.modifiedCount > 0) {
      logger.info(
        { expiredCount: result.modifiedCount },
        "[AddonService] Marked expired addons"
      );
    }
    return result;
  }

  // ==================== COMBINED QUOTA CHECK ====================

  /**
   * Lấy tổng quota (gói subscription + add-on) cho user
   */
  async getCombinedQuota(userId, subscriptionEntitlements) {
    const addonQuota = await this.getUserAddonQuota(userId);
    
    return {
      testGenerations: {
        fromSubscription: subscriptionEntitlements?.maxMonthlyTestGenerations || 0,
        fromAddons: addonQuota.totalTestGenerations
      },
      validationRequests: {
        fromSubscription: subscriptionEntitlements?.maxValidationRequests || 0,
        fromAddons: addonQuota.totalValidationRequests
      }
    };
  }
}

module.exports = AddonPackagesService;
