/**
 * Initialize and inject services into app.locals
 * This makes services available throughout the application
 */

const { createRepositories } = require('./repositories');
const SubscriptionPlansService = require('./services/subscriptionPlans.service');
const UserSubscriptionsService = require('./services/userSubscriptions.service');

function initializeServices(app) {
  // Create all repositories
  const repositories = createRepositories();

  // Inject repositories into app.locals (for direct access)
  Object.assign(app.locals, repositories);

  // Create services with dependency injection
  const subscriptionPlansService = new SubscriptionPlansService({
    subscriptionPlansRepository: repositories.subscriptionPlansRepository,
  });

  const userSubscriptionsService = new UserSubscriptionsService({
    userSubscriptionsRepository: repositories.userSubscriptionsRepository,
    subscriptionPlansRepository: repositories.subscriptionPlansRepository,
  });

  // Inject services into app.locals
  app.locals.subscriptionPlansService = subscriptionPlansService;
  app.locals.userSubscriptionsService = userSubscriptionsService;
}

module.exports = { initializeServices };
