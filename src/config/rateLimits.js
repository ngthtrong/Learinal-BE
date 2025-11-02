const rateLimit = require("express-rate-limit");
const env = require("./env");

/**
 * Rate Limiting Configuration
 * Implements tiered rate limits based on endpoint sensitivity
 */

/**
 * General API rate limiter
 * 100 requests per 15 minutes per IP
 */
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: {
    code: "RateLimitExceeded",
    message: "Too many requests from this IP, please try again later.",
  },
  standardHeaders: true, // Return rate limit info in RateLimit-* headers
  legacyHeaders: false, // Disable X-RateLimit-* headers
  skip: () => env.nodeEnv === "test", // Skip rate limiting in tests
  keyGenerator: (req) => {
    // Use X-Forwarded-For if behind proxy, otherwise use req.ip
    return req.headers["x-forwarded-for"] || req.ip;
  },
});

/**
 * Strict rate limiter for authentication endpoints
 * 5 requests per 15 minutes per IP
 */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each IP to 5 login attempts per windowMs
  message: {
    code: "RateLimitExceeded",
    message: "Too many authentication attempts, please try again later.",
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => env.nodeEnv === "test",
  skipSuccessfulRequests: true, // Don't count successful requests
  keyGenerator: (req) => {
    return req.headers["x-forwarded-for"] || req.ip;
  },
});

/**
 * File upload rate limiter
 * 10 uploads per hour per user
 */
const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,
  message: {
    code: "RateLimitExceeded",
    message: "Upload limit exceeded, please try again later.",
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => env.nodeEnv === "test",
  keyGenerator: (req) => {
    // Rate limit by user ID if authenticated, otherwise by IP
    return req.user?.userId || req.headers["x-forwarded-for"] || req.ip;
  },
});

/**
 * Expensive operation limiter (LLM, exports)
 * 20 requests per hour per user
 */
const expensiveLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20,
  message: {
    code: "RateLimitExceeded",
    message: "Operation limit exceeded, please try again later.",
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => env.nodeEnv === "test",
  keyGenerator: (req) => {
    return req.user?.userId || req.headers["x-forwarded-for"] || req.ip;
  },
});

/**
 * Webhook rate limiter
 * 100 requests per minute (generous for legitimate webhooks)
 */
const webhookLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 100,
  message: {
    code: "RateLimitExceeded",
    message: "Webhook rate limit exceeded.",
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => env.nodeEnv === "test",
  keyGenerator: (req) => {
    // Rate limit by IP for webhooks
    return req.headers["x-forwarded-for"] || req.ip;
  },
});

module.exports = {
  generalLimiter,
  authLimiter,
  uploadLimiter,
  expensiveLimiter,
  webhookLimiter,
};
