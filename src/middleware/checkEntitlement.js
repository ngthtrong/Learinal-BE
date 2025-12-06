/**
 * Middleware to check user's subscription entitlements
 * Hỗ trợ cả quota từ subscription plan và add-on packages
 */

const User = require("../models/user.model");
const SubscriptionPlan = require("../models/subscriptionPlan.model");
const logger = require("../utils/logger");

/**
 * Tính ngày bắt đầu của billing cycle hiện tại dựa trên ngày mua gói
 *
 * VÍ DỤ:
 * - User mua gói ngày 15/11/2025
 * - billingDay = 15
 *
 * TH1: Hôm nay là 20/11/2025 (sau ngày 15)
 *   → cycleStart = 15/11/2025 (billing cycle: 15/11 → 14/12)
 *
 * TH2: Hôm nay là 10/12/2025 (trước ngày 15)
 *   → cycleStart = 15/11/2025 (vẫn trong chu kỳ cũ)
 *
 * TH3: Hôm nay là 20/12/2025 (sau ngày 15)
 *   → cycleStart = 15/12/2025 (chu kỳ mới)
 *
 * @param {Date} subscriptionStartDate - Ngày bắt đầu subscription
 * @returns {Date} Ngày bắt đầu billing cycle hiện tại
 */
function getBillingCycleStart(subscriptionStartDate) {
  const now = new Date();
  const startDate = new Date(subscriptionStartDate);
  const billingDay = startDate.getDate(); // Lấy ngày trong tháng (1-31)

  // Tạo date với năm/tháng hiện tại + billing day
  // Ví dụ: billingDay=15, tháng hiện tại là 12 → 15/12/2025
  let cycleStart = new Date(now.getFullYear(), now.getMonth(), billingDay, 0, 0, 0, 0);

  // Nếu chưa đến ngày billing trong tháng này → Dùng tháng trước
  // Ví dụ: Hôm nay 10/12, billingDay=15 → Dùng 15/11
  if (cycleStart > now) {
    cycleStart.setMonth(cycleStart.getMonth() - 1);
  }

  return cycleStart;
}

