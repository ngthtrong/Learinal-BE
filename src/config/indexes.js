const logger = require("../utils/logger");

/**
 * MongoDB Indexes Configuration
 * Defines indexes for optimal query performance
 */

/**
 * Create all recommended indexes for the application
 * Should be run during app initialization or migration
 */
async function createIndexes() {
  const User = require("../models/user.model");
  const Subject = require("../models/subject.model");
  const Document = require("../models/document.model");
  const QuestionSet = require("../models/questionSet.model");
  const QuizAttempt = require("../models/quizAttempt.model");
  const ValidationRequest = require("../models/validationRequest.model");
  const CommissionRecord = require("../models/commissionRecord.model");
  const Notification = require("../models/notification.model");
  const UserSubscription = require("../models/userSubscription.model");

  try {
    logger.info("Creating MongoDB indexes...");

    // Users - email is already unique in schema
    await User.collection.createIndex(
      { email: 1 },
      { unique: true, background: true }
    );
    await User.collection.createIndex(
      { oauthProviderId: 1 },
      { background: true, sparse: true }
    );
    await User.collection.createIndex(
      { role: 1, status: 1 },
      { background: true }
    );
    await User.collection.createIndex(
      { createdAt: -1 },
      { background: true }
    );

    // Subjects - owner and creation time
    await Subject.collection.createIndex(
      { userId: 1, createdAt: -1 },
      { background: true }
    );
    await Subject.collection.createIndex(
      { userId: 1, subjectName: 1 },
      { background: true }
    );

    // Documents - owner, subject, status
    await Document.collection.createIndex(
      { uploadedBy: 1, createdAt: -1 },
      { background: true }
    );
    await Document.collection.createIndex(
      { subjectId: 1, status: 1 },
      { background: true }
    );
    await Document.collection.createIndex(
      { status: 1, createdAt: -1 },
      { background: true }
    );

    // Question Sets - owner, subject, status, sharing
    await QuestionSet.collection.createIndex(
      { userId: 1, createdAt: -1 },
      { background: true }
    );
    await QuestionSet.collection.createIndex(
      { subjectId: 1, status: 1 },
      { background: true }
    );
    await QuestionSet.collection.createIndex(
      { status: 1, isShared: 1 },
      { background: true }
    );
    await QuestionSet.collection.createIndex(
      { sharedUrl: 1 },
      { background: true, sparse: true, unique: true }
    );
    // Full-text search on title
    await QuestionSet.collection.createIndex(
      { title: "text" },
      { background: true }
    );

    // Quiz Attempts - user, question set, completion
    await QuizAttempt.collection.createIndex(
      { userId: 1, createdAt: -1 },
      { background: true }
    );
    await QuizAttempt.collection.createIndex(
      { setId: 1, userId: 1 },
      { background: true }
    );
    await QuizAttempt.collection.createIndex(
      { isCompleted: 1, startTime: -1 },
      { background: true }
    );

    // Validation Requests - expert, status, set
    await ValidationRequest.collection.createIndex(
      { expertId: 1, status: 1 },
      { background: true }
    );
    await ValidationRequest.collection.createIndex(
      { setId: 1, status: 1 },
      { background: true }
    );
    await ValidationRequest.collection.createIndex(
      { status: 1, createdAt: -1 },
      { background: true }
    );
    // Ensure only one open request per set (already in schema, but double-check)
    await ValidationRequest.collection.createIndex(
      { setId: 1 },
      {
        unique: true,
        partialFilterExpression: {
          status: { $in: ["PendingAssignment", "Assigned"] },
        },
        background: true,
      }
    );

    // Commission Records - expert, status, date
    await CommissionRecord.collection.createIndex(
      { expertId: 1, status: 1 },
      { background: true }
    );
    await CommissionRecord.collection.createIndex(
      { expertId: 1, transactionDate: -1 },
      { background: true }
    );
    await CommissionRecord.collection.createIndex(
      { status: 1, transactionDate: -1 },
      { background: true }
    );

    // Notifications - user, read status, creation time
    await Notification.collection.createIndex(
      { userId: 1, isRead: 1, createdAt: -1 },
      { background: true }
    );
    await Notification.collection.createIndex(
      { userId: 1, createdAt: -1 },
      { background: true }
    );
    // TTL index for auto-deletion after 90 days
    await Notification.collection.createIndex(
      { createdAt: 1 },
      { expireAfterSeconds: 90 * 24 * 60 * 60, background: true }
    );

    // User Subscriptions - user, status, renewal
    await UserSubscription.collection.createIndex(
      { userId: 1, status: 1 },
      { background: true }
    );
    await UserSubscription.collection.createIndex(
      { userId: 1, renewalDate: 1 },
      { background: true }
    );
    await UserSubscription.collection.createIndex(
      { status: 1, renewalDate: 1 },
      { background: true }
    );
    // Find subscriptions expiring soon
    await UserSubscription.collection.createIndex(
      { renewalDate: 1, status: 1 },
      { background: true }
    );

    logger.info("MongoDB indexes created successfully");
  } catch (error) {
    logger.error({ err: error }, "Failed to create MongoDB indexes");
    throw error;
  }
}

/**
 * List all indexes for debugging
 */
async function listIndexes() {
  const models = [
    "User",
    "Subject",
    "Document",
    "QuestionSet",
    "QuizAttempt",
    "ValidationRequest",
    "CommissionRecord",
    "Notification",
    "UserSubscription",
  ];

  const indexes = {};

  for (const modelName of models) {
    try {
      const Model = require(`../models/${modelName.charAt(0).toLowerCase() + modelName.slice(1)}.model`);
      const modelIndexes = await Model.collection.getIndexes();
      indexes[modelName] = modelIndexes;
    } catch (error) {
      logger.error({ model: modelName, err: error }, "Failed to list indexes");
    }
  }

  return indexes;
}

module.exports = {
  createIndexes,
  listIndexes,
};
