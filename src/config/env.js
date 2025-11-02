require("dotenv").config();

const env = {
  nodeEnv: process.env.NODE_ENV || "development",
  port: parseInt(process.env.PORT || "3000", 10),

  // Mongo
  mongoUri: process.env.MONGO_URI || "mongodb://localhost:27017/learinal",
  mongoDbName: process.env.MONGO_DB_NAME || "learinal",

  // OAuth (Google)
  googleClientId: process.env.GOOGLE_CLIENT_ID || "",
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
  googleRedirectUri: process.env.GOOGLE_REDIRECT_URI || "",

  // JWT
  jwtSecret: process.env.JWT_SECRET || "change-me",
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "1h",
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET || "change-me-refresh",
  jwtRefreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || "7d",
  jwtAlgorithm: (process.env.JWT_ALGORITHM || "HS256").toUpperCase(),
  jwtIssuer: process.env.JWT_ISSUER || "",
  jwtAudience: process.env.JWT_AUDIENCE || "",

  // Email verification / password reset tokens
  emailVerifySecret: process.env.EMAIL_VERIFY_SECRET || "change-me-email-verify",
  emailVerifyExpiresIn: process.env.EMAIL_VERIFY_EXPIRES_IN || "1d",
  passwordResetSecret: process.env.PASSWORD_RESET_SECRET || "change-me-password-reset",
  passwordResetExpiresIn: process.env.PASSWORD_RESET_EXPIRES_IN || "1h",

  // App base URL for building links in emails (frontend)
  appBaseUrl: process.env.APP_BASE_URL || "http://localhost:3000",

  // Auth policy toggles
  requireEmailVerifiedForLogin:
    (process.env.REQUIRE_EMAIL_VERIFIED_FOR_LOGIN || "false").toLowerCase() === "true",

  // OAuth hardening
  oauthRequireState: (process.env.OAUTH_REQUIRE_STATE || "true").toLowerCase() === "true",
  oauthRequirePkce: (process.env.OAUTH_REQUIRE_PKCE || "false").toLowerCase() === "true",

  // Cookies for auth (when using cookie-based refresh)
  cookieDomain: process.env.COOKIE_DOMAIN || "",
  cookieSecure:
    (
      process.env.COOKIE_SECURE || (process.env.NODE_ENV === "production" ? "true" : "false")
    ).toLowerCase() === "true",
  cookieSameSite: process.env.COOKIE_SAMESITE || "Lax",

  // CORS
  corsAllowedOrigins: process.env.CORS_ALLOWED_ORIGINS || "",

  // External services
  sendgridApiKey: process.env.SENDGRID_API_KEY || "",
  sesRegion: process.env.SES_REGION || "",
  s3Bucket: process.env.S3_BUCKET || "",
  s3Region: process.env.S3_REGION || "",
  stripeSecretKey: process.env.STRIPE_SECRET_KEY || "",

  // Storage mode (local for development, s3/cloudinary for production)
  storageMode: process.env.STORAGE_MODE || "local",
  dbMode: process.env.DB_MODE || "mongo",
};

module.exports = env;