async function checkQuestionGenerationLimit(req, res, next) {
  try {
    const { userSubscriptionsService, usageTrackingRepository, addonPackagesService } = req.app.locals;

    // BƯỚC 1: Lấy subscription active của user (đã bao gồm real-time endDate check)
    let subscription = await userSubscriptionsService.getActiveSubscription(req.user.id);

    // Fallback: Kiểm tra User model nếu không tìm thấy UserSubscription
    if (!subscription || !subscription.plan) {
      const user = await User.findById(req.user.id).lean();
      const now = new Date();
      // Also check subscriptionRenewalDate to ensure subscription hasn't expired
      const isNotExpired = !user.subscriptionRenewalDate || new Date(user.subscriptionRenewalDate) > now;
      
      if (user && user.subscriptionStatus === "Active" && user.subscriptionPlanId && isNotExpired) {
        const plan = await SubscriptionPlan.findById(user.subscriptionPlanId).lean();
        if (plan) {
          subscription = {
            plan: {
              id: plan._id.toString(),
              planName: plan.planName,
              entitlements: plan.entitlements,
            },
          };
        }
      }
    }

    // BƯỚC 2: Kiểm tra có subscription không
    if (!subscription || !subscription.plan) {
      throw Object.assign(new Error("No active subscription plan"), {
        status: 403,
        code: "NoSubscription",
      });
    }

    const { maxMonthlyTestGenerations } = subscription.plan.entitlements;

    // BƯỚC 3: Nếu unlimited thì bỏ qua kiểm tra
    if (maxMonthlyTestGenerations === "unlimited") {
      req.entitlement = { usedTests: 0, maxTests: "unlimited", addonQuota: 0 };
      return next();
    }

    // BƯỚC 4: Tính billing cycle start (ngày bắt đầu chu kỳ hiện tại)
    const subscriptionStartDate = subscription.startDate || subscription.createdAt || new Date();
    const billingCycleStart = getBillingCycleStart(subscriptionStartDate);

    // BƯỚC 5: Đếm số lần đã tạo đề trong chu kỳ này
    // Đếm trong usageTracking (không đếm questionSets để tránh lỗ hổng xóa-tạo lại)
    const count = await usageTrackingRepository.countActions(
      req.user.id,
      "question_set_generation",
      billingCycleStart
    );

    // BƯỚC 6: Lấy quota từ add-on packages
    let addonQuota = 0;
    if (addonPackagesService) {
      const addonQuotaInfo = await addonPackagesService.getUserAddonQuota(req.user.id);
      addonQuota = addonQuotaInfo.totalTestGenerations || 0;
    }

    // BƯỚC 7: Tính tổng quota = subscription + addon
    const totalQuota = maxMonthlyTestGenerations + addonQuota;

    // BƯỚC 8: So sánh với tổng giới hạn
    if (count >= totalQuota) {
      logger.warn(
        {
          userId: req.user.id,
          used: count,
          subscriptionLimit: maxMonthlyTestGenerations,
          addonQuota,
          totalQuota
        },
        "[checkQuestionGenerationLimit] Limit exceeded"
      );
      throw Object.assign(
        new Error(`Bạn đã hết lượt tạo đề trong tháng này (${count}/${maxMonthlyTestGenerations} từ gói + ${addonQuota} từ add-on). Vui lòng mua thêm gói add-on để tiếp tục.`),
        { 
          status: 403, 
          code: "LimitExceeded",
          details: {
            used: count,
            subscriptionLimit: maxMonthlyTestGenerations,
            addonQuota,
            totalQuota,
            feature: "question_set_generation",
            upgradeUrl: "/addon-packages"
          }
        }
      );
    }

    // Đánh dấu cần dùng addon quota nếu subscription quota đã hết
    req.useAddonQuota = count >= maxMonthlyTestGenerations;
    req.entitlement = { 
      usedTests: count, 
      maxTests: maxMonthlyTestGenerations, 
      addonQuota,
      totalQuota,
      remainingFromSubscription: Math.max(0, maxMonthlyTestGenerations - count),
      remainingFromAddon: addonQuota
    };
    next();
  } catch (e) {
    next(e);
  }
}

