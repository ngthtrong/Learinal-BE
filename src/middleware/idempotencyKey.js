// Idempotency-Key placeholder middleware for POST endpoints
function idempotencyKey(req, res, next) {
  // TODO: Store/verify idempotency key for safe retries
  next();
}

module.exports = idempotencyKey;
