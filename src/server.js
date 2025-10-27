const http = require("http");
const app = require("./app");
const { env, mongoose: mongooseCfg } = require("./config");
const { ensureNoEviction } = require("./config/redis");
const logger = require("./utils/logger");

const PORT = env.port || 3000;
const server = http.createServer(app);

async function start() {
  try {
    if ((process.env.DB_MODE || env.dbMode) !== "memory") {
      await mongooseCfg.connectMongoose(env.mongoUri, env.mongoDbName);
      logger.info({ db: env.mongoDbName }, "Connected to MongoDB (Mongoose)");
    } else {
      logger.info("DB_MODE=memory: skipping MongoDB connection");
    }
    // Best-effort Redis check to warn about unsafe eviction policies
    if (process.env.REDIS_URL) {
      await ensureNoEviction().catch(() => {});
    }
  } catch (err) {
    logger.error({ err }, "Failed to connect to MongoDB");
    process.exit(1);
  }

  server.listen(PORT, () => {
    logger.info({ port: PORT }, "Learinal API listening");
  });

  // Handle common server errors (e.g., port already in use)
  server.on("error", (err) => {
    if (err && err.code === "EADDRINUSE") {
      logger.error(
        { port: PORT },
        "Port is already in use. Set a different PORT or stop the other process."
      );
    } else {
      logger.error({ err }, "Server error");
    }
    process.exit(1);
  });
}

start();

function shutdown(signal) {
  logger.info({ signal }, "Shutting down gracefully...");
  server.close(async () => {
    // Close DB/queue connections here when added
    if ((process.env.DB_MODE || env.dbMode) !== "memory") {
      await mongooseCfg.disconnectMongoose().catch(() => {});
    }
    process.exit(0);
  });
  // Force close after 10s
  setTimeout(() => process.exit(1), 10_000).unref();
}

["SIGINT", "SIGTERM"].forEach((sig) => process.on(sig, () => shutdown(sig)));
