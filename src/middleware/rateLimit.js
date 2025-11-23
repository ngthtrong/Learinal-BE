const rateLimitLib = require("express-rate-limit");
const { getNodeRedis } = require("../config/redis");

// Custom Redis store compatible with express-rate-limit v7
function createRedisStore(windowMs) {
  const windowSeconds = Math.ceil(windowMs / 1000);
  return {
    async increment(key) {
      const client = await getNodeRedis();
      if (!client) throw new Error("Redis client not available");
      const multi = client.multi();
      multi.incr(key);
      multi.ttl(key);
      const replies = await multi.exec();
      const totalHits = replies?.[0]?.[1] || 1;
      let ttl = replies?.[1]?.[1];
      if (ttl === -1 || ttl === -2) {
        await client.expire(key, windowSeconds);
        ttl = windowSeconds;
      }
      const resetTime = new Date(Date.now() + (ttl > 0 ? ttl * 1000 : windowMs));
      return { totalHits, resetTime };
    },
    async decrement(key) {
      const client = await getNodeRedis();
      if (!client) return;
      await client.decr(key).catch(() => {});
    },
    async resetKey(key) {
      const client = await getNodeRedis();
      if (!client) return;
      await client.del(key).catch(() => {});
    },
  };
}

function rateLimit(options = {}) {
  const limit = options.limit || 60;
  const windowMs = options.windowMs || 60_000; // 1 minute

  const baseOptions = {
    windowMs,
    max: limit,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res /*, next*/) => {
      const retryAfter = Math.ceil(windowMs / 1000);
      res.setHeader("Retry-After", retryAfter);
      return res.status(429).json({ code: "TooManyRequests", message: "Rate limit exceeded" });
    },
  };

  const useRedis = !!process.env.REDIS_URL;
  const limiter = useRedis
    ? rateLimitLib({ ...baseOptions, store: createRedisStore(windowMs) })
    : rateLimitLib({ ...baseOptions });

  return (req, res, next) => {
    res.setHeader("X-RateLimit-Limit", limit);
    limiter(req, res, next);
  };
}

module.exports = rateLimit;
