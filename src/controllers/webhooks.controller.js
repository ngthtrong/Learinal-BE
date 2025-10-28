const { UsersRepository } = require("../repositories");
const crypto = require("crypto");
const { sepay } = require("../config");

const usersRepo = new UsersRepository();

function extractUserIdFromText(text) {
  if (!text || typeof text !== "string") return null;
  const m = text.match(/uid:([a-f0-9]{24})/i);
  return m ? m[1].toLowerCase() : null;
}

module.exports = {
  stripe: async (req, res, next) => {
    try {
      throw Object.assign(new Error("NotImplemented"), { status: 501 });
    } catch (e) {
      next(e);
    }
  },

  // Minimal Sepay webhook handler: expects JSON body with keys { amount, currency, content, reference, status }
  // On successful payment (amount=2000, currency=VND, content='standard'),
  // parses userId from reference and activates the user's subscriptionStatus.
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

  const evt = req.body || {};
  const amount = Number(evt.amount);
  const currency = String(evt.currency || "").toUpperCase();
  const description = String(evt.description || evt.content || "");
  const reference = String(evt.reference || evt.ref || evt.note || description || "");
  const status = String(evt.status || evt.event || "").toLowerCase();

      // Basic validation
      if (!(amount > 0) || !currency || !reference) {
        return res.status(400).json({ error: "invalid payload" });
      }

      // We only accept exact Standard plan @ 2000 VND and a success-like status
      const okStatus = ["success", "succeeded", "completed", "paid"].includes(status);
      const hasStandard = /\bstandard\b/i.test(description) || /\bstandard\b/i.test(reference);
      if (amount !== 2000 || currency !== "VND" || !hasStandard || !okStatus) {
        return res.status(200).json({ ok: true, ignored: true });
      }

      const userId = extractUserIdFromText(reference) || extractUserIdFromText(description);
      if (!userId) {
        return res.status(400).json({ error: "missing userId in reference" });
      }

      // Update only if current status is 'None'
      const current = await usersRepo.findByUserId(userId);
      if (!current) {
        return res.status(404).json({ code: "NotFound", message: "User not found" });
      }
      if (current.subscriptionStatus !== "Active") {
        await usersRepo.updateUserById(userId, { subscriptionStatus: "Active" });
        return res.status(200).json({ ok: true, userId, updated: true });
      }

      return res.status(200).json({ ok: true, userId, updated: false });
    } catch (e) {
      return next(e);
    }
  },
};
