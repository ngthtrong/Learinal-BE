/**
 * Quota Notification Service
 * Gửi email cảnh báo khi lượt sử dụng còn lại là 5
 */
const logger = require("../utils/logger");
const { enqueueEmail } = require("../adapters/queue");
const notificationService = require("./notification.service");

// Threshold để gửi cảnh báo (còn lại 5 lượt)
const LOW_QUOTA_THRESHOLD = 5;

class QuotaNotificationService {
  constructor({ 
    usersRepository, 
    userSubscriptionsRepository,
    usageTrackingRepository,
    addonPackagesService
  }) {
    this.usersRepo = usersRepository;
    this.userSubscriptionsRepo = userSubscriptionsRepository;
    this.usageTrackingRepo = usageTrackingRepository;
    this.addonPackagesService = addonPackagesService;
    
    // Cache để tránh gửi email trùng lặp trong cùng một chu kỳ
    // Key: `${userId}_${quotaType}_${billingCycleStart.toISOString()}`
    this.sentNotifications = new Map();
  }

  /**
   * Tính ngày bắt đầu billing cycle hiện tại
   * @private
   */
  _getBillingCycleStart(subscriptionStartDate) {
    const now = new Date();
    const startDate = new Date(subscriptionStartDate);
    const billingDay = startDate.getDate();

    let cycleStart = new Date(now.getFullYear(), now.getMonth(), billingDay, 0, 0, 0, 0);

    if (cycleStart > now) {
      cycleStart.setMonth(cycleStart.getMonth() - 1);
    }

    return cycleStart;
  }

  /**
   * Kiểm tra xem đã gửi thông báo cho user này trong chu kỳ hiện tại chưa
   * @private
   */
  _hasNotificationSent(userId, quotaType, billingCycleStart) {
    const key = `${userId}_${quotaType}_${billingCycleStart.toISOString().split('T')[0]}`;
    return this.sentNotifications.has(key);
  }

  /**
   * Đánh dấu đã gửi thông báo
   * @private
   */
  _markNotificationSent(userId, quotaType, billingCycleStart) {
    const key = `${userId}_${quotaType}_${billingCycleStart.toISOString().split('T')[0]}`;
    this.sentNotifications.set(key, Date.now());
    
    // Cleanup old entries (older than 32 days)
    const thirtyTwoDaysAgo = Date.now() - 32 * 24 * 60 * 60 * 1000;
    for (const [k, v] of this.sentNotifications.entries()) {
      if (v < thirtyTwoDaysAgo) {
        this.sentNotifications.delete(k);
      }
    }
  }

  /**
   * Kiểm tra và gửi email cảnh báo low quota cho tạo đề
   * @param {string} userId - User ID
   * @param {Object} entitlement - Thông tin entitlement từ middleware
   */
  async checkAndNotifyLowTestGenerationQuota(userId, entitlement) {
    try {
      if (!entitlement || entitlement.maxTests === "unlimited") {
        return;
      }

      const { usedTests, maxTests, addonQuota } = entitlement;
      const totalQuota = maxTests + addonQuota;
      const remaining = totalQuota - usedTests;

      // Chỉ gửi khi còn đúng 5 lượt
      if (remaining !== LOW_QUOTA_THRESHOLD) {
        return;
      }

      // Lấy thông tin subscription để tính billing cycle
      const subscription = await this.userSubscriptionsRepo.findOne({ 
        userId, 
        status: "Active" 
      });
      
      const billingCycleStart = subscription 
        ? this._getBillingCycleStart(subscription.startDate || subscription.createdAt)
        : new Date();

      // Kiểm tra đã gửi chưa
      if (this._hasNotificationSent(userId, "test_generation", billingCycleStart)) {
        logger.debug({ userId }, "[QuotaNotification] Already sent test generation low quota notification");
        return;
      }

      // Lấy thông tin user để gửi email
      const user = await this.usersRepo.findById(userId);
      if (!user || !user.email) {
        logger.warn({ userId }, "[QuotaNotification] User not found or no email");
        return;
      }

      // Gửi email
      await this._sendLowQuotaEmail(user, {
        quotaType: "test_generation",
        featureName: "tạo đề",
        remaining,
        maxCount: totalQuota
      });

      // Gửi thông báo real-time
      await notificationService.emitLowQuotaWarning(userId, {
        quotaType: "test_generation",
        featureName: "tạo đề",
        remaining,
        maxCount: totalQuota
      });

      // Đánh dấu đã gửi
      this._markNotificationSent(userId, "test_generation", billingCycleStart);

      logger.info(
        { userId, remaining, totalQuota },
        "[QuotaNotification] Sent low test generation quota notification"
      );
    } catch (error) {
      // Không throw lỗi để không ảnh hưởng flow chính
      logger.error(
        { userId, error: error.message },
        "[QuotaNotification] Failed to check/send test generation quota notification"
      );
    }
  }

