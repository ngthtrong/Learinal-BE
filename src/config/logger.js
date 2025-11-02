const pino = require("pino");
const env = require("./env");

/**
 * Production-ready structured logger using Pino
 * Features:
 * - Structured JSON logging
 * - Correlation ID tracking
 * - Redaction of sensitive data
 * - Pretty printing in development
 * - Log levels based on environment
 */

const redactPaths = [
  "password",
  "req.headers.authorization",
  "req.headers.cookie",
  "accessToken",
  "refreshToken",
  "secret",
  "apiKey",
  "*.password",
  "*.token",
  "*.secret",
];

const loggerConfig = {
  level: process.env.LOG_LEVEL || (env.nodeEnv === "production" ? "info" : "debug"),
  
  // Redact sensitive data
  redact: {
    paths: redactPaths,
    censor: "[REDACTED]",
  },

  // Base configuration
  base: {
    env: env.nodeEnv,
    service: "learinal-backend",
  },

  // Timestamp format
  timestamp: () => `,"time":"${new Date().toISOString()}"`,

  // Serializers for common objects
  serializers: {
    req: (req) => ({
      id: req.id,
      method: req.method,
      url: req.url,
      query: req.query,
      params: req.params,
      remoteAddress: req.headers["x-forwarded-for"] || req.socket?.remoteAddress,
      userAgent: req.headers["user-agent"],
    }),
    res: (res) => ({
      statusCode: res.statusCode,
    }),
    err: pino.stdSerializers.err,
    user: (user) => ({
      id: user._id || user.id,
      email: user.email,
      role: user.role,
    }),
  },
};

// Pretty print in development
if (env.nodeEnv !== "production") {
  loggerConfig.transport = {
    target: "pino-pretty",
    options: {
      colorize: true,
      translateTime: "SYS:standard",
      ignore: "pid,hostname",
      singleLine: false,
      messageFormat: "{levelLabel} [{req.id}] {msg}",
    },
  };
}

// Create logger instance
const logger = pino(loggerConfig);

/**
 * Create child logger with additional context
 * @param {Object} bindings - Context to add to all logs
 * @returns {Object} Child logger
 */
function createLogger(bindings = {}) {
  return logger.child(bindings);
}

/**
 * Express middleware for request logging
 */
function requestLogger(req, res, next) {
  // Attach logger to request
  req.log = logger.child({ requestId: req.id });

  // Log request start
  req.log.info({ req }, "Request started");

  // Capture response
  const start = Date.now();
  
  res.on("finish", () => {
    const duration = Date.now() - start;
    
    const logData = {
      req,
      res,
      duration: `${duration}ms`,
    };

    // Log level based on status code
    if (res.statusCode >= 500) {
      req.log.error(logData, "Request failed");
    } else if (res.statusCode >= 400) {
      req.log.warn(logData, "Request error");
    } else {
      req.log.info(logData, "Request completed");
    }
  });

  next();
}

module.exports = {
  logger,
  createLogger,
  requestLogger,
};
