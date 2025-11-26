const { UsersRepository, SubscriptionPlansRepository, AddonPackagesRepository, UserAddonPurchasesRepository, UserSubscriptionsRepository } = require("../repositories");
const { ProcessedTransaction } = require("../models");
const crypto = require("crypto");
const { sepay, email: emailCfg } = require("../config");
const createSepayClient = require("../adapters/sepayClient");
const { enqueueEmail } = require("../adapters/queue");
const logger = require("../utils/logger");

const usersRepo = new UsersRepository();
const subscriptionPlansRepo = new SubscriptionPlansRepository();
const addonPackagesRepo = new AddonPackagesRepository();
const userAddonPurchasesRepo = new UserAddonPurchasesRepository();
const userSubscriptionsRepo = new UserSubscriptionsRepository();

function extractUserIdFromText(text) {
  if (!text || typeof text !== "string") return null;
  // Match both "uid:xxxxx" (with colon) and "uidxxxxx" (without colon)
  // Banks may strip special characters from QR content
  const m = text.match(/uid:?([a-f0-9]{24})/i);
  return m ? m[1].toLowerCase() : null;
}

function extractPlanId(text) {
  if (!text || typeof text !== "string") return null;
  // Extract planId from content: "planId:<hex>" or "planid<hex>"
  // Banks may truncate QR content, so allow 4-24 hex chars for partial matching
  const m = text.match(/planid:?([a-f0-9]{4,24})/i);
  return m ? m[1].toLowerCase() : null;
}

function extractAddonId(text) {
  if (!text || typeof text !== "string") return null;
  // Extract addonId: "ad<hex>" (có thể < 24 ký tự vì bị ngân hàng cắt)
  const m = text.match(/(?:addonid|ad):?([a-f0-9]{10,24})/i);
  return m ? m[1].toLowerCase() : null;
}

