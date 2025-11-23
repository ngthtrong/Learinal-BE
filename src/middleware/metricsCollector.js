const client = require("prom-client");

/**
 * Prometheus Metrics Collector
 * Collects application metrics for monitoring
 */

// Create a Registry
const register = new client.Registry();

// Add default metrics (memory, CPU, etc.)
client.collectDefaultMetrics({ register });

// Custom Metrics

// HTTP Request Duration Histogram
const httpRequestDuration = new client.Histogram({
  name: "http_request_duration_seconds",
  help: "Duration of HTTP requests in seconds",
  labelNames: ["method", "route", "status_code"],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5], // 10ms to 5s
  registers: [register],
});

// HTTP Request Counter
const httpRequestTotal = new client.Counter({
  name: "http_requests_total",
  help: "Total number of HTTP requests",
  labelNames: ["method", "route", "status_code"],
  registers: [register],
});

// Active Connections Gauge
const activeConnections = new client.Gauge({
  name: "active_connections",
  help: "Number of active connections",
  registers: [register],
});

// Database Query Duration Histogram
const dbQueryDuration = new client.Histogram({
  name: "db_query_duration_seconds",
  help: "Duration of database queries in seconds",
  labelNames: ["operation", "model"],
  buckets: [0.001, 0.01, 0.05, 0.1, 0.5, 1],
  registers: [register],
});

// Cache Hit/Miss Counter
const cacheHits = new client.Counter({
  name: "cache_hits_total",
  help: "Total number of cache hits",
  labelNames: ["cache_type"],
  registers: [register],
});

const cacheMisses = new client.Counter({
  name: "cache_misses_total",
  help: "Total number of cache misses",
  labelNames: ["cache_type"],
  registers: [register],
});

// Business Metrics

// User Registrations Counter
const userRegistrations = new client.Counter({
  name: "user_registrations_total",
  help: "Total number of user registrations",
  labelNames: ["oauth_provider"],
  registers: [register],
});

// Question Generation Counter
const questionsGenerated = new client.Counter({
  name: "questions_generated_total",
  help: "Total number of questions generated",
  labelNames: ["difficulty"],
  registers: [register],
});

// Document Uploads Counter
const documentUploads = new client.Counter({
  name: "document_uploads_total",
  help: "Total number of document uploads",
  labelNames: ["status"],
  registers: [register],
});

// Subscription Events Counter
const subscriptionEvents = new client.Counter({
  name: "subscription_events_total",
  help: "Total number of subscription events",
  labelNames: ["event_type", "plan"],
  registers: [register],
});

/**
 * Middleware to collect HTTP metrics
 */
function metricsMiddleware(req, res, next) {
  const start = Date.now();

  // Increment active connections
  activeConnections.inc();

  res.on("finish", () => {
    const duration = (Date.now() - start) / 1000; // Convert to seconds
    
    const route = req.route?.path || req.path || "unknown";
    const labels = {
      method: req.method,
      route,
      status_code: res.statusCode,
    };

    // Record metrics
    httpRequestDuration.observe(labels, duration);
    httpRequestTotal.inc(labels);
    
    // Decrement active connections
    activeConnections.dec();
  });

  next();
}

/**
 * Endpoint to expose metrics
 */
async function metricsEndpoint(req, res) {
  try {
    res.set("Content-Type", register.contentType);
    const metrics = await register.metrics();
    res.end(metrics);
  } catch (error) {
    res.status(500).end(error.message);
  }
}

/**
 * Track database query
 * @param {string} operation - Query operation (find, save, etc.)
 * @param {string} model - Model name
 * @param {number} duration - Duration in milliseconds
 */
function trackDbQuery(operation, model, duration) {
  dbQueryDuration.observe(
    { operation, model },
    duration / 1000 // Convert to seconds
  );
}

/**
 * Track cache hit/miss
 * @param {string} cacheType - Type of cache
 * @param {boolean} isHit - Whether it was a hit
 */
function trackCacheAccess(cacheType, isHit) {
  if (isHit) {
    cacheHits.inc({ cache_type: cacheType });
  } else {
    cacheMisses.inc({ cache_type: cacheType });
  }
}

/**
 * Track user registration
 * @param {string} oauthProvider - OAuth provider (google, facebook, local)
 */
function trackUserRegistration(oauthProvider = "local") {
  userRegistrations.inc({ oauth_provider: oauthProvider });
}

/**
 * Track question generation
 * @param {string} difficulty - Question difficulty
 * @param {number} count - Number of questions
 */
function trackQuestionGeneration(difficulty, count = 1) {
  questionsGenerated.inc({ difficulty }, count);
}

/**
 * Track document upload
 * @param {string} status - Upload status (success, failed)
 */
function trackDocumentUpload(status) {
  documentUploads.inc({ status });
}

/**
 * Track subscription event
 * @param {string} eventType - Event type (created, renewed, cancelled)
 * @param {string} plan - Plan name
 */
function trackSubscriptionEvent(eventType, plan) {
  subscriptionEvents.inc({ event_type: eventType, plan });
}

module.exports = {
  register,
  metricsMiddleware,
  metricsEndpoint,
  trackDbQuery,
  trackCacheAccess,
  trackUserRegistration,
  trackQuestionGeneration,
  trackDocumentUpload,
  trackSubscriptionEvent,
};
