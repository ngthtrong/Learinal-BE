const { env } = require("../config");
const { randomUUID, createHash } = require("crypto");
const jwt = require("jsonwebtoken");

// Stub/real JWT authentication middleware
function authenticateJWT(req, res, next) {
  const globalMode = process.env.AUTH_MODE || env.authMode || "stub";
  const localOverride = process.env.LOCAL_AUTH_MODE || env.localAuthMode || "";
  const mode = globalMode === "real" || localOverride === "real" ? "real" : "stub";

  if (mode === "stub") {
    // In stub mode, allow dev headers or a simple Bearer stub token
    const devUserId = req.headers["x-dev-user-id"];
    const devUserRole = req.headers["x-dev-user-role"] || "Learner";
    const authz = req.headers["authorization"] || "";

    let userId = devUserId;
    let role = devUserRole;

    if (!userId && authz.startsWith("Bearer stub:")) {
      // Format: Bearer stub:{userId}:{role}
      const parts = authz.replace("Bearer ", "").split(":");
      userId = parts[1] || randomUUID();
      role = parts[2] || "Learner";
    }

    if (!userId && authz.startsWith("Bearer stub.access.")) {
      // Format: Bearer stub.access.{base64url(userId.now)}
      const token = authz.substring("Bearer ".length);
      const encoded = token.substring("stub.access.".length);
      const toBase64 = (s) => {
        const pad =
          s.length % 4 === 2 ? "==" : s.length % 4 === 3 ? "=" : s.length % 4 === 1 ? "===" : "";
        return s.replace(/-/g, "+").replace(/_/g, "/") + pad;
      };
      try {
        const decoded = Buffer.from(toBase64(encoded), "base64").toString("utf8");
        const first = String(decoded).split(".")[0];
        if (first) {
          userId = first;
          role = devUserRole || "Learner";
        }
      } catch {
        // ignore and fall through
      }
    }

    if (!userId) {
      return res.status(401).json({
        code: "Unauthorized",
        message: "Authentication required (stub mode)",
      });
    }

    // Normalize stub user id to a valid MongoDB ObjectId-like hex string so Mongoose can cast it
    const toObjectIdHex = (val) => {
      const s = String(val).trim();
      const isHex24 = /^[a-fA-F0-9]{24}$/.test(s);
      if (isHex24) return s.toLowerCase();
      // Derive a deterministic 24-hex from the input using SHA-1
      return createHash("sha1").update(s).digest("hex").slice(0, 24);
    };

    const normalizedId = toObjectIdHex(userId);

    req.user = {
      id: normalizedId,
      role,
      email: `${userId}@example.test`,
      fullName: "Stub User",
      status: "Active",
    };
    return next();
  }

  // Real mode: verify Bearer JWT signed by our API
  const authz = req.headers["authorization"] || "";
  if (!authz.startsWith("Bearer ")) {
    return res.status(401).json({ code: "Unauthorized", message: "Authentication required" });
  }
  const token = authz.substring("Bearer ".length);
  try {
    const payload = jwt.verify(token, env.jwtSecret);
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
