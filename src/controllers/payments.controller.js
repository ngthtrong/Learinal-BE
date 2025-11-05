const QRCode = require("qrcode");
const { sepay } = require("../config");
const createSepayClient = require("../adapters/sepayClient");
const SepayScanService = require("../services/sepayScan.service");
const { SubscriptionPlansRepository } = require("../repositories");

const subscriptionPlansRepo = new SubscriptionPlansRepository();

// Simple dynamic QR generator for Sepay flow (placeholder without calling Sepay API)
// Encodes a structured reference that includes userId, plan, amount.
// Returns a PNG data URL that can be shown directly on the frontend.
module.exports = {
  createSepayQr: async (req, res, next) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ code: "Unauthorized", message: "Missing user" });
      }

      // Get subscriptionPlanId from request body
      const { subscriptionPlanId } = req.body;
      if (!subscriptionPlanId) {
        return res.status(400).json({ 
          code: "ValidationError", 
          message: "subscriptionPlanId is required",
          details: { subscriptionPlanId: "This field is required" }
        });
      }

      // Validate subscription plan exists
      const plan = await subscriptionPlansRepo.findById(subscriptionPlanId);
      if (!plan) {
        return res.status(404).json({ 
          code: "NotFound", 
          message: "Subscription plan not found",
          details: { subscriptionPlanId: "Invalid subscription plan ID" }
        });
      }

      // Check plan is active
      if (plan.status !== "Active") {
        return res.status(400).json({ 
          code: "ValidationError", 
          message: "Subscription plan is not active",
          details: { subscriptionPlanId: "This plan is currently inactive" }
        });
      }

      const amount = plan.price; // Use price from plan
      const currency = "VND";
      const planName = plan.planName.toLowerCase(); // e.g., "standard", "pro"
      const planId = (plan.id || plan._id).toString();

      // Reference string that we will also expect back in webhook payload (or be able to match by userId/plan/amount)
      const reference = `uid:${userId}|planId:${planId}|amt:${amount}|ts:${Date.now()}`;

      // Simple approach: build qr.sepay.vn URL using env configs (preferred)
      // des will include planId + uid to allow matching on webhook side
      const description = `SEVQR ${planName} uid:${userId} planId:${planId}`;

      let qrUrl;
      if (sepay?.qrAccount && sepay?.qrBank) {
        const base = sepay.qrImgBase || "https://qr.sepay.vn/img";
        const acc = encodeURIComponent(sepay.qrAccount);
        const bank = encodeURIComponent(sepay.qrBank);
        const tmpl = encodeURIComponent(sepay.qrTemplate || "compact");
        // encode space as '+' to mimic sample format
        const encDes = encodeURIComponent(description).replace(/%20/g, "+");
        qrUrl = `${base}?acc=${acc}&bank=${bank}&amount=${amount}&des=${encDes}&template=${tmpl}`;
      }

      // As a convenience for clients that prefer an image data URL, we keep a fallback QR render too
      let qrDataUrl;
      if (!qrUrl && sepay?.apiKey) {
        // If account/bank not configured but API key exists, try provider API
        try {
          const client = createSepayClient(sepay);
          const created = await client.createDynamicQR({
            amount,
            currency,
            reference,
            description: planName,
          });
          if (created.qrDataUrl) {
            qrDataUrl = created.qrDataUrl;
          } else if (created.qrContent) {
            qrDataUrl = await QRCode.toDataURL(created.qrContent, { errorCorrectionLevel: "M" });
          }
        } catch (_err) {
          // ignore and fallback to local render below
        }
      }
      if (!qrUrl && !qrDataUrl) {
        const payload = `SEPAY|ref=${reference}|content=${planName}|currency=${currency}`;
        qrDataUrl = await QRCode.toDataURL(payload, { errorCorrectionLevel: "M" });
      }

      return res.status(200).json({ 
        provider: "sepay", 
        amount, 
        currency, 
        plan: {
          id: planId,
          name: plan.planName,
          billingCycle: plan.billingCycle,
        },
        reference, 
        qrUrl, 
        qrDataUrl 
      });
    } catch (err) {
      return next(err);
    }
  },
  // Fetch raw transactions from Sepay user API (proxy) to help verify matching conditions
  listSepayTransactions: async (req, res, _next) => {
    try {
      const client = createSepayClient(sepay);
      // Accept common filters from query/body; query takes precedence
      const get = (k) => req.query[k] ?? req.body?.[k];
      const params = {
        account_number: get("account_number"),
        transaction_date_min: get("transaction_date_min"),
        transaction_date_max: get("transaction_date_max"),
        since_id: get("since_id"),
        limit: get("limit") || 5000,
        reference_number: get("reference_number"),
        amount_in: get("amount_in"),
        amount_out: get("amount_out"),
      };
      // Convenience: today=true -> set min/max to today's 00:00:00 .. 23:59:59 (server local time)
      const todayFlag = String(get("today") || "false").toLowerCase() === "true";
      if (todayFlag) {
        const now = new Date();
        const pad = (n) => (n < 10 ? `0${n}` : `${n}`);
        const y = now.getFullYear();
        const m = pad(now.getMonth() + 1);
        const d = pad(now.getDate());
        params.transaction_date_min = `${y}-${m}-${d} 00:00:00`;
        params.transaction_date_max = `${y}-${m}-${d} 23:59:59`;
      }
      // Clean undefined
      Object.keys(params).forEach((k) => params[k] === undefined && delete params[k]);

      const data = await client.listTransactions(params);
      // Normalize envelope for API consistency
      const items = Array.isArray(data?.transactions) ? data.transactions : [];
      return res
        .status(200)
        .json({
          items,
          meta: { count: items.length, params, status: data?.status, error: data?.error },
        });
    } catch (err) {
      // Map provider errors
      const status = Number(err?.response?.status) || 500;
      const message = err?.response?.data || err?.message || "Upstream error";
      return res.status(status >= 400 && status < 600 ? status : 502).json({
        code: "UpstreamError",
        message: typeof message === "string" ? message : JSON.stringify(message),
      });
    }
  },
  // Admin/ops trigger: scan recent transactions via Sepay userapi and update subscriptions
  scanSepayTransactions: async (req, res, next) => {
    try {
      const limit = Number(req.query.limit || req.body?.limit || 50);
      const accountNumber = req.query.account_number || req.body?.account_number || undefined;
      const debug = String(req.query.debug || req.body?.debug || "false").toLowerCase() === "true";
      const service = new SepayScanService();
      const result = await service.scanRecent({ accountNumber, limit, debug });
      return res.status(200).json(result);
    } catch (err) {
      return next(err);
    }
  },
};
