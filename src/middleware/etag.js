// ETag/If-None-Match utilities for optimistic concurrency and conditional requests
// Format convention: Weak ETag based on version: W/"v<number>"

function parseIfNoneMatchHeader(value) {
  if (!value || typeof value !== "string") return null;
  const m = value.match(/W\/"v(\d+)"/);
  if (!m) return null;
  const v = parseInt(m[1], 10);
  return Number.isFinite(v) ? v : null;
}

function toEtagFromVersion(v) {
  if (typeof v === "number" && Number.isFinite(v)) {
    return `W/"v${v}"`;
  }
  return undefined;
}

// Middleware: parse If-None-Match and attach to req.etag
function parseIfNoneMatch(req, _res, next) {
  const raw = req.get("If-None-Match") || req.get("if-none-match") || null;
  const expectedVersion = parseIfNoneMatchHeader(raw);
  req.etag = { ...(req.etag || {}), raw, expectedVersion };
  return next();
}

// Middleware: require a valid If-None-Match header for write operations
function requireIfNoneMatch(req, _res, next) {
  const raw = req.get("If-None-Match") || req.get("if-none-match");
  const expectedVersion = parseIfNoneMatchHeader(raw);
  if (!raw || expectedVersion === null) {
    const err = new Error("Validation failed");
    err.status = 400;
    err.code = "ValidationError";
    err.details = { "If-None-Match": 'required (format: W/"v<number>")' };
    return next(err);
  }
  req.etag = { ...(req.etag || {}), raw, expectedVersion };
  return next();
}

module.exports = {
  parseIfNoneMatchHeader,
  toEtagFromVersion,
  parseIfNoneMatch,
  requireIfNoneMatch,
};
