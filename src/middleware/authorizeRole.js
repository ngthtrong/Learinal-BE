const buildError = (status, code, message, details) => {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  if (details) {
    error.details = details;
  }
  return error;
};

// Stub RBAC middleware: relies on role provided by authenticateJWT from headers
function authorizeRole(...allowedRoles) {
  const normalizedRoles = allowedRoles.filter(Boolean);

  return (req, res, next) => {
    if (!req.user) {
      return next(buildError(401, "Unauthorized", "Authentication required"));
    }

    const headerRole =
      req.headers["x-dev-user-role"] || req.headers["X-Dev-User-Role"];
    if (typeof headerRole === "string" && headerRole.trim().length) {
      req.user.role = headerRole.trim();
    }

    if (!normalizedRoles.length || normalizedRoles.includes(req.user.role)) {
      return next();
    }

    return next(
      buildError(403, "Forbidden", "Insufficient role", {
        requiredRoles: normalizedRoles,
        userRole: req.user.role,
      })
    );
  };
}

module.exports = authorizeRole;
