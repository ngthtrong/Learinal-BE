const mongoose = require("mongoose");
const logger = require("../utils/logger");

mongoose.set("strictQuery", true);

async function connectMongoose(uri, dbName) {
  await mongoose.connect(uri, {
    dbName,
    serverSelectionTimeoutMS: 15000,
    maxPoolSize: 10,
  });
  logger.info({ db: dbName }, "Mongoose connected");
  return mongoose.connection;
}

async function disconnectMongoose() {
  await mongoose.disconnect();
  logger.info("Mongoose disconnected");
}

module.exports = { connectMongoose, disconnectMongoose };
