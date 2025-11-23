const { env } = require("../config");

/**
 * Strict CORS Configuration for Production
 * Only allows whitelisted origins
 */

function getCorsOptions() {
  const allowedOrigins = (env.corsAllowedOrigins || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  return {
    // Origin validation
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, Postman, server-to-server)
      if (!origin) {
        return callback(null, true);
      }

      // In production, strict whitelist
      if (env.nodeEnv === "production") {
        if (allowedOrigins.length === 0) {
          return callback(
            new Error("CORS: No allowed origins configured in production"),
            false
          );
        }

        if (!allowedOrigins.includes(origin)) {
          return callback(
            new Error(`CORS: Origin ${origin} not allowed`),
            false
          );
        }
      } else {
        // Development: Allow all origins OR whitelist if provided
        if (allowedOrigins.length > 0 && !allowedOrigins.includes(origin)) {
          return callback(
            new Error(`CORS: Origin ${origin} not in whitelist`),
            false
          );
        }
      }

      callback(null, true);
    },

    // Allow credentials (cookies, authorization headers)
    credentials: true,

    // Allowed HTTP methods
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],

    // Allowed headers
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-Request-ID",
      "Idempotency-Key",
      "If-None-Match",
      "If-Match",
    ],

    // Exposed headers (client can read these)
    exposedHeaders: [
      "X-Request-ID",
      "X-RateLimit-Limit",
      "X-RateLimit-Remaining",
      "X-RateLimit-Reset",
      "ETag",
      "Retry-After",
    ],

    // Preflight cache duration (24 hours)
    maxAge: 86400,

    // Pass CORS preflight to next handler
    preflightContinue: false,

    // Provide successful status for OPTIONS
    optionsSuccessStatus: 204,
  };
}

module.exports = getCorsOptions;
