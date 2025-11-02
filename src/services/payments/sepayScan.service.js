const createSepayClient = require("../../adapters/sepayClient");
const { sepay } = require("../../config");
const { UsersRepository } = require("../../repositories");

function extractUserId(text) {
  if (!text || typeof text !== "string") return null;
  // Match both "uid:xxxxx" (with colon) and "uidxxxxx" (without colon)
  // Banks may strip special characters from QR content
  const m = text.match(/uid:?([a-f0-9]{24})/i);
  return m ? m[1].toLowerCase() : null;
}

class SepayScanService {
  constructor({ usersRepository } = {}) {
    this.usersRepository = usersRepository || new UsersRepository();
    this.client = createSepayClient(sepay);
  }

  /**
   * Scan recent transactions and activate user subscriptions matching criteria.
   * Criteria: amount_in == 2000, transaction_content includes 'standard' and uid:<24hex>.
   * Filters: uses SEPAY_QR_ACCOUNT if present; limit defaults to 50.
   */
  async scanRecent({ accountNumber, limit = 50, debug = false } = {}) {
    const acc = accountNumber || process.env.SEPAY_QR_ACCOUNT || sepay.qrAccount || undefined;
    const params = { limit: Math.min(Math.max(Number(limit) || 50, 1), 5000) };
    if (acc) params.account_number = acc;

  const data = await this.client.listTransactions(params);
  const txs = Array.isArray(data?.transactions) ? data.transactions : [];

    let matched = 0;
    let updated = 0;
    const details = [];

    for (const tx of txs) {
      const amountIn = Number(tx?.amount_in || 0);
      const currency = "VND"; // Sepay userapi amounts are VND by context
      const content = String(tx?.transaction_content || "");
      if (amountIn !== 2000) continue;
      // Check for both SEVQR prefix and standard keyword
      if (!/SEVQR/i.test(content)) continue;
      if (!/\bstandard\b/i.test(content)) continue;
      const userId = extractUserId(content);
      if (!userId) continue;
      matched++;
      const curr = await this.usersRepository.findByUserId(userId);
      if (curr && curr.subscriptionStatus === "None") {
        await this.usersRepository.updateUserById(userId, { subscriptionStatus: "Active" });
        updated++;
        details.push({ userId, txId: tx.id, amountIn, content, action: "activated" });
      } else {
        details.push({ userId, txId: tx.id, amountIn, content, action: "noop" });
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