async function checkValidationRequestLimit(req, res, next) {
  try {
    const { userSubscriptionsService, usageTrackingRepository, addonPackagesService } = req.app.locals;

    // Get active subscription from UserSubscription collection (includes real-time endDate check)
    let subscription = await userSubscriptionsService.getActiveSubscription(req.user.id);

    // Fallback: Check User model if no UserSubscription found
    if (!subscription || !subscription.plan) {
      const user = await User.findById(req.user.id).lean();
      const now = new Date();
      // Also check subscriptionRenewalDate to ensure subscription hasn't expired
      const isNotExpired = !user.subscriptionRenewalDate || new Date(user.subscriptionRenewalDate) > now;
      
      if (user && user.subscriptionStatus === "Active" && user.subscriptionPlanId && isNotExpired) {
        const plan = await SubscriptionPlan.findById(user.subscriptionPlanId).lean();
        if (plan) {
          subscription = {
            plan: {
              id: plan._id.toString(),
              planName: plan.planName,
              entitlements: plan.entitlements,
            },
          };
        }
      }
    }

    if (!subscription || !subscription.plan) {
      logger.warn({ userId: req.user.id }, "[checkValidationRequestLimit] No active subscription");
      throw Object.assign(new Error("Bạn cần có gói đăng ký để sử dụng tính năng này"), {
        status: 403,
        code: "NoSubscription",
      });
    }

    const { maxValidationRequests } = subscription.plan.entitlements;
    logger.info(
      { 
        userId: req.user.id, 
        planName: subscription.plan.planName,
        maxValidationRequests 
      }, 
      "[checkValidationRequestLimit] Checking validation request limit"
    );

    // If unlimited, skip check
    if (maxValidationRequests === "unlimited") {
      req.entitlement = { usedRequests: 0, maxRequests: "unlimited", addonQuota: 0 };
      return next();
    }

    // Get billing cycle start based on subscription start date
    const subscriptionStartDate = subscription.startDate || subscription.createdAt || new Date();
    const billingCycleStart = getBillingCycleStart(subscriptionStartDate);

    // Count usage actions (not existing resources) to prevent delete-and-recreate abuse
    const count = await usageTrackingRepository.countActions(
      req.user.id,
      "validation_request",
      billingCycleStart
    );

    // Lấy quota từ add-on packages
    let addonQuota = 0;
    if (addonPackagesService) {
      const addonQuotaInfo = await addonPackagesService.getUserAddonQuota(req.user.id);
      addonQuota = addonQuotaInfo.totalValidationRequests || 0;
    }

    // Tính tổng quota = subscription + addon
    const totalQuota = maxValidationRequests + addonQuota;

    logger.info(
      {
        userId: req.user.id,
        count,
        maxValidationRequests,
        addonQuota,
        totalQuota,
        billingCycleStart,
      },
      "[checkValidationRequestLimit] Usage count"
    );

    if (count >= totalQuota) {
      logger.warn(
        {
          userId: req.user.id,
          count,
          maxValidationRequests,
          addonQuota,
          totalQuota,
        },
        "[checkValidationRequestLimit] Limit exceeded"
      );
      throw Object.assign(
        new Error(
          `Bạn đã hết lượt gửi kiểm duyệt trong tháng này (${count}/${maxValidationRequests} từ gói + ${addonQuota} từ add-on). Vui lòng mua thêm gói add-on để tiếp tục.`
        ),
        { 
          status: 403, 
          code: "LimitExceeded",
          details: {
            used: count,
            subscriptionLimit: maxValidationRequests,
            addonQuota,
            totalQuota,
            feature: "validation_requests",
            upgradeUrl: "/addon-packages"
          }
        }
      );
    }

    // Đánh dấu cần dùng addon quota nếu subscription quota đã hết
    req.useAddonQuota = count >= maxValidationRequests;
    req.entitlement = { 
      usedRequests: count, 
      maxRequests: maxValidationRequests,
      addonQuota,
      totalQuota,
      remainingFromSubscription: Math.max(0, maxValidationRequests - count),
      remainingFromAddon: addonQuota
    };
    logger.info(
      {
        userId: req.user.id,
        usedRequests: count,
        maxRequests: maxValidationRequests,
        addonQuota,
        totalQuota,
      },
      "[checkValidationRequestLimit] Check passed"
    );
    next();
  } catch (e) {
    next(e);
  }
}

async function checkSubjectLimit(req, res, next) {
  try {
    const { userSubscriptionsService, subjectsRepository } = req.app.locals;

    // Get active subscription from UserSubscription collection (includes real-time endDate check)
    let subscription = await userSubscriptionsService.getActiveSubscription(req.user.id);

    // Fallback: Check User model if no UserSubscription found
    if (!subscription || !subscription.plan) {
      const user = await User.findById(req.user.id).lean();
      const now = new Date();
      // Also check subscriptionRenewalDate to ensure subscription hasn't expired
      const isNotExpired = !user.subscriptionRenewalDate || new Date(user.subscriptionRenewalDate) > now;
      
      if (user && user.subscriptionStatus === "Active" && user.subscriptionPlanId && isNotExpired) {
        const plan = await SubscriptionPlan.findById(user.subscriptionPlanId).lean();
        if (plan) {
          subscription = {
            plan: {
              id: plan._id.toString(),
              planName: plan.planName,
              entitlements: plan.entitlements,
            },
          };
        }
      }
    }

    if (!subscription || !subscription.plan) {
      throw Object.assign(new Error("No active subscription plan"), {
        status: 403,
        code: "NoSubscription",
      });
    }

    const { maxSubjects } = subscription.plan.entitlements;

    // If unlimited (-1), skip check
    if (maxSubjects === -1 || maxSubjects === "unlimited") {
      req.entitlement = { usedSubjects: 0, maxSubjects: "unlimited" };
      return next();
    }

    // Count subjects created by user
    const count = await subjectsRepository.countDocuments({
      userId: req.user.id,
    });

    const logger = require("../utils/logger");
    logger.info(
      {
        userId: req.user.id,
        currentSubjects: count,
        maxSubjects,
        planName: subscription.plan.planName,
      },
      "[checkSubjectLimit] Checking subject limit"
    );

    if (count >= maxSubjects) {
      throw Object.assign(
        new Error(
          `Đã đạt giới hạn số môn học (${maxSubjects}). Vui lòng nâng cấp gói đăng ký để tạo thêm môn học.`
        ),
        { status: 403, code: "LimitExceeded" }
      );
    }

    req.entitlement = { usedSubjects: count, maxSubjects };
    next();
  } catch (e) {
    next(e);
  }
}

