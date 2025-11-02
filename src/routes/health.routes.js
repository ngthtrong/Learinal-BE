const express = require("express");
const healthController = require("../controllers/health.controller");
const {
  basicHealthCheck,
  deepHealthCheck,
  readinessCheck,
  livenessCheck,
} = require("../middleware/healthCheck");
const { metricsEndpoint } = require("../middleware/metricsCollector");

const router = express.Router();

// Basic health check (lightweight)
router.get("/", basicHealthCheck);

// Legacy endpoint
router.get("/health", healthController.getHealth);

// Kubernetes-style health checks
router.get("/healthz", basicHealthCheck); // Basic health
router.get("/readyz", readinessCheck);    // Readiness probe
router.get("/livez", livenessCheck);      // Liveness probe

// Deep health check (checks all dependencies)
router.get("/health/deep", deepHealthCheck);

// Prometheus metrics endpoint
router.get("/metrics", metricsEndpoint);

module.exports = router;
