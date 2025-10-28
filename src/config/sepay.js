module.exports = {
  enabled: !!(process.env.SEPAY_API_KEY || process.env.SEPAY_WEBHOOK_SECRET),
  baseURL: process.env.SEPAY_BASE_URL || "https://api.sepay.vn",
  userApiBase: process.env.SEPAY_USERAPI_BASE || "https://my.sepay.vn/userapi",
  apiKey: process.env.SEPAY_API_KEY || "",
  webhookSecret: process.env.SEPAY_WEBHOOK_SECRET || process.env.SEPAY_SECRET || "",
  webhookToleranceSec: Number(process.env.SEPAY_WEBHOOK_TOLERANCE_SEC || 300),
  qrCreatePath: process.env.SEPAY_QR_CREATE_PATH || "/v1/payments",
  // Simple QR image URL builder (no API key required)
  qrImgBase: process.env.SEPAY_QR_IMG_BASE || "https://qr.sepay.vn/img",
  qrAccount: process.env.SEPAY_QR_ACCOUNT || "",
  qrBank: process.env.SEPAY_QR_BANK || "",
  qrTemplate: process.env.SEPAY_QR_TEMPLATE || "compact",
};
