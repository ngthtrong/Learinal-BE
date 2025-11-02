/**
 * @fileoverview Socket.IO Configuration and Setup
 * @description WebSocket server for real-time notifications
 * Phase 3.4 - Production Features
 */

const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");
const config = require("../config");

/**
 * Initialize Socket.IO server
 * @param {http.Server} httpServer - HTTP server instance
 * @returns {SocketIO.Server}
 */
function initializeSocketIO(httpServer) {
  const io = new Server(httpServer, {
    cors: {
      origin: process.env.FRONTEND_URL || "*",
      methods: ["GET", "POST"],
      credentials: true,
    },
    path: "/socket.io/",
    transports: ["websocket", "polling"],
  });

  // Authentication middleware
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token;

      if (!token) {
        return next(new Error("Authentication token required"));
      }

      // Verify JWT token
      const decoded = jwt.verify(token, config.jwtSecret);

      if (!decoded || !decoded.id) {
        return next(new Error("Invalid token"));
      }

      // Attach user info to socket
      socket.userId = decoded.id;
      socket.userRole = decoded.role;

      next();
    } catch (error) {
      next(new Error("Authentication failed: " + error.message));
    }
  });

  // Connection handler
  io.on("connection", (socket) => {
    console.log(`✓ User connected: ${socket.userId} (${socket.id})`);

    // Join user's personal room
    socket.join(`user:${socket.userId}`);

    // Join role-based room
    if (socket.userRole) {
      socket.join(`role:${socket.userRole}`);
    }

    // Handle client events
    socket.on("ping", (callback) => {
      if (typeof callback === "function") {
        callback({ timestamp: Date.now() });
      }
    });

    socket.on("disconnect", (reason) => {
      console.log(`✗ User disconnected: ${socket.userId} (${reason})`);
    });

    socket.on("error", (error) => {
      console.error(`Socket error for user ${socket.userId}:`, error);
    });

    // Send welcome message
    socket.emit("connected", {
      userId: socket.userId,
      message: "Connected to Learinal real-time server",
      timestamp: new Date().toISOString(),
    });
  });

  return io;
}

module.exports = { initializeSocketIO };
