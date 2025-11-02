// Redis clients for different libraries
// - node-redis (redis) v4: used for rate limiting store and simple KV (idempotency)
// - ioredis: used for BullMQ (queues)

// Ensure environment variables are loaded
require('dotenv').config();

let nodeRedisClient = null;
let ioRedisClient = null;
const logger = require("../utils/logger");

async function getNodeRedis() {
  const url = process.env.REDIS_URL;
  if (!url) return null;
  if (nodeRedisClient) return nodeRedisClient;
  const { createClient } = require("redis");
  const client = createClient({ url });
  client.on("error", (err) => logger.error({ err }, "Redis (node-redis) error"));
  await client.connect();
  nodeRedisClient = client;
  return nodeRedisClient;
}

function getIORedis() {
  const url = process.env.REDIS_URL;
  if (!url) return null;
  if (ioRedisClient) return ioRedisClient;
  const IORedis = require("ioredis");
  // BullMQ requires maxRetriesPerRequest=null (and recommends enableReadyCheck=false)
  ioRedisClient = new IORedis(url, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });
  ioRedisClient.on("error", (err) => logger.error({ err }, "Redis (ioredis) error"));
  return ioRedisClient;
}

async function checkEvictionPolicy() {
  const client = getIORedis();
  if (!client) return { policy: null, source: "none" };
  // Try CONFIG GET first
  try {
    const res = await client.config("GET", "maxmemory-policy");
    // ioredis returns array like ['maxmemory-policy', 'volatile-lru']
    const idx = Array.isArray(res)
      ? res.findIndex((k) => String(k).toLowerCase() === "maxmemory-policy")
      : -1;
    const policy = idx !== -1 && Array.isArray(res) && res[idx + 1] ? String(res[idx + 1]) : null;
    if (policy) return { policy, source: "CONFIG" };
  } catch {
    // Many managed Redis providers block CONFIG; fall back to INFO memory
  }

  try {
    const info = await client.info("memory");
    if (info) {
      const line = String(info)
        .split(/\r?\n/)
        .find((l) => l.toLowerCase().startsWith("maxmemory_policy:"));
      if (line) {
        const policy = line.split(":")[1]?.trim();
        return { policy: policy || null, source: "INFO" };
      }
    }
  } catch {
    // ignore
  }
  return { policy: null, source: "unknown" };
}

async function ensureNoEviction() {
  if (!process.env.REDIS_URL) return;
  try {
    const { policy, source } = await checkEvictionPolicy();
    if (policy && policy !== "noeviction") {
      logger.error(
        { policy, source },
        '[Redis] Unsafe maxmemory policy detected. Recommended policy is "noeviction" to prevent loss of idempotency keys and rate limit state.\n' +
          "- Local Docker: redis-server --maxmemory-policy noeviction\n" +
          '- Redis Cloud/Upstash/Azure: set "maxmemory policy" to noeviction in portal or via CLI.'
      );
      process.env.REDIS_EVICTION_POLICY = policy;
    } else if (!policy) {
      logger.warn(
        "[Redis] Could not determine maxmemory eviction policy (provider may block CONFIG/INFO)."
      );
    }
  } catch (e) {
    logger.warn({ err: e?.message || e }, "[Redis] Eviction policy check failed");
  }
}

module.exports = { getNodeRedis, getIORedis, ensureNoEviction, checkEvictionPolicy };
