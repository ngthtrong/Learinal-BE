const { UsersRepository, SubscriptionPlansRepository } = require("../repositories");
const crypto = require("crypto");
const { sepay } = require("../config");
const createSepayClient = require("../adapters/sepayClient");

const usersRepo = new UsersRepository();
const subscriptionPlansRepo = new SubscriptionPlansRepository();

function extractUserIdFromText(text) {
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
      const planMap = new Map();
      allPlans.forEach(plan => {
        const planId = (plan.id || plan._id).toString().toLowerCase();
        planMap.set(planId, plan);
      });

      let matched = 0;
      let updated = 0;
      const results = [];

      // Process each transaction
      for (const tx of transactions) {
        const amountIn = Number(tx?.amount_in || 0);
        const content = String(tx?.transaction_content || "");

        // Check for SEVQR prefix
        if (!/SEVQR/i.test(content)) continue;

        const userId = extractUserIdFromText(content);
        const planId = extractPlanId(content);

        if (!userId || !planId) continue;

        // Find matching plan by planId
        const plan = planMap.get(planId);
        if (!plan) {
          results.push({ userId, txId: tx.id, action: "plan_not_found", planId });
          continue;
        }

        // Verify amount matches plan price
        if (amountIn !== plan.price) {
          results.push({ userId, txId: tx.id, action: "amount_mismatch", expected: plan.price, actual: amountIn });
          continue;
        }

        matched++;

        // Check and update user
        const current = await usersRepo.findByUserId(userId);
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
          updated++;
          results.push({ userId, txId: tx.id, planId, planName: plan.planName, action: "activated" });
        } else if (current) {
          results.push({ userId, txId: tx.id, planId, planName: plan.planName, action: "already_active_or_not_none" });
        } else {
          results.push({ userId, txId: tx.id, planId, action: "user_not_found" });
        }
      }

      return res.status(200).json({ 
        ok: true, 
        processed: transactions.length,
        matched, 
        updated,
        results 
      });
    } catch (e) {
      return next(e);
    }
  },
};
