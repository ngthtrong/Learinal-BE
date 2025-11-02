const mongoose = require("mongoose");
const logger = require("../utils/logger");

mongoose.set("strictQuery", true);

// Enable query profiling in development
if (process.env.NODE_ENV === "development") {
  mongoose.set("debug", true);
}

async function connectMongoose(uri, dbName) {
  await mongoose.connect(uri, {
    dbName,
    serverSelectionTimeoutMS: 15000,
    maxPoolSize: 20, // Increased for production load
    minPoolSize: 5, // Minimum connections to maintain
    socketTimeoutMS: 45000,
    family: 4, // Use IPv4
  });
  logger.info({ db: dbName }, "Mongoose connected");
  return mongoose.connection;
}

async function disconnectMongoose() {
  await mongoose.disconnect();
  logger.info("Mongoose disconnected");
}

module.exports = { connectMongoose, disconnectMongoose };
