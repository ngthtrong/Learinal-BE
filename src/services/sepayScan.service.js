const createSepayClient = require("../adapters/sepayClient");
const { sepay, email: emailCfg } = require("../config");
const { UsersRepository, SubscriptionPlansRepository } = require("../repositories");
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

class SepayScanService {
  constructor({ usersRepository, subscriptionPlansRepository } = {}) {
    this.usersRepository = usersRepository || new UsersRepository();
    this.subscriptionPlansRepository =
      subscriptionPlansRepository || new SubscriptionPlansRepository();
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
        try {
          if (emailCfg.paymentSuccessTemplateId) {
            await enqueueEmail({
              to: curr.email,
              subject: "Thanh toán thành công - Payment Successful",
              templateId: emailCfg.paymentSuccessTemplateId,
              variables: {
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
              },
            });
            logger.info(
              { userId, email: curr.email, planName: plan.planName },
              "Payment success email enqueued"
            );
          } else {
            logger.warn({ userId }, "Payment success template ID not configured, skipping email");
          }
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
}

module.exports = SepayScanService;
