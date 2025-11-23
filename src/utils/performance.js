const logger = require("../utils/logger");

/**
 * Performance Monitoring Utilities
 * Track response times and slow queries
 */

/**
 * Middleware to track response time
 */
function responseTime(req, res, next) {
  const start = process.hrtime.bigint();

  // Override res.end to capture response time before sending
  const originalEnd = res.end;
  res.end = function(...args) {
    const end = process.hrtime.bigint();
    const duration = Number(end - start) / 1_000_000; // Convert to milliseconds

    // Set response time header before sending response
    if (!res.headersSent) {
      res.set("X-Response-Time", `${duration.toFixed(2)}ms`);
    }

    // Log slow requests (> 1 second)
    if (duration > 1000) {
      logger.warn(
        {
          method: req.method,
          url: req.originalUrl || req.url,
          duration: `${duration.toFixed(2)}ms`,
          statusCode: res.statusCode,
        },
        "Slow request detected"
      );
    }

    // Log request metrics
    logger.debug(
      {
        method: req.method,
        url: req.originalUrl || req.url,
        statusCode: res.statusCode,
        duration: `${duration.toFixed(2)}ms`,
        userAgent: req.headers["user-agent"],
      },
      "Request completed"
    );

    // Call original end method
    originalEnd.apply(res, args);
  };

  next();
}

/**
 * Measure async function execution time
 * @param {Function} fn - Async function to measure
 * @param {string} label - Label for logging
 * @returns {Function} Wrapped function
 */
function measureTime(fn, label) {
  return async function (...args) {
    const start = process.hrtime.bigint();

    try {
      const result = await fn(...args);
      
      const end = process.hrtime.bigint();
      const duration = Number(end - start) / 1_000_000;

      if (duration > 100) {
        logger.debug({ label, duration: `${duration.toFixed(2)}ms` }, "Operation timing");
      }

      return result;
    } catch (error) {
      const end = process.hrtime.bigint();
      const duration = Number(end - start) / 1_000_000;

      logger.error(
        { label, duration: `${duration.toFixed(2)}ms`, err: error.message },
        "Operation failed"
      );

      throw error;
    }
  };
}

/**
 * Database query performance tracker
 */
class QueryPerformanceTracker {
  constructor() {
    this.slowQueries = [];
    this.maxTracked = 100; // Keep last 100 slow queries
    this.slowThreshold = 100; // ms
  }

  /**
   * Track query execution
   * @param {string} operation - Operation name
   * @param {number} duration - Duration in milliseconds
   * @param {Object} metadata - Additional metadata
   */
  track(operation, duration, metadata = {}) {
    if (duration > this.slowThreshold) {
      const entry = {
        operation,
        duration: `${duration.toFixed(2)}ms`,
        timestamp: new Date().toISOString(),
        ...metadata,
      };

      this.slowQueries.unshift(entry);

      // Keep only last N entries
      if (this.slowQueries.length > this.maxTracked) {
        this.slowQueries.pop();
      }

      logger.warn(entry, "Slow database query");
    }
  }

  /**
   * Get slow queries report
   * @returns {Array} List of slow queries
   */
  getSlowQueries() {
    return this.slowQueries;
  }

  /**
   * Clear tracked queries
   */
  clear() {
    this.slowQueries = [];
  }
}

// Singleton instance
const queryTracker = new QueryPerformanceTracker();

/**
 * Mongoose query profiling plugin
 * Automatically tracks slow queries
 */
function mongooseProfilingPlugin(schema) {
  // Track find queries
  schema.pre("find", function () {
    this._startTime = Date.now();
  });

  schema.post("find", function (result) {
    if (this._startTime) {
      const duration = Date.now() - this._startTime;
      queryTracker.track("find", duration, {
        model: this.model.modelName,
        filter: JSON.stringify(this.getFilter()),
        resultCount: result.length,
      });
    }
  });

  // Track findOne queries
  schema.pre("findOne", function () {
    this._startTime = Date.now();
  });

  schema.post("findOne", function () {
    if (this._startTime) {
      const duration = Date.now() - this._startTime;
      queryTracker.track("findOne", duration, {
        model: this.model.modelName,
        filter: JSON.stringify(this.getFilter()),
      });
    }
  });

  // Track save operations
  schema.pre("save", function () {
    this._startTime = Date.now();
  });

  schema.post("save", function () {
    if (this._startTime) {
      const duration = Date.now() - this._startTime;
      queryTracker.track("save", duration, {
        model: this.constructor.modelName,
      });
    }
  });
}

/**
 * Memory usage monitor
 */
function logMemoryUsage() {
  const usage = process.memoryUsage();
  
  logger.info(
    {
      heapUsed: `${(usage.heapUsed / 1024 / 1024).toFixed(2)} MB`,
      heapTotal: `${(usage.heapTotal / 1024 / 1024).toFixed(2)} MB`,
      rss: `${(usage.rss / 1024 / 1024).toFixed(2)} MB`,
      external: `${(usage.external / 1024 / 1024).toFixed(2)} MB`,
    },
    "Memory usage"
  );
}

module.exports = {
  responseTime,
  measureTime,
  queryTracker,
  mongooseProfilingPlugin,
  logMemoryUsage,
};
