const mongoose = require("mongoose");
const { getRedisClient } = require("../adapters/queue");
const { logger } = require("../config/logger");

/**
 * Health Check Middleware
 * Provides basic and deep health checks for dependencies
 */

/**
 * Basic health check - minimal overhead
 */
async function basicHealthCheck(req, res) {
  res.status(200).json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    service: "learinal-backend",
  });
}

/**
 * Deep health check - checks all dependencies
 */
async function deepHealthCheck(req, res) {
  const checks = {
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    service: "learinal-backend",
    version: process.env.npm_package_version || "unknown",
    checks: {},
  };

  let overallStatus = "healthy";

  // Check MongoDB
  try {
    const mongoState = mongoose.connection.readyState;
    const mongoStatus = {
      1: "connected",
      2: "connecting",
      3: "disconnecting",
      0: "disconnected",
    };

    checks.checks.mongodb = {
      status: mongoState === 1 ? "healthy" : "unhealthy",
      state: mongoStatus[mongoState],
      responseTime: null,
    };

    // Ping MongoDB
    if (mongoState === 1) {
      const start = Date.now();
      await mongoose.connection.db.admin().ping();
      checks.checks.mongodb.responseTime = `${Date.now() - start}ms`;
    } else {
      overallStatus = "unhealthy";
    }
  } catch (error) {
    logger.error({ err: error }, "MongoDB health check failed");
    checks.checks.mongodb = {
      status: "unhealthy",
      error: error.message,
    };
    overallStatus = "unhealthy";
  }

  // Check Redis
  try {
    const redis = getRedisClient();
    const start = Date.now();
    const pong = await redis.ping();
    
    checks.checks.redis = {
      status: pong === "PONG" ? "healthy" : "unhealthy",
      responseTime: `${Date.now() - start}ms`,
    };

    if (pong !== "PONG") {
      overallStatus = "unhealthy";
    }
  } catch (error) {
    logger.error({ err: error }, "Redis health check failed");
    checks.checks.redis = {
      status: "unhealthy",
      error: error.message,
    };
    overallStatus = "degraded"; // Redis is optional for core functionality
  }

  // Check Memory
  const memUsage = process.memoryUsage();
  const memThreshold = 1024 * 1024 * 1024; // 1GB
  
  checks.checks.memory = {
    status: memUsage.heapUsed < memThreshold ? "healthy" : "degraded",
    heapUsed: `${(memUsage.heapUsed / 1024 / 1024).toFixed(2)} MB`,
    heapTotal: `${(memUsage.heapTotal / 1024 / 1024).toFixed(2)} MB`,
    rss: `${(memUsage.rss / 1024 / 1024).toFixed(2)} MB`,
  };

  if (memUsage.heapUsed >= memThreshold) {
    overallStatus = overallStatus === "healthy" ? "degraded" : overallStatus;
  }

  // Overall status
  checks.status = overallStatus;

  const statusCode = overallStatus === "healthy" ? 200 : overallStatus === "degraded" ? 200 : 503;
  res.status(statusCode).json(checks);
}

/**
 * Readiness check - can the service handle requests?
 */
async function readinessCheck(req, res) {
  try {
    // Check MongoDB is ready
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({
        status: "not_ready",
        reason: "MongoDB not connected",
        timestamp: new Date().toISOString(),
      });
    }

    // Service is ready
    res.status(200).json({
      status: "ready",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error({ err: error }, "Readiness check failed");
    res.status(503).json({
      status: "not_ready",
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
}

/**
 * Liveness check - is the service alive?
 */
async function livenessCheck(req, res) {
  // Simple check - if we can respond, we're alive
  res.status(200).json({
    status: "alive",
    timestamp: new Date().toISOString(),
  });
}

module.exports = {
  basicHealthCheck,
  deepHealthCheck,
  readinessCheck,
  livenessCheck,
};
