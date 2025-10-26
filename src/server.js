const http = require('http');
const app = require('./app');
const { env, mongoose: mongooseCfg } = require('./config');
const { ensureNoEviction } = require('./config/redis');

const PORT = env.port || 3000;
const server = http.createServer(app);

async function start() {
  try {
    if ((process.env.DB_MODE || env.dbMode) !== 'memory') {
      await mongooseCfg.connectMongoose(env.mongoUri, env.mongoDbName);
      // eslint-disable-next-line no-console
      console.log(`Connected to MongoDB (Mongoose): ${env.mongoDbName}`);
    } else {
      // eslint-disable-next-line no-console
      console.log('DB_MODE=memory: skipping MongoDB connection');
    }
    // Best-effort Redis check to warn about unsafe eviction policies
    if (process.env.REDIS_URL) {
      await ensureNoEviction().catch(() => {});
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("Failed to connect to MongoDB", err);
    process.exit(1);
  }

  server.listen(PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`Learinal API listening on port ${PORT}`);
  });

  // Handle common server errors (e.g., port already in use)
  server.on("error", (err) => {
    if (err && err.code === "EADDRINUSE") {
      // eslint-disable-next-line no-console
      console.error(
        `Port ${PORT} is already in use. Set a different PORT env or stop the other process.`
      );
    } else {
      // eslint-disable-next-line no-console
      console.error("Server error:", err);
    }
    process.exit(1);
  });
}

start();

function shutdown(signal) {
  // eslint-disable-next-line no-console
  console.log(`\nReceived ${signal}. Shutting down gracefully...`);
  server.close(async () => {
    // Close DB/queue connections here when added
    if ((process.env.DB_MODE || env.dbMode) !== 'memory') {
      await mongooseCfg.disconnectMongoose().catch(() => {});
    }
    process.exit(0);
  });
  // Force close after 10s
  setTimeout(() => process.exit(1), 10_000).unref();
}

["SIGINT", "SIGTERM"].forEach((sig) => process.on(sig, () => shutdown(sig)));
