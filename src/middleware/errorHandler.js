const logger = require("../utils/logger");

function errorHandler(err, req, res, _next) {
  const status = err.status || 500;
  const code = err.code || (status >= 500 ? "InternalServerError" : "BadRequest");
  const message = err.message || "Internal server error";
  const details = err.details || undefined;

  // Structured error log with request id and status
  try {
    logger.error({ reqId: req.id || "-", status, code, details, err }, message);
  } catch {}

  res.status(status).json({ code, message, ...(details ? { details } : {}) });
}

module.exports = errorHandler;
