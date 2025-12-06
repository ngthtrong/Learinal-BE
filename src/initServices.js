/**
 * Initialize and inject services into app.locals
 * This makes services available throughout the application
 */

const { createRepositories } = require('./repositories');
const SubscriptionPlansService = require('./services/subscriptionPlans.service');
const UserSubscriptionsService = require('./services/userSubscriptions.service');
const AddonPackagesService = require('./services/addonPackages.service');
const LLMClient = require('./adapters/llmClient');
const { llm } = require('./config');

function initializeServices(app) {
  // Create all repositories
  const repositories = createRepositories();

  // Inject repositories into app.locals (for direct access)
  Object.assign(app.locals, repositories);

  // Create LLM client for AI operations
  const llmClient = new LLMClient(llm);
  app.locals.llmClient = llmClient;

  // Create services with dependency injection
  const subscriptionPlansService = new SubscriptionPlansService({
    subscriptionPlansRepository: repositories.subscriptionPlansRepository,
    subscriptionPlanAuditLogsRepository: repositories.subscriptionPlanAuditLogsRepository,
  });

  const userSubscriptionsService = new UserSubscriptionsService({
    userSubscriptionsRepository: repositories.userSubscriptionsRepository,
    subscriptionPlansRepository: repositories.subscriptionPlansRepository,
  });

  const addonPackagesService = new AddonPackagesService({
    addonPackagesRepository: repositories.addonPackagesRepository,
    userAddonPurchasesRepository: repositories.userAddonPurchasesRepository,
    usersRepository: repositories.usersRepository,
    userSubscriptionsRepository: repositories.userSubscriptionsRepository,
  });

  // Inject services into app.locals
  app.locals.subscriptionPlansService = subscriptionPlansService;
  app.locals.userSubscriptionsService = userSubscriptionsService;
  app.locals.addonPackagesService = addonPackagesService;
}

module.exports = { initializeServices };
