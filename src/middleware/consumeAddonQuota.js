/**
 * Middleware to consume addon quota after successful action
 * This middleware should be used AFTER the actual action is completed successfully
 */
const logger = require("../utils/logger");

/**
 * Consume addon quota for question set generation
 * Should be called after successfully tracking usage
 */
async function consumeAddonQuotaForGeneration(req, res, next) {
  try {
    // Only consume if marked that addon quota should be used
    if (!req.useAddonQuota) {
      return next();
    }

    const { addonPackagesService } = req.app.locals;
    if (!addonPackagesService) {
      return next();
    }

    const consumed = await addonPackagesService.tryConsumeAddonQuota(
      req.user.id,
      "question_set_generation"
    );

    if (consumed) {
      logger.info(
        { userId: req.user.id, action: "question_set_generation" },
        "[consumeAddonQuota] Addon quota consumed for question generation"
      );
    }

    next();
  } catch (e) {
    // Don't fail the request if addon consumption fails
    logger.error(
      { userId: req.user?.id, error: e.message },
      "[consumeAddonQuota] Failed to consume addon quota"
    );
    next();
  }
}

/**
 * Consume addon quota for validation request
 * Should be called after successfully tracking usage
 */
async function consumeAddonQuotaForValidation(req, res, next) {
  try {
    // Only consume if marked that addon quota should be used
    if (!req.useAddonQuota) {
      return next();
    }

    const { addonPackagesService } = req.app.locals;
    if (!addonPackagesService) {
      return next();
    }

    const consumed = await addonPackagesService.tryConsumeAddonQuota(
      req.user.id,
      "validation_request"
    );

    if (consumed) {
      logger.info(
        { userId: req.user.id, action: "validation_request" },
        "[consumeAddonQuota] Addon quota consumed for validation request"
      );
    }

    next();
  } catch (e) {
    // Don't fail the request if addon consumption fails
    logger.error(
      { userId: req.user?.id, error: e.message },
      "[consumeAddonQuota] Failed to consume addon quota"
    );
    next();
  }
}

module.exports = {
  consumeAddonQuotaForGeneration,
  consumeAddonQuotaForValidation,
};
