const { cacheService, CacheTTL } = require("../services/cache.service");
const logger = require("../utils/logger");

/**
 * Response Caching Middleware
 * Caches GET responses based on URL and query parameters
 */

/**
 * Generate cache key from request
 * @param {Object} req - Express request object
 * @returns {string} Cache key
 */
function generateCacheKey(req) {
  const userId = req.user?.userId || "anonymous";
  const url = req.originalUrl || req.url;
  return `response:${userId}:${url}`;
}

/**
 * Create response caching middleware
 * @param {Object} options - Caching options
 * @param {number} options.ttl - Time to live in seconds
 * @param {Function} options.shouldCache - Custom function to determine if response should be cached
 * @returns {Function} Express middleware
 */
function cacheResponse(options = {}) {
  const { ttl = 300, shouldCache } = options;

  return async (req, res, next) => {
    // Only cache GET requests
    if (req.method !== "GET") {
      return next();
    }

    // Skip if Redis is not available
    if (!cacheService.isAvailable()) {
      return next();
    }

    // Custom cache decision
    if (shouldCache && !shouldCache(req)) {
      return next();
    }

    const cacheKey = generateCacheKey(req);

    try {
      // Try to get from cache
      const cached = await cacheService.get(cacheKey);

      if (cached) {
        logger.debug({ cacheKey }, "Response cache hit");
        
        // Set cache header
        res.set("X-Cache", "HIT");
        
        // Send cached response
        return res.status(cached.status).json(cached.body);
      }

      // Cache miss - intercept response
      logger.debug({ cacheKey }, "Response cache miss");
      res.set("X-Cache", "MISS");

      // Store original methods
      const originalJson = res.json.bind(res);
      const originalStatus = res.status.bind(res);
      
      let statusCode = 200;

      // Override status to capture status code
      res.status = function (code) {
        statusCode = code;
        return originalStatus(code);
      };

      // Override json to cache the response
      res.json = function (body) {
        // Only cache successful responses
        if (statusCode >= 200 && statusCode < 300) {
          const cacheData = { status: statusCode, body };
          
          cacheService.set(cacheKey, cacheData, ttl).catch((err) => {
            logger.warn({ cacheKey, err: err.message }, "Failed to cache response");
          });
        }

        return originalJson(body);
      };

      next();
    } catch (error) {
      logger.warn({ cacheKey, err: error.message }, "Cache middleware error");
      next();
    }
  };
}

/**
 * Invalidate cache for specific user
 * @param {string} userId - User ID
 * @param {string} pattern - URL pattern (optional)
 */
async function invalidateUserCache(userId, pattern = "*") {
  const cachePattern = `response:${userId}:${pattern}`;
  await cacheService.delPattern(cachePattern);
  logger.debug({ userId, pattern }, "User cache invalidated");
}

/**
 * Invalidate cache by pattern
 * @param {string} pattern - Cache key pattern
 */
async function invalidateCache(pattern) {
  await cacheService.delPattern(pattern);
  logger.debug({ pattern }, "Cache invalidated");
}

module.exports = {
  cacheResponse,
  invalidateUserCache,
  invalidateCache,
  CacheTTL,
};
