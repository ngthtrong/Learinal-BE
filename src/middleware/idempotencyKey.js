// Idempotency-Key store: Redis (if REDIS_URL) else in-memory
const store = new Map(); // fallback when Redis not configured
const { getNodeRedis } = require('../config/redis');

function makeKey(req) {
  const userId = (req.user && req.user.id) || 'anon';
  const key = req.headers['idempotency-key'];
  return `${userId}:${req.method}:${req.originalUrl}:${key}`;
}

async function idempotencyKey(req, res, next) {
  const key = req.headers['idempotency-key'];
  if (!key) return next(); // Optional per OpenAPI

  const composite = makeKey(req);
  try {
    const redis = await getNodeRedis();
    if (redis) {
      const cached = await redis.get(composite);
      if (cached) {
        const parsed = JSON.parse(cached);
        res.status(parsed.status).json(parsed.body);
        return;
      }
    } else {
      const existing = store.get(composite);
      if (existing) {
        res.status(existing.status).json(existing.body);
        return;
      }
    }
  } catch (e) {
    // On Redis error, fall through without blocking
  }

  const originalJson = res.json.bind(res);
  res.json = async function patchedJson(body) {
    // Cache on first success (2xx)
    if (res.statusCode >= 200 && res.statusCode < 300) {
      const record = { status: res.statusCode, body, createdAt: Date.now() };
      try {
        const redis = await getNodeRedis();
        if (redis) {
          // Default TTL 24h
          await redis.set(composite, JSON.stringify(record), { EX: 60 * 60 * 24 });
        } else {
          store.set(composite, record);
        }
      } catch (e) {
        store.set(composite, record);
      }
    }
    return originalJson(body);
  };

  next();
}

module.exports = idempotencyKey;
