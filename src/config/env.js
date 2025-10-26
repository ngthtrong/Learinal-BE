require('dotenv').config();

const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3000', 10),

  // Mongo
  mongoUri: process.env.MONGO_URI || 'mongodb://localhost:27017/learinal',
  mongoDbName: process.env.MONGO_DB_NAME || 'learinal',

  // OAuth (Google)
  googleClientId: process.env.GOOGLE_CLIENT_ID || '',
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
  googleRedirectUri: process.env.GOOGLE_REDIRECT_URI || '',

  // JWT
  jwtSecret: process.env.JWT_SECRET || 'change-me',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '1h',
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET || 'change-me-refresh',
  jwtRefreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',

  // External services
  sendgridApiKey: process.env.SENDGRID_API_KEY || '',
  sesRegion: process.env.SES_REGION || '',
  s3Bucket: process.env.S3_BUCKET || '',
  s3Region: process.env.S3_REGION || '',
  stripeSecretKey: process.env.STRIPE_SECRET_KEY || '',

  // Feature flags / modes (stub vs real, etc.)
  authMode: process.env.AUTH_MODE || 'stub',
  llmMode: process.env.LLM_MODE || 'stub',
  queueMode: process.env.QUEUE_MODE || 'stub',
  storageMode: process.env.STORAGE_MODE || 'local',
  paymentMode: process.env.PAYMENT_MODE || 'stub',
  dbMode: process.env.DB_MODE || 'mongo',
};

module.exports = env;
