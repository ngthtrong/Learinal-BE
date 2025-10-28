const axios = require("axios");

class SepayClient {
  constructor({ baseURL, userApiBase, apiKey, requestTimeout = 10000, qrCreatePath = "/v1/payments" }) {
    this.baseURL = baseURL;
    this.userApiBase = userApiBase;
    this.apiKey = apiKey;
    this.qrCreatePath = qrCreatePath;
    this.http = axios.create({
      baseURL,
      timeout: requestTimeout,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
    });
    this.userHttp = axios.create({
      baseURL: userApiBase,
      timeout: requestTimeout,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
      },
    });
  }

  /**
   * Create a dynamic QR for a transfer.
   * Note: The exact payload/response depends on Sepay's API. We pass through common fields and return { raw, qrDataUrl?, qrContent? }.
   */
  async createDynamicQR({ amount, currency = "VND", reference, description = "standard" }) {
    const body = {
      amount,
      currency,
      reference,
      description,
    };

    const { data } = await this.http.post(this.qrCreatePath, body);
    const result = { raw: data };

    // Try to normalize likely QR fields from provider response
    if (data?.qrDataUrl && typeof data.qrDataUrl === "string") {
      result.qrDataUrl = data.qrDataUrl;
    } else if (data?.qrImageUrl) {
      result.qrDataUrl = data.qrImageUrl; // URL to image
    } else if (data?.qr || data?.qrContent || data?.emvqr) {
      result.qrContent = data.qrContent || data.qr || data.emvqr;
    }

    return result;
  }

  /**
   * List transactions from user API with optional filters.
   * Params map closely to Sepay docs: account_number, transaction_date_min, transaction_date_max, since_id, limit, reference_number, amount_in, amount_out
   */
  async listTransactions(params = {}) {
    const { data } = await this.userHttp.get("/transactions/list", { params });
    return data;
  }

  async countTransactions(params = {}) {
    const { data } = await this.userHttp.get("/transactions/count", { params });
    return data;
  }

  async getTransactionDetails(id) {
    const { data } = await this.userHttp.get(`/transactions/details/${encodeURIComponent(id)}`);
    return data;
  }
}

module.exports = (sepayConfig = {}) =>
  new SepayClient({
    baseURL: sepayConfig.baseURL || process.env.SEPAY_BASE_URL,
    userApiBase: sepayConfig.userApiBase || process.env.SEPAY_USERAPI_BASE || "https://my.sepay.vn/userapi",
    apiKey: sepayConfig.apiKey || process.env.SEPAY_API_KEY,
    requestTimeout: Number(process.env.SEPAY_TIMEOUT_MS || 10000),
    qrCreatePath: process.env.SEPAY_QR_CREATE_PATH || "/v1/payments",
  });
