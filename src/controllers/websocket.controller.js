/**
 * @fileoverview WebSocket Test Controller
 * @description Endpoints for testing real-time notifications
 * Phase 3.4 - Production Features
 */

const notificationService = require("../services/notification.service");

/**
 * @route POST /api/v1/notifications/test
 * @access Private (Admin only)
 * @description Send a test notification to user
 */
exports.sendTestNotification = async (req, res, next) => {
  try {
    const { userId, message } = req.body;

    if (!userId || !message) {
      return res.status(400).json({
        success: false,
        message: "userId and message are required",
      });
    }

    notificationService.emitNotification(userId, {
      title: "Test Notification",
      message,
      type: "info",
    });

    res.status(200).json({
      success: true,
      message: `Test notification sent to user ${userId}`,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @route POST /api/v1/notifications/broadcast
 * @access Private (Admin only)
 * @description Broadcast announcement to all users
 */
exports.broadcastAnnouncement = async (req, res, next) => {
  try {
    const { title, message, priority } = req.body;

    if (!title || !message) {
      return res.status(400).json({
        success: false,
        message: "title and message are required",
      });
    }

    notificationService.broadcastAnnouncement({
      title,
      message,
      priority: priority || "normal",
      timestamp: new Date().toISOString(),
    });

    res.status(200).json({
      success: true,
      message: "Announcement broadcasted to all connected users",
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @route GET /api/v1/notifications/status
 * @access Private
 * @description Check WebSocket connection status
 */
exports.getConnectionStatus = async (req, res, next) => {
  try {
    const app = require("../app");
    const io = app.get("io");

    if (!io) {
      return res.status(503).json({
        success: false,
        message: "WebSocket server not initialized",
      });
    }

    const sockets = await io.fetchSockets();
    const connectedUsers = sockets.map((s) => s.userId).filter(Boolean);

    res.status(200).json({
      success: true,
      data: {
        enabled: true,
        totalConnections: sockets.length,
        connectedUsers: connectedUsers.length,
      },
    });
  } catch (error) {
    next(error);
  }
};
