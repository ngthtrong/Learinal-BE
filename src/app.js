const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const cookieParser = require("cookie-parser");
const { env } = require("./config");
const path = require("path");
const routes = require("./routes");
const healthRoutes = require("./routes/health.routes");
const requestId = require("./middleware/requestId");
const errorFormatter = require("./middleware/errorFormatter");
const errorHandler = require("./middleware/errorHandler");

const app = express();

// Core middleware
app.use(requestId);
// Security headers
// In development, relax CSP to allow inline scripts/styles for simple test pages
if (env.nodeEnv !== "production") {
  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          "default-src": ["'self'"],
          "script-src": ["'self'", "'unsafe-inline'"],
          "style-src": ["'self'", "'unsafe-inline'"],
          "img-src": ["'self'", "data:"],
          "object-src": ["'none'"],
        },
      },
    })
  );
} else {
  app.use(helmet());
}
// Parse cookies (for OAuth state and optional refresh cookie)
app.use(cookieParser());
// CORS: restrict by env when provided
const allowed = (env.corsAllowedOrigins || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin || allowed.length === 0) return cb(null, true);
      if (allowed.includes(origin)) return cb(null, true);
      return cb(new Error("CORS not allowed for this origin"), false);
    },
    credentials: true,
  })
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Public health endpoint (no auth required)
app.use("/health", healthRoutes);

// Serve minimal static frontend for testing password reset links
const publicDir = path.join(__dirname, "..", "public");
app.use(express.static(publicDir));
app.get("/reset-password", (req, res) => {
  res.sendFile(path.join(publicDir, "reset-password.html"));
});

// Serve simple OAuth testing pages
app.get("/oauth", (req, res) => {
  res.sendFile(path.join(publicDir, "oauth.html"));
});

// Google will redirect to this path with ?code=...
// Ensure GOOGLE_REDIRECT_URI matches http://localhost:<PORT>/oauth/google/callback for local testing
app.get("/oauth/google/callback", (req, res) => {
  res.sendFile(path.join(publicDir, "oauth-callback.html"));
});

// Base URL: /api/v1
app.use("/api/v1", routes);

// 404 handler (after all routes)
app.use((req, res) => {
  res.status(404).json({ code: "NotFound", message: "Resource not found" });
});

// Error handler (last)
app.use(errorFormatter);
app.use(errorHandler);

module.exports = app;
