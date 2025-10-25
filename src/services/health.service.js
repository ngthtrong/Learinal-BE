const mongoose = require("mongoose");
const { version } = require("../../package.json");

const READY_STATE_CONNECTED = 1;

const getHealthStatus = () => {
  const readyState = mongoose.connection.readyState;
  const isDatabaseOnline = readyState === READY_STATE_CONNECTED;

  return {
    status: isDatabaseOnline ? "OK" : "DEGRADED",
    version,
  };
};

module.exports = { getHealthStatus };