async function checkCanShare(req, res, next) {
  try {
    const { userSubscriptionsService } = req.app.locals;

    // Get active subscription from UserSubscription collection (includes real-time endDate check)
    let subscription = await userSubscriptionsService.getActiveSubscription(req.user.id);

    // Fallback: Check User model if no UserSubscription found
    if (!subscription || !subscription.plan) {
      const user = await User.findById(req.user.id).lean();
      const now = new Date();
      // Also check subscriptionRenewalDate to ensure subscription hasn't expired
      const isNotExpired = !user.subscriptionRenewalDate || new Date(user.subscriptionRenewalDate) > now;
      
      if (user && user.subscriptionStatus === "Active" && user.subscriptionPlanId && isNotExpired) {
        const plan = await SubscriptionPlan.findById(user.subscriptionPlanId).lean();
        if (plan) {
          subscription = {
            plan: {
              id: plan._id.toString(),
              planName: plan.planName,
              entitlements: plan.entitlements,
            },
          };
        }
      }
    }

    if (!subscription || !subscription.plan) {
      throw Object.assign(new Error("No active subscription plan"), {
        status: 403,
        code: "NoSubscription",
      });
    }

    const { canShare } = subscription.plan.entitlements;

    // If sharing not allowed
    if (!canShare) {
      throw Object.assign(
        new Error(
          "Gói đăng ký của bạn không cho phép chia sẻ. Vui lòng nâng cấp để chia sẻ nội dung."
        ),
        { status: 403, code: "SharingNotAllowed" }
      );
    }

    next();
  } catch (e) {
    next(e);
  }
}

/**
 * Middleware to check document upload limits
 * Checks both per-subject limit and total document limit
 */
