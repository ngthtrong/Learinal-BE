/**
 * Middleware to check user's subscription entitlements
 */

const User = require("../models/user.model");
const SubscriptionPlan = require("../models/subscriptionPlan.model");

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
    const { userSubscriptionsService, usageTrackingRepository } = req.app.locals;

    // BƯỚC 1: Lấy subscription active của user
    let subscription = await userSubscriptionsService.getActiveSubscription(req.user.id);

    // Fallback: Kiểm tra User model nếu không tìm thấy UserSubscription
    if (!subscription || !subscription.plan) {
      const user = await User.findById(req.user.id).lean();
      if (user && user.subscriptionStatus === "Active" && user.subscriptionPlanId) {
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
      req.entitlement = { usedTests: 0, maxTests: "unlimited" };
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

    // BƯỚC 6: So sánh với giới hạn
    if (count >= maxMonthlyTestGenerations) {
      throw Object.assign(
        new Error(`Monthly test generation limit reached (${maxMonthlyTestGenerations})`),
        { status: 403, code: "LimitExceeded" }
      );
    }

    req.entitlement = { usedTests: count, maxTests: maxMonthlyTestGenerations };
    next();
  } catch (e) {
    next(e);
  }
}

async function checkValidationRequestLimit(req, res, next) {
  try {
    const { userSubscriptionsService, usageTrackingRepository } = req.app.locals;
    const logger = req.app.locals.logger || console;

    // Get active subscription from UserSubscription collection
    let subscription = await userSubscriptionsService.getActiveSubscription(req.user.id);

    // Fallback: Check User model if no UserSubscription found
    if (!subscription || !subscription.plan) {
      const user = await User.findById(req.user.id).lean();
      if (user && user.subscriptionStatus === "Active" && user.subscriptionPlanId) {
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
      req.entitlement = { usedRequests: 0, maxRequests: "unlimited" };
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

    logger.info(
      {
        userId: req.user.id,
        count,
        maxValidationRequests,
        billingCycleStart,
      },
      "[checkValidationRequestLimit] Usage count"
    );

    if (count >= maxValidationRequests) {
      logger.warn(
        {
          userId: req.user.id,
          count,
          maxValidationRequests,
        },
        "[checkValidationRequestLimit] Limit exceeded"
      );
      throw Object.assign(
        new Error(
          `Bạn đã hết lượt gửi kiểm duyệt trong tháng này (${count}/${maxValidationRequests}). Vui lòng nâng cấp gói để tiếp tục sử dụng.`
        ),
        { 
          status: 403, 
          code: "LimitExceeded",
          details: {
            used: count,
            limit: maxValidationRequests,
            feature: "validation_requests"
          }
        }
      );
    }

    req.entitlement = { usedRequests: count, maxRequests: maxValidationRequests };
    logger.info(
      {
        userId: req.user.id,
        usedRequests: count,
        maxRequests: maxValidationRequests,
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

    // Get active subscription from UserSubscription collection
    let subscription = await userSubscriptionsService.getActiveSubscription(req.user.id);

    // Fallback: Check User model if no UserSubscription found
    if (!subscription || !subscription.plan) {
      const user = await User.findById(req.user.id).lean();
      if (user && user.subscriptionStatus === "Active" && user.subscriptionPlanId) {
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

    // Get active subscription from UserSubscription collection
    let subscription = await userSubscriptionsService.getActiveSubscription(req.user.id);

    // Fallback: Check User model if no UserSubscription found
    if (!subscription || !subscription.plan) {
      const user = await User.findById(req.user.id).lean();
      if (user && user.subscriptionStatus === "Active" && user.subscriptionPlanId) {
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

module.exports = {
  checkQuestionGenerationLimit,
  checkValidationRequestLimit,
  checkSubjectLimit,
  checkCanShare,
};
