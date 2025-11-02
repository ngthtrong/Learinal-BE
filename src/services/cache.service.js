const { redisClient } = require("../config/redis");
const logger = require("../utils/logger");

/**
 * Redis Cache Layer
 * Provides caching utilities for frequently accessed data
 */

class CacheService {
  constructor() {
    this.client = redisClient;
    this.defaultTTL = 300; // 5 minutes
  }

  /**
   * Generate cache key with prefix
   * @param {string} prefix - Cache key prefix (e.g., 'user', 'subject')
   * @param {string} id - Resource ID
   * @returns {string} Full cache key
   */
  generateKey(prefix, id) {
    return `cache:${prefix}:${id}`;
  }

  /**
   * Get value from cache
   * @param {string} key - Cache key
   * @returns {Promise<any|null>} Cached value or null
   */
  async get(key) {
    try {
      const value = await this.client.get(key);
      if (!value) return null;

      const parsed = JSON.parse(value);
      logger.debug({ key }, "Cache hit");
      return parsed;
    } catch (error) {
      logger.warn({ key, err: error.message }, "Cache get failed");
      return null;
    }
  }

  /**
   * Set value in cache
   * @param {string} key - Cache key
   * @param {any} value - Value to cache
   * @param {number} ttl - Time to live in seconds
   * @returns {Promise<boolean>} Success status
   */
  async set(key, value, ttl = this.defaultTTL) {
    try {
      const serialized = JSON.stringify(value);
      await this.client.setex(key, ttl, serialized);
      logger.debug({ key, ttl }, "Cache set");
      return true;
    } catch (error) {
      logger.warn({ key, err: error.message }, "Cache set failed");
      return false;
    }
  }

  /**
   * Delete value from cache
   * @param {string} key - Cache key
   * @returns {Promise<boolean>} Success status
   */
  async del(key) {
    try {
      await this.client.del(key);
      logger.debug({ key }, "Cache deleted");
      return true;
    } catch (error) {
      logger.warn({ key, err: error.message }, "Cache delete failed");
      return false;
    }
  }

  /**
   * Delete multiple keys by pattern
   * @param {string} pattern - Key pattern (e.g., 'cache:user:*')
   * @returns {Promise<number>} Number of keys deleted
   */
  async delPattern(pattern) {
    try {
      const keys = await this.client.keys(pattern);
      if (keys.length === 0) return 0;

      await this.client.del(...keys);
      logger.debug({ pattern, count: keys.length }, "Cache pattern deleted");
      return keys.length;
    } catch (error) {
      logger.warn({ pattern, err: error.message }, "Cache pattern delete failed");
      return 0;
    }
  }

  /**
   * Get or set cached value
   * @param {string} key - Cache key
   * @param {Function} fetchFn - Function to fetch data if not cached
   * @param {number} ttl - Time to live in seconds
   * @returns {Promise<any>} Cached or fetched value
   */
  async getOrSet(key, fetchFn, ttl = this.defaultTTL) {
    // Try to get from cache
    const cached = await this.get(key);
    if (cached !== null) {
      return cached;
    }

    // Fetch fresh data
    logger.debug({ key }, "Cache miss, fetching data");
    const data = await fetchFn();

    // Cache the result
    if (data !== null && data !== undefined) {
      await this.set(key, data, ttl);
    }

    return data;
  }

  /**
   * Invalidate cache for a resource
   * @param {string} prefix - Cache key prefix
   * @param {string} id - Resource ID
   */
  async invalidate(prefix, id) {
    const key = this.generateKey(prefix, id);
    await this.del(key);
  }

  /**
   * Invalidate all cache for a resource type
   * @param {string} prefix - Cache key prefix
   */
  async invalidateAll(prefix) {
    const pattern = `cache:${prefix}:*`;
    await this.delPattern(pattern);
  }

  /**
   * Check if Redis is available
   * @returns {boolean} Connection status
   */
  isAvailable() {
    return this.client && this.client.status === "ready";
  }
}

// Cache TTL configurations (in seconds)
const CacheTTL = {
  USER: 600, // 10 minutes
  SUBJECT: 300, // 5 minutes
  DOCUMENT: 300, // 5 minutes
  QUESTION_SET: 600, // 10 minutes
  SUBSCRIPTION_PLAN: 3600, // 1 hour (rarely changes)
  USER_SUBSCRIPTION: 300, // 5 minutes
  QUIZ_ATTEMPT: 180, // 3 minutes
  NOTIFICATION: 60, // 1 minute
  SEARCH_RESULTS: 120, // 2 minutes
};

// Singleton instance
const cacheService = new CacheService();

module.exports = {
  cacheService,
  CacheTTL,
};
