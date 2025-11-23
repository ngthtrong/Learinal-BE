const { env } = require("../config");
const jwt = require("jsonwebtoken");

// Always-real JWT authentication middleware
function authenticateJWT(req, res, next) {
  const authz = req.headers["authorization"] || "";
  if (!authz.startsWith("Bearer ")) {
    return res.status(401).json({ code: "Unauthorized", message: "Authentication required" });
  }
  const token = authz.substring("Bearer ".length);
  try {
    const verifyOpts = {
      algorithms: [env.jwtAlgorithm || "HS256"],
    };
    if (env.jwtIssuer) verifyOpts.issuer = env.jwtIssuer;
    if (env.jwtAudience) verifyOpts.audience = env.jwtAudience;
    const payload = jwt.verify(token, env.jwtSecret, verifyOpts);
    req.user = {
      id: payload.sub,
      role: payload.role,
      email: payload.email,
      fullName: payload.name,
      status: payload.status || "Active",
    };
    return next();
  } catch {
    return res.status(401).json({ code: "Unauthorized", message: "Invalid token" });
  }
}

module.exports = authenticateJWT;
