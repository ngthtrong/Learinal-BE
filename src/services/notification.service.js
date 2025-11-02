/**
 * @fileoverview Real-time Notification Service
 * @description Emit real-time events via Socket.IO
 * Phase 3.4 - Production Features
 */

class NotificationService {
  constructor() {
    this.io = null;
  }

  /**
   * Initialize with Socket.IO instance
   * @param {SocketIO.Server} io - Socket.IO server instance
   */
  initialize(io) {
    this.io = io;
  }

  /**
   * Get Socket.IO instance (lazy load from app)
   * @private
   */
  _getIO() {
    if (this.io) {
      return this.io;
    }

    // Try to get from Express app
    const app = require("../app");
    this.io = app.get("io");

    if (!this.io) {
      console.warn("Socket.IO not initialized. Real-time notifications disabled.");
    }

    return this.io;
  }

  /**
   * Emit validation request assigned to expert
   * @param {string} expertId - ID of expert who received the validation request
   * @param {Object} validationRequest - Validation request data
   */
  emitValidationAssigned(expertId, validationRequest) {
    const io = this._getIO();
    if (!io) return;

    io.to(`user:${expertId}`).emit("validation.assigned", {
      type: "validation.assigned",
      data: {
        validationRequestId: validationRequest._id,
        questionSetId: validationRequest.questionSet,
        requestedBy: validationRequest.requestedBy,
        createdAt: validationRequest.createdAt,
      },
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Emit validation completed to learner
   * @param {string} learnerId - ID of learner who requested validation
   * @param {Object} validationRequest - Completed validation request
   */
  emitValidationCompleted(learnerId, validationRequest) {
    const io = this._getIO();
    if (!io) return;

    io.to(`user:${learnerId}`).emit("validation.completed", {
      type: "validation.completed",
      data: {
        validationRequestId: validationRequest._id,
        questionSetId: validationRequest.questionSet,
        status: validationRequest.status,
        reviewedBy: validationRequest.reviewedBy,
        completedAt: validationRequest.completedAt,
      },
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Emit quiz attempt completed
   * @param {string} userId - ID of user who completed quiz
   * @param {Object} quizAttempt - Quiz attempt data
   */
  emitQuizCompleted(userId, quizAttempt) {
    const io = this._getIO();
    if (!io) return;

    io.to(`user:${userId}`).emit("quiz.completed", {
      type: "quiz.completed",
      data: {
        quizAttemptId: quizAttempt._id,
        questionSetId: quizAttempt.questionSet,
        score: quizAttempt.score,
        totalQuestions: quizAttempt.totalQuestions,
        completedAt: quizAttempt.completedAt,
      },
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Emit document processing completed
   * @param {string} userId - ID of user who uploaded document
   * @param {Object} document - Document data
   */
  emitDocumentProcessed(userId, document) {
    const io = this._getIO();
    if (!io) return;

    io.to(`user:${userId}`).emit("document.processed", {
      type: "document.processed",
      data: {
        documentId: document._id,
        fileName: document.fileName,
        status: document.ingestionStatus,
        summary: document.summaryShort,
      },
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Emit question set generation completed
   * @param {string} userId - ID of user who requested generation
   * @param {Object} questionSet - Generated question set
   */
  emitQuestionSetGenerated(userId, questionSet) {
    const io = this._getIO();
    if (!io) return;

    io.to(`user:${userId}`).emit("questionSet.generated", {
      type: "questionSet.generated",
      data: {
        questionSetId: questionSet._id,
        title: questionSet.title,
        totalQuestions: questionSet.questions?.length || 0,
        status: questionSet.status,
      },
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Emit notification to specific user
   * @param {string} userId - Target user ID
   * @param {Object} notification - Notification data
   */
  emitNotification(userId, notification) {
    const io = this._getIO();
    if (!io) return;

    io.to(`user:${userId}`).emit("notification", {
      type: "notification",
      data: notification,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Emit notification to all users with specific role
   * @param {string} role - Target role (learner, expert, admin)
   * @param {Object} notification - Notification data
   */
  emitNotificationToRole(role, notification) {
    const io = this._getIO();
    if (!io) return;

    io.to(`role:${role}`).emit("notification", {
      type: "notification",
      data: notification,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Broadcast system-wide announcement
   * @param {Object} announcement - Announcement data
   */
  broadcastAnnouncement(announcement) {
    const io = this._getIO();
    if (!io) return;

    io.emit("system.announcement", {
      type: "system.announcement",
      data: announcement,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Emit commission earned notification to expert
   * @param {string} expertId - ID of expert
   * @param {Object} commission - Commission record
   */
  emitCommissionEarned(expertId, commission) {
    const io = this._getIO();
    if (!io) return;

    io.to(`user:${expertId}`).emit("commission.earned", {
      type: "commission.earned",
      data: {
        commissionId: commission._id,
        amount: commission.amount,
        validationRequestId: commission.validationRequest,
        earnedAt: commission.createdAt,
      },
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Emit subscription status change
   * @param {string} userId - User ID
   * @param {Object} subscription - Subscription data
   */
  emitSubscriptionUpdated(userId, subscription) {
    const io = this._getIO();
    if (!io) return;

    io.to(`user:${userId}`).emit("subscription.updated", {
      type: "subscription.updated",
      data: {
        subscriptionId: subscription._id,
        planName: subscription.plan?.planName,
        status: subscription.status,
        endDate: subscription.endDate,
      },
      timestamp: new Date().toISOString(),
    });
  }
}

module.exports = new NotificationService();
