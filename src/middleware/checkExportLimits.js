/**
 * @fileoverview Check Export Limits Middleware
 * @description Enforces export limits based on subscription entitlements
 * Phase 3.3 - Production Features
 */

const UserSubscription = require("../models/userSubscription.model");
const { AppError } = require("../utils/appError");

/**
 * Check if user has reached export limit for the month
 * Uses entitlements.exportLimits from subscription plan
 */
async function checkExportLimits(req, res, next) {
  try {
    const userId = req.user.id;

    // Find active subscription
    const subscription = await UserSubscription.findOne({
      userId: userId,
      status: "active",
      endDate: { $gte: new Date() },
    }).populate("planId");

    // If no subscription, check if free tier limits exist
    if (!subscription) {
      // Default free tier: 5 exports per month
      // TODO: Implement tracking in SystemSettings or User model
      // For now, allow but could add counter
      return next();
    }

    // Get export limits from entitlements
    const entitlements = subscription.planId.entitlements || {};
    const exportLimit = entitlements.exportLimits || entitlements.shareLimits;

    // If unlimited, allow
    if (exportLimit === "unlimited" || exportLimit === -1) {
      return next();
    }

    // If no limit set, use default of 20
    const monthlyLimit = typeof exportLimit === "number" ? exportLimit : 20;

    // Track exports this month
    // TODO: Implement actual tracking in User or separate ExportLog model
    // For now, we'll store in subscription metadata

    const now = new Date();
    const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    // Initialize or get export tracking
    if (!subscription.metadata) {
      subscription.metadata = {};
    }

    if (!subscription.metadata.exportTracking) {
      subscription.metadata.exportTracking = {
        month: firstDayOfMonth.toISOString(),
        count: 0,
      };
    }

    // Reset counter if new month
    const trackedMonth = new Date(subscription.metadata.exportTracking.month);
    if (trackedMonth < firstDayOfMonth) {
      subscription.metadata.exportTracking = {
        month: firstDayOfMonth.toISOString(),
        count: 0,
      };
    }

    // Check if limit reached
    if (subscription.metadata.exportTracking.count >= monthlyLimit) {
      throw new AppError(
        `Export limit reached. Your plan allows ${monthlyLimit} exports per month. Please upgrade to export more.`,
        429
      );
    }

    // Increment counter
    subscription.metadata.exportTracking.count += 1;
    subscription.markModified("metadata"); // Required for nested object updates
    await subscription.save();

    // Attach info to request for logging
    req.exportTracking = {
      limit: monthlyLimit,
      used: subscription.metadata.exportTracking.count,
      remaining: monthlyLimit - subscription.metadata.exportTracking.count,
    };

    next();
  } catch (error) {
    next(error);
  }
}

module.exports = checkExportLimits;