  /**
   * Kiểm tra và gửi email cảnh báo low quota cho validation request
   * @param {string} userId - User ID
   * @param {Object} entitlement - Thông tin entitlement từ middleware
   */
  async checkAndNotifyLowValidationQuota(userId, entitlement) {
    try {
      if (!entitlement || entitlement.maxRequests === "unlimited") {
        return;
      }

      const { usedRequests, maxRequests, addonQuota } = entitlement;
      const totalQuota = maxRequests + addonQuota;
      const remaining = totalQuota - usedRequests;

      // Chỉ gửi khi còn đúng 5 lượt
      if (remaining !== LOW_QUOTA_THRESHOLD) {
        return;
      }

      // Lấy thông tin subscription để tính billing cycle
      const subscription = await this.userSubscriptionsRepo.findOne({ 
        userId, 
        status: "Active" 
      });
      
      const billingCycleStart = subscription 
        ? this._getBillingCycleStart(subscription.startDate || subscription.createdAt)
        : new Date();

      // Kiểm tra đã gửi chưa
      if (this._hasNotificationSent(userId, "validation_request", billingCycleStart)) {
        logger.debug({ userId }, "[QuotaNotification] Already sent validation low quota notification");
        return;
      }

      // Lấy thông tin user để gửi email
      const user = await this.usersRepo.findById(userId);
      if (!user || !user.email) {
        logger.warn({ userId }, "[QuotaNotification] User not found or no email");
        return;
      }

      // Gửi email
      await this._sendLowQuotaEmail(user, {
        quotaType: "validation_request",
        featureName: "gửi kiểm duyệt",
        remaining,
        maxCount: totalQuota
      });

      // Gửi thông báo real-time
      await notificationService.emitLowQuotaWarning(userId, {
        quotaType: "validation_request",
        featureName: "gửi kiểm duyệt",
        remaining,
        maxCount: totalQuota
      });

      // Đánh dấu đã gửi
      this._markNotificationSent(userId, "validation_request", billingCycleStart);

      logger.info(
        { userId, remaining, totalQuota },
        "[QuotaNotification] Sent low validation quota notification"
      );
    } catch (error) {
      // Không throw lỗi để không ảnh hưởng flow chính
      logger.error(
        { userId, error: error.message },
        "[QuotaNotification] Failed to check/send validation quota notification"
      );
    }
  }

  /**
   * Gửi email cảnh báo low quota
   * @private
   */
  async _sendLowQuotaEmail(user, { quotaType, featureName, remaining, maxCount }) {
    const frontendUrl = process.env.FRONTEND_URL || "https://learinal.app";
    const addonUrl = `${frontendUrl}/addon-packages`;

    await enqueueEmail({
      to: user.email,
      subject: `Cảnh báo: Lượt ${featureName} sắp hết - Learinal`,
      templateId: "lowQuotaWarning",
      variables: {
        user_name: user.fullName || user.email.split("@")[0],
        quota_type: quotaType,
        feature_name: featureName,
        remaining_count: remaining.toString(),
        max_count: maxCount.toString(),
        addon_url: addonUrl
      },
      options: {
        dbTemplateId: "lowQuotaWarning"
      }
    });
  }
}

module.exports = QuotaNotificationService;
