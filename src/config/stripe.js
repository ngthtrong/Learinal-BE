module.exports = {
  enabled: !!process.env.STRIPE_SECRET_KEY,
  secretKey: process.env.STRIPE_SECRET_KEY || '',
  webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || '',
};
