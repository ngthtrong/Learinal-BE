const createSepayClient = require("../adapters/sepayClient");
const { sepay, email: emailCfg } = require("../config");
const { UsersRepository, SubscriptionPlansRepository, AddonPackagesRepository, UserAddonPurchasesRepository, UserSubscriptionsRepository } = require("../repositories");
const { ProcessedTransaction } = require("../models");
const { enqueueEmail } = require("../adapters/queue");
const logger = require("../utils/logger");

function extractUserId(text) {
  if (!text || typeof text !== "string") return null;
  // Match both "uid:xxxxx" (with colon) and "uidxxxxx" (without colon)
  // Banks may strip special characters from QR content
  const m = text.match(/uid:?([a-f0-9]{24})/i);
  return m ? m[1].toLowerCase() : null;
}

function extractPlanId(text) {
  if (!text || typeof text !== "string") return null;
  // Extract planId from content: "planId:<24hex>" or "planid<24hex>"
  const m = text.match(/planid:?([a-f0-9]{24})/i);
  return m ? m[1].toLowerCase() : null;
}

function extractAddonId(text) {
  if (!text || typeof text !== "string") return null;
  // Extract addonId from content: 
  // - Full format: "addonId:<24hex>" or "addonid<24hex>"
  // - Short format: "ad<hex>" (có thể < 24 ký tự vì bị ngân hàng cắt)
  // Match tối thiểu 10 ký tự hex để tránh false positive
  const m = text.match(/(?:addonid|ad):?([a-f0-9]{10,24})/i);
  return m ? m[1].toLowerCase() : null;
}

class SepayScanService {
  constructor({ usersRepository, subscriptionPlansRepository, addonPackagesRepository, userAddonPurchasesRepository, userSubscriptionsRepository } = {}) {
    this.usersRepository = usersRepository || new UsersRepository();
    this.subscriptionPlansRepository =
      subscriptionPlansRepository || new SubscriptionPlansRepository();
    this.addonPackagesRepository = addonPackagesRepository || new AddonPackagesRepository();
    this.userAddonPurchasesRepository = userAddonPurchasesRepository || new UserAddonPurchasesRepository();
    this.userSubscriptionsRepository = userSubscriptionsRepository || new UserSubscriptionsRepository();
    this.client = createSepayClient(sepay);
  }

  /**
   * Scan recent transactions and activate user subscriptions matching criteria.
   * Criteria: transaction_content includes 'uid:<24hex>' and 'planId:<24hex>', amount matches plan price.
   * Filters: uses SEPAY_QR_ACCOUNT if present; limit defaults to 50.
   */
  async scanRecent({ accountNumber, limit = 50, debug = false } = {}) {
    const acc = accountNumber || process.env.SEPAY_QR_ACCOUNT || sepay.qrAccount || undefined;
    const params = { limit: Math.min(Math.max(Number(limit) || 50, 1), 5000) };
    if (acc) params.account_number = acc;

    const data = await this.client.listTransactions(params);
    const txs = Array.isArray(data?.transactions) ? data.transactions : [];

    // Fetch all active subscription plans for matching
    const allPlans = await this.subscriptionPlansRepository.findMany(
      { status: "Active" },
      { limit: 100, skip: 0 }
    );
    if (!allPlans || allPlans.length === 0) {
      throw new Error("No active subscription plans found in database");
    }

    // Create a map of planId -> plan for quick lookup
    const planMap = new Map();
    allPlans.forEach((plan) => {
      const planId = (plan.id || plan._id).toString().toLowerCase();
      planMap.set(planId, plan);
    });

    let matched = 0;
    let updated = 0;
    const details = [];

    for (const tx of txs) {
      const amountIn = Number(tx?.amount_in || 0);
      const content = String(tx?.transaction_content || "");

      // Check for SEVQR prefix
      if (!/SEVQR/i.test(content)) continue;

      const userId = extractUserId(content);
      const planId = extractPlanId(content);

      if (!userId || !planId) continue;

      // Find matching plan by planId
      const plan = planMap.get(planId);
      if (!plan) {
        details.push({ userId, txId: tx.id, amountIn, content, action: "plan_not_found", planId });
        continue;
      }

      // Verify amount matches plan price
      if (amountIn !== plan.price) {
        details.push({
          userId,
          txId: tx.id,
          amountIn,
          content,
          action: "amount_mismatch",
          expected: plan.price,
          actual: amountIn,
        });
        continue;
      }

      matched++;
      const curr = await this.usersRepository.findByUserId(userId);
      if (curr && curr.subscriptionStatus === "None") {
        // Calculate renewal date based on billing cycle
        const renewalDate = new Date();
        if (plan.billingCycle === "Monthly") {
          renewalDate.setMonth(renewalDate.getMonth() + 1);
        } else if (plan.billingCycle === "Yearly") {
          renewalDate.setFullYear(renewalDate.getFullYear() + 1);
        }

        // Update user with subscription details
        await this.usersRepository.updateUserById(userId, {
          subscriptionStatus: "Active",
          subscriptionPlanId: plan.id || plan._id,
          subscriptionRenewalDate: renewalDate,
        });
        updated++;
        details.push({
          userId,
          txId: tx.id,
          amountIn,
          content,
          planId,
          planName: plan.planName,
          action: "activated",
        });

        // Send payment success email to learner
        // Supports both SendGrid Dynamic Template and database template fallback
        try {
          const emailVariables = {
            user_name: curr.fullName,
            plan_name: plan.planName,
            amount: amountIn.toLocaleString("vi-VN"),
            transaction_id: tx.id || tx.reference_number || "N/A",
            renewal_date: renewalDate.toLocaleDateString("vi-VN", {
              year: "numeric",
              month: "long",
              day: "numeric",
            }),
            billing_cycle: plan.billingCycle,
          };

          await enqueueEmail({
            to: curr.email,
            subject: "Thanh toán thành công - Payment Successful",
            // Use SendGrid template if configured, otherwise fallback to database template
            templateId: emailCfg.paymentSuccessTemplateId || null,
            variables: emailVariables,
            options: {
              // Database template ID for fallback
              dbTemplateId: "paymentSuccess",
            },
          });
          logger.info(
            { 
              userId, 
              email: curr.email, 
              planName: plan.planName,
              usingSendGridTemplate: !!emailCfg.paymentSuccessTemplateId,
            },
            "Payment success email enqueued"
          );
        } catch (emailError) {
          logger.error(
            { userId, error: emailError.message },
            "Failed to enqueue payment success email"
          );
          // Don't fail the transaction if email fails
        }
      } else {
        details.push({
          userId,
          txId: tx.id,
          amountIn,
          content,
          planId,
          planName: plan.planName,
          action: "noop",
        });
      }
    }

    const result = { total: txs.length, matched, updated, details };
    if (debug) {
      result.samples = txs.slice(0, 10).map((tx) => ({
        id: tx.id,
        account_number: tx.account_number,
        transaction_date: tx.transaction_date,
        amount_in: tx.amount_in,
        transaction_content: tx.transaction_content,
        reference_number: tx.reference_number,
        bank_brand_name: tx.bank_brand_name,
      }));
    }
    return result;
  }

