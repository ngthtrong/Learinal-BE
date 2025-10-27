const express = require("express");
const cors = require("cors");
const path = require("path");
const routes = require("./routes");
const healthRoutes = require("./routes/health.routes");
const requestId = require("./middleware/requestId");
const errorFormatter = require("./middleware/errorFormatter");
const errorHandler = require("./middleware/errorHandler");

const app = express();

// Core middleware
app.use(requestId);
app.use(cors());
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