module.exports = {
  stripe: async (req, res, next) => {
    try {
      // Stripe webhook handling not currently used
      // SePay is the primary payment processor
      // If Stripe integration is needed, implement webhook verification and event handling here
      res.status(200).json({ received: true });
    } catch (e) {
      next(e);
    }
  },

  // Sepay webhook handler: when Sepay sends notification, fetch recent transactions and activate matching users
  // Instead of relying on webhook payload, we query Sepay API for last 20 transactions and match criteria.
  sepay: async (req, res, next) => {
    try {
      // Optional signature verification if SEPAY_WEBHOOK_SECRET is configured
      if (sepay?.webhookSecret) {
        const sig = req.get("Sepay-Signature") || req.get("X-Sepay-Signature") || req.get("X-Signature");
        const ts = req.get("Sepay-Timestamp") || req.get("X-Sepay-Timestamp") || req.get("X-Timestamp");
        if (!sig) {
          return res.status(401).json({ code: "Unauthorized", message: "Missing signature" });
        }
        const base = ts ? `${ts}.${req.rawBody || JSON.stringify(req.body)}` : (req.rawBody || JSON.stringify(req.body));
        const computed = crypto.createHmac("sha256", sepay.webhookSecret).update(base).digest("hex");
        const a = Buffer.from(String(sig), "utf8");
        const b = Buffer.from(String(computed), "utf8");
        if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
          return res.status(401).json({ code: "Unauthorized", message: "Invalid signature" });
        }
        // Optional: replay protection by timestamp age if ts present
        const tol = Number(process.env.SEPAY_WEBHOOK_TOLERANCE_SEC || 300);
        if (ts && Number.isFinite(tol)) {
          const age = Math.floor(Date.now() / 1000) - Number(ts);
          if (Number.isFinite(age) && age > tol) {
            return res.status(400).json({ code: "BadRequest", message: "Stale webhook" });
          }
        }
      }

      // Fetch last 20 transactions from Sepay API
      const client = createSepayClient(sepay);
      const params = {
        account_number: sepay.qrAccount,
        limit: 20,
      };
      
      const data = await client.listTransactions(params);
      const transactions = Array.isArray(data?.transactions) ? data.transactions : [];

      // Only process transactions from the last 1 hour to avoid re-processing old ones after DB reset
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      const recentTransactions = transactions.filter(tx => {
        const txDate = tx.transaction_date ? new Date(tx.transaction_date) : null;
        return txDate && txDate >= oneHourAgo;
      });

      // DEBUG LOG
      logger.info({
        totalTransactions: transactions.length,
        recentTransactions: recentTransactions.length,
        oneHourAgo: oneHourAgo.toISOString(),
        allContents: transactions.map(tx => ({ 
          content: tx.transaction_content, 
          date: tx.transaction_date,
          amount: tx.amount_in 
        }))
      }, "[Webhook] DEBUG - All transactions from Sepay");

      // Fetch all active subscription plans for matching
      const allPlans = await subscriptionPlansRepo.findMany(
        { status: "Active" }, 
        { limit: 100, skip: 0 }
      );
      if (!allPlans || allPlans.length === 0) {
        return res.status(500).json({ 
          ok: false, 
          code: "ConfigurationError",
          message: "No active subscription plans found in database" 
        });
      }

      // Create a map of planId -> plan for quick lookup
      // Also store list for prefix matching (bank may truncate QR content)
      const planMap = new Map();
      const planList = [];
      allPlans.forEach(plan => {
        const planId = (plan.id || plan._id).toString().toLowerCase();
        planMap.set(planId, plan);
        planList.push({ id: planId, plan });
      });

      // Helper to find plan by exact match or prefix (with amount verification)
      // If multiple plans match prefix, return the one matching the amount
      const findPlanById = (partialId, expectedAmount = null) => {
        if (planMap.has(partialId)) return planMap.get(partialId);
        // Try prefix match for truncated IDs
        const candidates = [];
        for (const { id, plan } of planList) {
          if (id.startsWith(partialId)) {
            candidates.push(plan);
          }
        }
        if (candidates.length === 0) return null;
        if (candidates.length === 1) return candidates[0];
        // Multiple matches - try to find one with matching price
        if (expectedAmount !== null) {
          const byPrice = candidates.find(p => p.price === expectedAmount);
          if (byPrice) return byPrice;
        }
        // Return first candidate if no price match
        return candidates[0];
      };

      let matched = 0;
      let updated = 0;
      const results = [];

      // Process each recent transaction for subscriptions
      for (const tx of recentTransactions) {
        const amountIn = Number(tx?.amount_in || 0);
        const content = String(tx?.transaction_content || "");

        // Check for SEVQR prefix (but NOT addon - skip those with AD/addon)
        if (!/SEVQR/i.test(content)) {
          logger.info({ content }, "[Webhook] Skip - no SEVQR prefix");
          continue;
        }
        if (/SEVQR\s*(addon|AD)/i.test(content)) {
          logger.info({ content }, "[Webhook] Skip - is addon transaction");
          continue;
        }

        const userId = extractUserIdFromText(content);
        const planId = extractPlanId(content);

        logger.info({ content, userId, planId, amountIn }, "[Webhook] Extracted IDs from content");

        if (!userId || !planId) {
          logger.info({ content, userId, planId }, "[Webhook] Skip - missing userId or planId");
          continue;
        }

        // Find matching plan by planId (exact or prefix match, with amount hint)
        const plan = findPlanById(planId, amountIn);
        if (!plan) {
          logger.info({ planId, availablePlans: Array.from(planMap.keys()) }, "[Webhook] Plan not found in map");
          results.push({ userId, txId: tx.id, action: "plan_not_found", planId });
          continue;
        }

        // Verify amount matches plan price
        if (amountIn !== plan.price) {
          logger.info({ amountIn, planPrice: plan.price, planId: plan._id }, "[Webhook] Amount mismatch");
          results.push({ userId, txId: tx.id, action: "amount_mismatch", expected: plan.price, actual: amountIn });
          continue;
        }

        matched++;
        const txId = tx.id?.toString() || tx.reference_number;

        // Check if already processed
        const processedTx = await ProcessedTransaction.findOne({ transactionId: txId });
        if (processedTx) {
          results.push({ userId, txId, planId, action: "already_processed" });
          continue;
        }

        // Check and update user
        const current = await usersRepo.findByUserId(userId);
        logger.info({ 
          userId, 
          userFound: !!current, 
          currentStatus: current?.subscriptionStatus 
        }, "[Webhook] User lookup result");

        if (current && current.subscriptionStatus === "None") {
          // Calculate renewal date based on billing cycle
          const renewalDate = new Date();
          if (plan.billingCycle === "Monthly") {
            renewalDate.setMonth(renewalDate.getMonth() + 1);
          } else if (plan.billingCycle === "Yearly") {
            renewalDate.setFullYear(renewalDate.getFullYear() + 1);
          }

          // Update user with full subscription details
          await usersRepo.updateUserById(userId, { 
            subscriptionStatus: "Active",
            subscriptionPlanId: plan.id || plan._id,
            subscriptionRenewalDate: renewalDate,
          });

          // Mark as processed
          await ProcessedTransaction.create({
            transactionId: txId,
            type: "subscription",
            userId,
            referenceId: (plan.id || plan._id).toString(),
            amount: amountIn,
            content,
            result: "activated"
          });

          // Send payment success email
          try {
            const emailVariables = {
              user_name: current.fullName || current.email,
              plan_name: plan.planName,
              amount: amountIn.toLocaleString("vi-VN"),
              transaction_id: txId || "N/A",
              renewal_date: renewalDate.toLocaleDateString("vi-VN", {
                year: "numeric",
                month: "long",
                day: "numeric",
              }),
              billing_cycle: plan.billingCycle,
            };

            await enqueueEmail({
              to: current.email,
              subject: "Thanh toán thành công - Payment Successful",
              templateId: emailCfg.paymentSuccessTemplateId || null,
              variables: emailVariables,
              options: {
                dbTemplateId: "paymentSuccess",
              },
            });
            logger.info(
              { userId, email: current.email, planName: plan.planName },
              "[Webhook] Payment success email enqueued"
            );
          } catch (emailError) {
            logger.error(
              { userId, error: emailError.message },
              "[Webhook] Failed to enqueue payment success email"
            );
          }

          updated++;
          results.push({ userId, txId, planId, planName: plan.planName, action: "activated" });
          logger.info({ userId, planId, planName: plan.planName }, "[Webhook] Subscription activated");
        } else if (current) {
          logger.info({ userId, currentStatus: current.subscriptionStatus }, "[Webhook] User already has subscription or not None");
          results.push({ userId, txId, planId, planName: plan.planName, action: "already_active_or_not_none" });
        } else {
          logger.info({ userId }, "[Webhook] User not found");
          results.push({ userId, txId, planId, action: "user_not_found" });
        }
      }

      // ========== ADDON PACKAGES PROCESSING ==========
      // Fetch all active addon packages
      const allAddons = await addonPackagesRepo.findActivePackages();
      const addonMap = new Map();
      const addonList = [];
      if (allAddons && allAddons.length > 0) {
        allAddons.forEach((addon) => {
          const addonId = (addon.id || addon._id).toString().toLowerCase();
          addonMap.set(addonId, addon);
          addonList.push({ id: addonId, addon });
        });
      }

      // Helper to find addon by exact or prefix match
      const findAddonById = (partialId) => {
        if (addonMap.has(partialId)) return addonMap.get(partialId);
        for (const { id, addon } of addonList) {
          if (id.startsWith(partialId)) return addon;
        }
        return null;
      };

      let addonMatched = 0;
      let addonActivated = 0;
      const addonResults = [];

      for (const tx of recentTransactions) {
        const amountIn = Number(tx?.amount_in || 0);
        const content = String(tx?.transaction_content || "");

        // Check for SEVQR AD (addon) prefix
        if (!/SEVQR\s*(addon|AD)/i.test(content)) continue;

        const userId = extractUserIdFromText(content);
        const addonId = extractAddonId(content);

        if (!userId || !addonId) continue;

        const addon = findAddonById(addonId);
        if (!addon) {
          addonResults.push({ userId, txId: tx.id, addonId, action: "addon_not_found" });
          continue;
        }

        if (amountIn !== addon.price) {
          addonResults.push({ userId, txId: tx.id, addonId, action: "amount_mismatch", expected: addon.price, actual: amountIn });
          continue;
        }

        addonMatched++;
        const txId = tx.id?.toString() || tx.reference_number;

        // Check if already processed
        const processedTx = await ProcessedTransaction.findOne({ transactionId: txId });
        if (processedTx) {
          addonResults.push({ userId, txId, addonId, action: "already_processed" });
          continue;
        }

        // Get user info for email
        const user = await usersRepo.findByUserId(userId);
        if (!user) {
          addonResults.push({ userId, txId: tx.id, addonId, action: "user_not_found" });
          continue;
        }

        // Get user's active subscription for expiry date
        let subscriptionId = null;
        let expiryDate = null;
        const activeSubscription = await userSubscriptionsRepo.findOne(
          { userId, status: "Active" },
          null,
          { sort: { currentPeriodEnd: -1 } }
        );
        if (activeSubscription) {
          subscriptionId = activeSubscription._id || activeSubscription.id;
          expiryDate = activeSubscription.currentPeriodEnd || null;
        }

        // Create addon purchase
        const purchase = await userAddonPurchasesRepo.create({
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

        // Mark as processed
        await ProcessedTransaction.create({
          transactionId: txId,
          type: "addon",
          userId,
          referenceId: (addon._id || addon.id).toString(),
          amount: amountIn,
          content,
          result: "activated"
        });

        // Send addon purchase success email
        try {
          const emailVariables = {
            user_name: user.fullName || user.email,
            package_name: addon.packageName,
            amount: amountIn.toLocaleString("vi-VN"),
            transaction_id: txId || "N/A",
            test_generations: addon.additionalTestGenerations,
            validation_requests: addon.additionalValidationRequests,
            purchase_date: new Date().toLocaleDateString("vi-VN", {
              year: "numeric",
              month: "long",
              day: "numeric",
            }),
          };

          await enqueueEmail({
            to: user.email,
            subject: "Mua gói bổ sung thành công - Addon Purchase Successful",
            templateId: emailCfg.addonPurchaseTemplateId || null,
            variables: emailVariables,
            options: {
              dbTemplateId: "addonPurchaseSuccess",
            },
          });
          logger.info(
            { userId, email: user.email, addonName: addon.packageName },
            "[Webhook] Addon purchase success email enqueued"
          );
        } catch (emailError) {
          logger.error(
            { userId, error: emailError.message },
            "[Webhook] Failed to enqueue addon purchase success email"
          );
        }

        addonActivated++;
        addonResults.push({
          userId,
          txId,
          addonId: (addon._id || addon.id).toString(),
          addonName: addon.packageName,
          purchaseId: purchase._id,
          action: "activated"
        });

        logger.info({ userId, addonId, addonName: addon.packageName, purchaseId: purchase._id }, "[Webhook] Addon package activated");
      }

      return res.status(200).json({ 
        ok: true, 
        totalTransactions: transactions.length,
        recentTransactions: recentTransactions.length,
        subscription: { matched, updated, results },
        addon: { matched: addonMatched, activated: addonActivated, results: addonResults }
      });
    } catch (e) {
      return next(e);
    }
  },
};
