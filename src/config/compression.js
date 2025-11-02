const compression = require("compression");

/**
 * Compression Middleware Configuration
 * Implements gzip/brotli compression for HTTP responses
 */

function shouldCompress(req, res) {
  // Don't compress responses with Cache-Control: no-transform
  if (req.headers["cache-control"] && req.headers["cache-control"].includes("no-transform")) {
    return false;
  }

  // Don't compress if the client doesn't accept encoding
  if (!req.headers["accept-encoding"]) {
    return false;
  }

  // Don't compress already compressed responses
  const contentType = res.getHeader("Content-Type");
  if (contentType && (
    contentType.includes("gzip") ||
    contentType.includes("compress") ||
    contentType.includes("deflate") ||
    contentType.includes("br")
  )) {
    return false;
  }

  // Don't compress small responses (< 1KB)
  const contentLength = res.getHeader("Content-Length");
  if (contentLength && parseInt(contentLength) < 1024) {
    return false;
  }

  // Use compression default filter for other cases
  return compression.filter(req, res);
}

/**
 * Get compression middleware with optimized settings
 */
function getCompressionMiddleware() {
  return compression({
    // Custom filter function
    filter: shouldCompress,

    // Compression level (6 = balanced, 1 = fastest, 9 = best compression)
    level: 6,

    // Minimum response size to compress (1KB)
    threshold: 1024,

    // Memory level (8 = default, higher = more memory but better compression)
    memLevel: 8,

    // Strategy for compression algorithm
    strategy: compression.Z_DEFAULT_STRATEGY,
  });
}

module.exports = getCompressionMiddleware;
