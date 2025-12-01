/**
 * @fileoverview Real-time Notification Service
 * @description Emit real-time events via Socket.IO and persist notifications to database
 * Phase 3.4 - Production Features
 */

const logger = require("../utils/logger");
const NotificationsRepository = require("../repositories/notifications.repository");

class NotificationService {
  constructor() {
    this.io = null;
    this.notificationsRepo = new NotificationsRepository();
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
      logger.warn("Socket.IO not initialized. Real-time notifications disabled.");
    }

    return this.io;
  }

  /**
   * Create persistent notification in database
   * @private
   */
  async _createNotification(userId, title, message, type = "info", relatedEntityType = null, relatedEntityId = null) {
    try {
      await this.notificationsRepo.create({
        userId,
        title,
        message,
        type,
        relatedEntityType,
        relatedEntityId,
        isRead: false,
      });
      logger.info({ userId, title, type }, "[NotificationService] Created persistent notification");
    } catch (err) {
      logger.error({ userId, title, err: err?.message }, "[NotificationService] Failed to create persistent notification");
    }
  }

  /**
   * Emit validation request assigned to expert
   * @param {string} expertId - ID of expert who received the validation request
   * @param {Object} validationRequest - Validation request data
   */
  async emitValidationAssigned(expertId, validationRequest) {
    const io = this._getIO();
    
    const title = "Yêu cầu xét duyệt mới";
    const message = `Bạn đã được chỉ định xét duyệt bộ câu hỏi`;
    
    // Create persistent notification
    await this._createNotification(
      expertId,
      title,
      message,
      "info",
      "ValidationRequest",
      validationRequest._id
    );

    // Emit real-time event
    if (io) {
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
  }

  /**
   * Emit validation completed to learner
   * @param {string} learnerId - ID of learner who requested validation
   * @param {Object} validationRequest - Completed validation request
   */
  async emitValidationCompleted(learnerId, validationRequest) {
    const io = this._getIO();
    
    const decision = validationRequest.decision || validationRequest.status;
    const title = decision === "Approved" ? "Xét duyệt hoàn thành" : "Xét duyệt không được chấp nhận";
    const message = decision === "Approved" 
      ? `Bộ câu hỏi của bạn đã được chấp nhận`
      : `Bộ câu hỏi của bạn cần chỉnh sửa`;
    const type = decision === "Approved" ? "success" : "warning";
    
    // Create persistent notification
    await this._createNotification(
      learnerId,
      title,
      message,
      type,
      "ValidationRequest",
      validationRequest._id
    );

    // Emit real-time event
    if (io) {
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
  }

  /**
   * Emit quiz attempt completed
   * @param {string} userId - ID of user who completed quiz
   * @param {Object} quizAttempt - Quiz attempt data
   */
  async emitQuizCompleted(userId, quizAttempt) {
    const io = this._getIO();
    
    const score = quizAttempt.score || 0;
    const title = "Bài kiểm tra hoàn thành";
    const message = `Bạn đã hoàn thành bài kiểm tra với điểm số ${score.toFixed(1)}/10`;
    const type = score >= 8 ? "success" : score >= 5 ? "info" : "warning";
    
    // Create persistent notification
    await this._createNotification(
      userId,
      title,
      message,
      type,
      "QuizAttempt",
      quizAttempt._id
    );

    // Emit real-time event
    if (io) {
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
  }

  /**
   * Emit document processing completed
   * @param {string} userId - ID of user who uploaded document
   * @param {Object} document - Document data
   */
  async emitDocumentProcessed(userId, document) {
    const io = this._getIO();
    
    const status = document.status;
    const title = status === "Completed" ? "Tài liệu đã xử lý xong" : "Xử lý tài liệu thất bại";
    const message = status === "Completed"
      ? `Tài liệu "${document.originalFileName}" đã sẵn sàng sử dụng`
      : `Tài liệu "${document.originalFileName}" gặp lỗi khi xử lý`;
    const type = status === "Completed" ? "success" : "error";
    
    // Create persistent notification
    await this._createNotification(
      userId,
      title,
      message,
      type,
      "Document",
      document._id
    );

    // Emit real-time event
    if (io) {
      io.to(`user:${userId}`).emit("document.processed", {
        type: "document.processed",
        data: {
          documentId: document._id,
          fileName: document.originalFileName,
          status: document.status,
          summary: document.summaryShort,
        },
        timestamp: new Date().toISOString(),
      });
    }
  }

  /**
   * Emit question set generation completed
   * @param {string} userId - ID of user who requested generation
   * @param {Object} questionSet - Generated question set
   */
  async emitQuestionSetGenerated(userId, questionSet) {
    const io = this._getIO();
    
    const status = questionSet.status;
    const questionCount = questionSet.questions?.length || 0;
    const title = status === "Draft" || status === "Ready" ? "Tạo câu hỏi thành công" : "Tạo câu hỏi thất bại";
    const message = status === "Draft" || status === "Ready"
      ? `Đã tạo ${questionCount} câu hỏi cho "${questionSet.title}"`
      : `Không thể tạo câu hỏi cho "${questionSet.title}"`;
    const type = status === "Draft" || status === "Ready" ? "success" : "error";
    
    // Create persistent notification
    await this._createNotification(
      userId,
      title,
      message,
      type,
      "QuestionSet",
      questionSet._id
    );

    // Emit real-time event
    if (io) {
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
   * Emit revision requested notification to expert
   * @param {string} expertId - ID of expert who needs to review again
   * @param {Object} revisionData - Revision request data
   */
  async emitRevisionRequested(expertId, revisionData) {
    const io = this._getIO();
    
    const title = "Yêu cầu xem xét lại";
    const message = `Học viên yêu cầu bạn xem xét lại kết quả xét duyệt`;
    
    // Create persistent notification
    await this._createNotification(
      expertId,
      title,
      message,
      "warning",
      "ValidationRequest",
      revisionData.requestId
    );

    // Emit real-time event
    if (io) {
      io.to(`user:${expertId}`).emit("validation.revisionRequested", {
        type: "validation.revisionRequested",
        data: {
          requestId: revisionData.requestId,
          setId: revisionData.setId,
          learnerResponse: revisionData.learnerResponse,
        },
        timestamp: new Date().toISOString(),
      });
    }
  }

  /**
   * Emit commission earned notification to expert
   * @param {string} expertId - ID of expert
   * @param {Object} commission - Commission record
   */
  async emitCommissionEarned(expertId, commission) {
    const io = this._getIO();
    
    const amount = commission.amount || 0;
    const title = "Nhận hoa hồng";
    const message = `Bạn đã nhận ${amount.toLocaleString('vi-VN')} VNĐ hoa hồng từ xét duyệt`;
    
    // Create persistent notification
    await this._createNotification(
      expertId,
      title,
      message,
      "success",
      "Commission",
      commission._id
    );

    // Emit real-time event
    if (io) {
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
  }

  /**
   * Emit subscription status change
   * @param {string} userId - User ID
   * @param {Object} subscription - Subscription data
   */
  async emitSubscriptionUpdated(userId, subscription) {
    const io = this._getIO();
    
    const status = subscription.status;
    const planName = subscription.plan?.planName || "gói đăng ký";
    const title = status === "Active" ? "Gói đăng ký đã kích hoạt" : "Gói đăng ký đã hết hạn";
    const message = status === "Active"
      ? `Gói ${planName} của bạn đã được kích hoạt`
      : `Gói ${planName} của bạn đã hết hạn`;
    const type = status === "Active" ? "success" : "warning";
    
    // Create persistent notification
    await this._createNotification(
      userId,
      title,
      message,
      type,
      "Subscription",
      subscription._id
    );

    // Emit real-time event
    if (io) {
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
}

module.exports = new NotificationService();