  /**
   * Scan recent transactions and activate addon packages for users.
   * Criteria: transaction_content includes 'uid:<24hex>' and 'addonId:<24hex>', amount matches addon price.
   */
  async scanRecentAddons({ accountNumber, limit = 50, debug = false } = {}) {
    const acc = accountNumber || process.env.SEPAY_QR_ACCOUNT || sepay.qrAccount || undefined;
    const params = { limit: Math.min(Math.max(Number(limit) || 50, 1), 5000) };
    if (acc) params.account_number = acc;

    const data = await this.client.listTransactions(params);
    const txs = Array.isArray(data?.transactions) ? data.transactions : [];

    // Fetch all active addon packages for matching
    const allAddons = await this.addonPackagesRepository.findActivePackages();
    if (!allAddons || allAddons.length === 0) {
      logger.warn("No active addon packages found in database");
      return { total: txs.length, matched: 0, activated: 0, details: [] };
    }

    // Create a map of addonId -> addon for quick lookup
    // Also store by prefix for partial matching (bank may truncate QR content)
    const addonMap = new Map();
    const addonList = [];
    allAddons.forEach((addon) => {
      const addonId = (addon.id || addon._id).toString().toLowerCase();
      addonMap.set(addonId, addon);
      addonList.push({ id: addonId, addon });
    });

    // Helper function to find addon by exact match or prefix
    const findAddonById = (partialId) => {
      // Try exact match first
      if (addonMap.has(partialId)) {
        return addonMap.get(partialId);
      }
      // Try prefix match (for truncated IDs)
      for (const { id, addon } of addonList) {
        if (id.startsWith(partialId)) {
          return addon;
        }
      }
      return null;
    };

    let matched = 0;
    let activated = 0;
    const details = [];

    for (const tx of txs) {
      const amountIn = Number(tx?.amount_in || 0);
      const content = String(tx?.transaction_content || "");

      // Check for SEVQR addon prefix (full: "SEVQR addon" or short: "SEVQR AD")
      if (!/SEVQR\s*(addon|AD)/i.test(content)) continue;

      const userId = extractUserId(content);
      const addonId = extractAddonId(content);

      if (!userId || !addonId) continue;

      // Find matching addon by addonId (exact or prefix match)
      const addon = findAddonById(addonId);
      if (!addon) {
        details.push({ userId, txId: tx.id, amountIn, content, action: "addon_not_found", addonId });
        continue;
      }

      // Verify amount matches addon price
      if (amountIn !== addon.price) {
        details.push({
          userId,
          txId: tx.id,
          amountIn,
          content,
          action: "amount_mismatch",
          expected: addon.price,
          actual: amountIn,
        });
        continue;
      }

      matched++;

      const txId = tx.id?.toString() || tx.reference_number;

      // Check if this transaction already processed (in ProcessedTransaction collection)
      // This prevents re-processing even if UserAddonPurchase was deleted for testing
      const processedTx = await ProcessedTransaction.findOne({ transactionId: txId });
      if (processedTx) {
        details.push({
          userId,
          txId: tx.id,
          amountIn,
          content,
          addonId,
          addonName: addon.packageName,
          action: "already_processed_tx",
        });
        continue;
      }

      // Also check UserAddonPurchase (backward compatibility)
      const existingPurchase = await this.userAddonPurchasesRepository.findOne({
        paymentReference: txId
      });

      if (existingPurchase) {
        // Mark as processed to prevent future checks
        await ProcessedTransaction.create({
          transactionId: txId,
          type: "addon",
          userId,
          referenceId: addonId,
          amount: amountIn,
          content,
          result: "skipped",
          note: "Already had UserAddonPurchase"
        });
        details.push({
          userId,
          txId: tx.id,
          amountIn,
          content,
          addonId,
          addonName: addon.packageName,
          action: "already_processed",
        });
        continue;
      }

      // Get user's current active subscription to link addon with it
      let subscriptionId = null;
      let expiryDate = null;
      
      const activeSubscription = await this.userSubscriptionsRepository.findOne({
        userId,
        status: "Active"
      }, null, { sort: { currentPeriodEnd: -1 } });

      if (activeSubscription) {
        subscriptionId = activeSubscription._id || activeSubscription.id;
        // Addon expires when subscription expires
        expiryDate = activeSubscription.currentPeriodEnd || null;
      }

      // Create addon purchase
      const purchase = await this.userAddonPurchasesRepository.create({
        userId,
        addonPackageId: addon._id || addon.id,
        subscriptionId,
        packageSnapshot: {
          packageName: addon.packageName,
          price: addon.price,
          additionalTestGenerations: addon.additionalTestGenerations,
          additionalValidationRequests: addon.additionalValidationRequests
        },
        remainingTestGenerations: addon.additionalTestGenerations,
        remainingValidationRequests: addon.additionalValidationRequests,
        status: "Active",
        purchaseDate: new Date(),
        expiryDate,
        paymentReference: txId,
        amountPaid: amountIn
      });

      // Mark transaction as processed to prevent re-processing
      await ProcessedTransaction.create({
        transactionId: txId,
        type: "addon",
        userId,
        referenceId: (addon._id || addon.id).toString(),
        amount: amountIn,
        content,
        result: "activated",
        note: `Created UserAddonPurchase: ${purchase._id}`
      });

      activated++;
      details.push({
        userId,
        txId: tx.id,
        amountIn,
        content,
        addonId,
        addonName: addon.packageName,
        purchaseId: purchase._id,
        testGenerations: addon.additionalTestGenerations,
        validationRequests: addon.additionalValidationRequests,
        action: "activated",
      });

      logger.info(
        { 
          userId, 
          addonId, 
          addonName: addon.packageName, 
          purchaseId: purchase._id,
          testGenerations: addon.additionalTestGenerations,
          validationRequests: addon.additionalValidationRequests
        },
        "[SepayScan] Addon package activated"
      );

      // Send addon purchase success email
      try {
        const user = await this.usersRepository.findByUserId(userId);
        if (user && emailCfg.paymentSuccessTemplateId) {
          const features = [];
          if (addon.additionalTestGenerations > 0) {
            features.push(`${addon.additionalTestGenerations} lượt tạo đề`);
          }
          if (addon.additionalValidationRequests > 0) {
            features.push(`${addon.additionalValidationRequests} lượt kiểm duyệt`);
          }

          await enqueueEmail({
            to: user.email,
            subject: "Mua gói add-on thành công - Addon Purchase Successful",
            templateId: emailCfg.paymentSuccessTemplateId,
            variables: {
              user_name: user.fullName,
              plan_name: `Gói Add-on: ${addon.packageName}`,
              amount: amountIn.toLocaleString("vi-VN"),
              transaction_id: tx.id || tx.reference_number || "N/A",
              renewal_date: expiryDate 
                ? expiryDate.toLocaleDateString("vi-VN", { year: "numeric", month: "long", day: "numeric" })
                : "Không hết hạn",
              billing_cycle: `${features.join(" + ")}`,
            },
          });
          logger.info(
            { userId, email: user.email, addonName: addon.packageName },
            "Addon purchase success email enqueued"
          );
        }
      } catch (emailError) {
        logger.error(
          { userId, error: emailError.message },
          "Failed to enqueue addon purchase success email"
        );
      }
    }

    const result = { total: txs.length, matched, activated, details };
    if (debug) {
      result.samples = txs.slice(0, 10).map((tx) => ({
        id: tx.id,
        account_number: tx.account_number,
        transaction_date: tx.transaction_date,
        amount_in: tx.amount_in,
        transaction_content: tx.transaction_content,
        reference_number: tx.reference_number,
        bank_brand_name: tx.bank_brand_name,
      }));
    }
    return result;
  }
}

module.exports = SepayScanService;
