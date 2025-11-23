const pino = require("pino");

const logger = pino({
  level: process.env.LOG_LEVEL || (process.env.NODE_ENV === "production" ? "info" : "debug"),
  base: {
    env: process.env.NODE_ENV || "development",
    service: "learinal-be",
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});

module.exports = logger;
