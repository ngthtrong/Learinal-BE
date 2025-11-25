const UsersRepository = require("./users.repository");
const SubjectsRepository = require("./subjects.repository");
const DocumentsRepository = require("./documents.repository");
const QuestionSetsRepository = require("./questionSets.repository");
const QuizAttemptsRepository = require("./quizAttempts.repository");
const ValidationRequestsRepository = require("./validationRequests.repository");
const CommissionRecordsRepository = require("./commissionRecords.repository");
const SubscriptionPlansRepository = require("./subscriptionPlans.repository");
const UserSubscriptionsRepository = require("./userSubscriptions.repository");
const NotificationsRepository = require("./notifications.repository");
const UsageTrackingRepository = require("./usageTracking.repository");

function createRepositories() {
  return {
    usersRepository: new UsersRepository(),
    subjectsRepository: new SubjectsRepository(),
    documentsRepository: new DocumentsRepository(),
    questionSetsRepository: new QuestionSetsRepository(),
    quizAttemptsRepository: new QuizAttemptsRepository(),
    validationRequestsRepository: new ValidationRequestsRepository(),
    commissionRecordsRepository: new CommissionRecordsRepository(),
    subscriptionPlansRepository: new SubscriptionPlansRepository(),
    userSubscriptionsRepository: new UserSubscriptionsRepository(),
    notificationsRepository: new NotificationsRepository(),
    usageTrackingRepository: new UsageTrackingRepository(),
  };
}

module.exports = {
  UsersRepository,
  SubjectsRepository,
  DocumentsRepository,
  QuestionSetsRepository,
  QuizAttemptsRepository,
  ValidationRequestsRepository,
  CommissionRecordsRepository,
  SubscriptionPlansRepository,
  UserSubscriptionsRepository,
  NotificationsRepository,
  UsageTrackingRepository,
  createRepositories,
};
