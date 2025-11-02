const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const cookieParser = require("cookie-parser");
const { env } = require("./config");
const path = require("path");
const routes = require("./routes");
const healthRoutes = require("./routes/health.routes");
const requestId = require("./middleware/requestId");
const errorFormatter = require("./middleware/errorFormatter");
const errorHandler = require("./middleware/errorHandler");
const sanitizeInputs = require("./middleware/sanitizeInputs");
const getCorsOptions = require("./config/cors");
const getHelmetOptions = require("./config/helmet");
const getCompressionMiddleware = require("./config/compression");
const { generalLimiter } = require("./config/rateLimits");
const { initializeServices } = require("./initServices");
const { responseTime } = require("./utils/performance");
const { requestLogger } = require("./config/logger");
const { metricsMiddleware } = require("./middleware/metricsCollector");
const { initSentry, sentryErrorHandler } = require("./config/sentry");

const app = express();

// Initialize Sentry (must be first)
initSentry(app);

// Initialize services and inject into app.locals
initializeServices(app);

// Core middleware
app.use(requestId);

// Monitoring: Structured logging
app.use(requestLogger);

// Monitoring: Metrics collection
app.use(metricsMiddleware);

// Performance: Response time tracking
app.use(responseTime);

// Performance: Compression (gzip/brotli)
app.use(getCompressionMiddleware());

// Security: Helmet with enhanced configuration
app.use(helmet(getHelmetOptions()));

// Security: CORS with strict origin validation
app.use(cors(getCorsOptions()));

// Security: Input sanitization (prevent NoSQL injection, XSS)
app.use(sanitizeInputs);

// Parse cookies (for OAuth state and optional refresh cookie)
app.use(cookieParser());

// Capture raw body for webhook signature verification (Stripe/Sepay/etc.)
app.use(
  express.json({
    verify: (req, res, buf) => {
      if (buf && buf.length) {
        req.rawBody = buf.toString("utf8");
      }
    },
  })
);
app.use(express.urlencoded({ extended: true }));

// Security: General rate limiting (100 req/15min per IP)
app.use(generalLimiter);

// Public health endpoint (no auth required)
app.use("/health", healthRoutes);

// Serve minimal static frontend for testing password reset links
const publicDir = path.join(__dirname, "..", "public");
app.use(express.static(publicDir));
app.get("/reset-password", (req, res) => {
  res.sendFile(path.join(publicDir, "reset-password.html"));
});

// Serve simple OAuth testing pages only outside production
if (env.nodeEnv !== "production") {
  app.get("/oauth", (req, res) => {
    res.sendFile(path.join(publicDir, "oauth.html"));
  });

  // Google will redirect to this path with ?code=...
  // Ensure GOOGLE_REDIRECT_URI matches http://localhost:<PORT>/oauth/google/callback for local testing
  app.get("/oauth/google/callback", (req, res) => {
    res.sendFile(path.join(publicDir, "oauth-callback.html"));
  });
}

// Base URL: /api/v1
app.use("/api/v1", routes);

// Health & Monitoring endpoints (no /api/v1 prefix)
app.use("/", healthRoutes);

// Sentry error handler (must be before other error handlers)
sentryErrorHandler(app);

// 404 handler (after all routes)
app.use((req, res) => {
  res.status(404).json({ code: "NotFound", message: "Resource not found" });
});

// Error handler (last)
app.use(errorFormatter);
app.use(errorHandler);

module.exports = app;
