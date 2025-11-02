const mongoose = require("mongoose");
const User = require("../../src/models/user.model");
const Subject = require("../../src/models/subject.model");
const Document = require("../../src/models/document.model");
const QuestionSet = require("../../src/models/questionSet.model");
const SubscriptionPlan = require("../../src/models/subscriptionPlan.model");
const UserSubscription = require("../../src/models/userSubscription.model");

/**
 * Factory functions to create test data
 */

/**
 * Create test user
 * @param {Object} overrides - Override default values
 * @returns {Promise<Object>} Created user
 */
async function createTestUser(overrides = {}) {
  const defaults = {
    email: `test-${Date.now()}@example.com`,
    displayName: "Test User",
    role: "Learner",
    status: "Active",
    profilePictureUrl: "https://example.com/avatar.jpg",
    oauthProvider: "google",
    oauthProviderId: `google-${Date.now()}`,
  };

  const user = new User({ ...defaults, ...overrides });
  return await user.save();
}

/**
 * Create test subject
 * @param {string} userId - Owner user ID
 * @param {Object} overrides - Override default values
 * @returns {Promise<Object>} Created subject
 */
async function createTestSubject(userId, overrides = {}) {
  const defaults = {
    userId: new mongoose.Types.ObjectId(userId),
    subjectName: `Test Subject ${Date.now()}`,
    description: "Test subject description",
  };

  const subject = new Subject({ ...defaults, ...overrides });
  return await subject.save();
}

/**
 * Create test document
 * @param {string} subjectId - Subject ID
 * @param {string} ownerId - Owner user ID
 * @param {Object} overrides - Override default values
 * @returns {Promise<Object>} Created document
 */
async function createTestDocument(subjectId, ownerId, overrides = {}) {
  const defaults = {
    subjectId: new mongoose.Types.ObjectId(subjectId),
    uploadedBy: new mongoose.Types.ObjectId(ownerId),
    originalFileName: `test-doc-${Date.now()}.pdf`,
    fileType: ".pdf",
    fileSize: 1.5,
    storagePath: null,
    extractedText: "Sample extracted text for testing",
    status: "Completed",
  };

  const document = new Document({ ...defaults, ...overrides });
  return await document.save();
}

/**
 * Create test question set
 * @param {string} userId - Owner user ID
 * @param {string} subjectId - Subject ID
 * @param {Object} overrides - Override default values
 * @returns {Promise<Object>} Created question set
 */
async function createTestQuestionSet(userId, subjectId, overrides = {}) {
  const defaults = {
    userId: new mongoose.Types.ObjectId(userId),
    subjectId: new mongoose.Types.ObjectId(subjectId),
    title: `Test Question Set ${Date.now()}`,
    status: "Draft",
    isShared: false,
    questions: [
      {
        questionText: "What is 2+2?",
        options: ["3", "4", "5", "6"],
        correctAnswerIndex: 1,
        difficultyLevel: "Biết",
        explanation: "Basic arithmetic",
      },
    ],
  };

  const questionSet = new QuestionSet({ ...defaults, ...overrides });
  return await questionSet.save();
}

/**
 * Create test subscription plan
 * @param {Object} overrides - Override default values
 * @returns {Promise<Object>} Created subscription plan
 */
async function createTestSubscriptionPlan(overrides = {}) {
  const defaults = {
    planName: `Test Plan ${Date.now()}`,
    description: "Test subscription plan",
    price: 99000,
    billingCycle: "Monthly",
    entitlements: {
      maxSubjects: 10,
      maxDocumentsPerSubject: 50,
      maxQuestionSetsPerSubject: 20,
      maxQuestionsPerSet: 100,
      canShareQuestionSets: true,
      canExportQuestionSets: true,
      exportLimitPerMonth: 50,
    },
    isActive: true,
  };

  const plan = new SubscriptionPlan({ ...defaults, ...overrides });
  return await plan.save();
}

/**
 * Create test user subscription
 * @param {string} userId - User ID
 * @param {string} planId - Plan ID
 * @param {Object} overrides - Override default values
 * @returns {Promise<Object>} Created user subscription
 */
async function createTestUserSubscription(userId, planId, overrides = {}) {
  const now = new Date();
  const renewalDate = new Date(now);
  renewalDate.setMonth(renewalDate.getMonth() + 1);

  const defaults = {
    userId: new mongoose.Types.ObjectId(userId),
    subscriptionPlanId: new mongoose.Types.ObjectId(planId),
    status: "Active",
    startDate: now,
    renewalDate: renewalDate,
    entitlementsSnapshot: {
      maxSubjects: 10,
      maxDocumentsPerSubject: 50,
      maxQuestionSetsPerSubject: 20,
      maxQuestionsPerSet: 100,
      canShareQuestionSets: true,
      canExportQuestionSets: true,
      exportLimitPerMonth: 50,
    },
  };

  const subscription = new UserSubscription({ ...defaults, ...overrides });
  return await subscription.save();
}

module.exports = {
  createTestUser,
  createTestSubject,
  createTestDocument,
  createTestQuestionSet,
  createTestSubscriptionPlan,
  createTestUserSubscription,
};
