// Lightweight rate-limit placeholder (use express-rate-limit in production)
function rateLimit(options = {}) {
  return (req, res, next) => {
    // TODO: Implement proper rate limiting
    res.setHeader('X-RateLimit-Limit', options.limit || 60);
    res.setHeader('X-RateLimit-Remaining', 60);
    next();
  };
}

module.exports = rateLimit;