async function checkDocumentUploadLimit(req, res, next) {
  try {
    const { userSubscriptionsService, documentsRepository, addonPackagesService, usageTrackingRepository } = req.app.locals;
    const subjectId = req.body.subjectId;

    // Get active subscription
    let subscription = await userSubscriptionsService.getActiveSubscription(req.user.id);
    let billingCycleStart = null;

    // Fallback: Check User model if no UserSubscription found
    if (!subscription || !subscription.plan) {
      const user = await User.findById(req.user.id).lean();
      const now = new Date();
      const isNotExpired = !user.subscriptionRenewalDate || new Date(user.subscriptionRenewalDate) > now;
      
      if (user && user.subscriptionStatus === "Active" && user.subscriptionPlanId && isNotExpired) {
        const plan = await SubscriptionPlan.findById(user.subscriptionPlanId).lean();
        if (plan) {
          subscription = {
            plan: {
              id: plan._id.toString(),
              planName: plan.planName,
              entitlements: plan.entitlements || {},
            },
            startDate: user.subscriptionStartDate || user.createdAt,
          };
        }
      }
    }

    // If no subscription, allow upload (no limits) - or throw error based on business rule
    if (!subscription || !subscription.plan) {
      // Option 1: Allow unlimited for users without subscription (free tier)
      req.documentLimits = {
        maxDocumentsPerSubject: "unlimited",
        maxTotalDocuments: "unlimited",
        addonDocumentUploads: 0,
      };
      return next();
      
      // Option 2: Block users without subscription
      // throw Object.assign(new Error("No active subscription plan"), {
      //   status: 403,
      //   code: "NoSubscription",
      // });
    }

    // Calculate billing cycle start for tracking-based counting
    let subscriptionStartDate = subscription.startDate || subscription.createdAt;
    if (subscriptionStartDate && !(subscriptionStartDate instanceof Date)) {
      subscriptionStartDate = new Date(subscriptionStartDate);
    }
    if (!subscriptionStartDate || isNaN(subscriptionStartDate.getTime())) {
      subscriptionStartDate = new Date();
    }
    
    const now = new Date();
    const dayOfMonth = subscriptionStartDate.getDate();
    billingCycleStart = new Date(now.getFullYear(), now.getMonth(), dayOfMonth);
    if (billingCycleStart > now) {
      billingCycleStart.setMonth(billingCycleStart.getMonth() - 1);
    }

    const entitlements = subscription.plan.entitlements || {};
    const { maxDocumentsPerSubject, maxTotalDocuments } = entitlements;

    // Get addon quota for documents
    let addonDocumentUploads = 0;
    if (addonPackagesService) {
      const addonQuota = await addonPackagesService.getUserAddonQuota(req.user.id);
      addonDocumentUploads = addonQuota.totalDocumentUploads || 0;
    }

    // Check per-subject limit if defined (count actual documents, not uploads - deletion allowed per subject)
    if (maxDocumentsPerSubject && maxDocumentsPerSubject !== "unlimited" && maxDocumentsPerSubject !== -1 && subjectId) {
      const subjectDocCount = await documentsRepository.countDocuments({
        subjectId: subjectId,
        ownerId: req.user.id,
      });

      if (subjectDocCount >= maxDocumentsPerSubject) {
        logger.warn(
          {
            userId: req.user.id,
            subjectId,
            currentDocs: subjectDocCount,
            maxDocs: maxDocumentsPerSubject,
          },
          "[checkDocumentUploadLimit] Per-subject document limit exceeded"
        );
        throw Object.assign(
          new Error(
            `Đã đạt giới hạn số tài liệu cho môn học này (${maxDocumentsPerSubject}). Vui lòng xóa bớt tài liệu hoặc nâng cấp gói đăng ký.`
          ),
          { status: 403, code: "DocumentLimitExceeded" }
        );
      }
    }

    // Check total document upload limit (tracking-based to prevent delete abuse)
    if (maxTotalDocuments && maxTotalDocuments !== "unlimited" && maxTotalDocuments !== -1) {
      // Count uploads in current billing cycle from usage tracking
      let usedDocumentUploads = 0;
      if (usageTrackingRepository) {
        usedDocumentUploads = await usageTrackingRepository.countActions(
          req.user.id,
          "document_upload",
          billingCycleStart
        );
      }

      // Tổng giới hạn = subscription limit + addon remaining
      const effectiveLimit = maxTotalDocuments + addonDocumentUploads;

      if (usedDocumentUploads >= effectiveLimit) {
        logger.warn(
          {
            userId: req.user.id,
            usedDocumentUploads,
            maxTotal: maxTotalDocuments,
            addonDocumentUploads,
            effectiveLimit,
            billingCycleStart,
          },
          "[checkDocumentUploadLimit] Total document upload limit exceeded"
        );
        throw Object.assign(
          new Error(
            `Đã đạt giới hạn tổng số lượt tải tài liệu trong chu kỳ này (${effectiveLimit}). Vui lòng mua thêm lượt tải hoặc đợi chu kỳ mới.`
          ),
          { status: 403, code: "TotalDocumentLimitExceeded" }
        );
      }

      // Đánh dấu nếu cần consume addon quota (khi đã vượt subscription limit)
      req.shouldConsumeAddonDocumentQuota = usedDocumentUploads >= maxTotalDocuments && addonDocumentUploads > 0;
    }

    // Attach info to request for potential use in controller
    req.documentLimits = {
      maxDocumentsPerSubject: maxDocumentsPerSubject || "unlimited",
      maxTotalDocuments: maxTotalDocuments || "unlimited",
      addonDocumentUploads,
      billingCycleStart,
    };

    next();
  } catch (e) {
    next(e);
  }
}

module.exports = {
  checkQuestionGenerationLimit,
  checkValidationRequestLimit,
  checkSubjectLimit,
  checkCanShare,
  checkDocumentUploadLimit,
};
