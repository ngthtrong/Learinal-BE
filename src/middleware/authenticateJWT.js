const buildError = (status, code, message, details) => {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  if (details) {
    error.details = details;
  }
  return error;
};

// Stub JWT authentication middleware: accepts any Bearer token
function authenticateJWT(req, res, next) {
  const authHeader = req.headers.authorization || req.headers.Authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return next(buildError(401, "Unauthorized", "Authentication required"));
  }

  const token = authHeader.slice(7).trim();
  if (!token) {
    return next(buildError(401, "Unauthorized", "Authentication required"));
  }

  const userIdHeader =
    req.headers["x-dev-user-id"] || req.headers["X-Dev-User-Id"];
  const emailHeader =
    req.headers["x-dev-user-email"] || req.headers["X-Dev-User-Email"];
  const roleHeader =
    req.headers["x-dev-user-role"] || req.headers["X-Dev-User-Role"];

  const userId =
    typeof userIdHeader === "string" && userIdHeader.trim().length
      ? userIdHeader.trim()
      : "stub-user";

  const role =
    typeof roleHeader === "string" && roleHeader.trim().length
      ? roleHeader.trim()
      : "Learner";

  req.user = {
    id: userId,
    userId,
    email: typeof emailHeader === "string" ? emailHeader.trim() || null : null,
    role,
    token,
    isStub: true,
  };

  req.authToken = token;

  return next();
}

module.exports = authenticateJWT;
