const Sentry = require("@sentry/node");
const { ProfilingIntegration } = require("@sentry/profiling-node");
const env = require("./env");

/**
 * Sentry Error Tracking Configuration
 * Captures and tracks errors in production
 */

let sentryInitialized = false;

/**
 * Initialize Sentry
 * @param {Object} app - Express app
 */
function initSentry(app) {
  // Only initialize in production or staging
  if (!env.SENTRY_DSN || env.NODE_ENV === "test") {
    return;
  }

  Sentry.init({
    dsn: env.SENTRY_DSN,
    environment: env.NODE_ENV,
    release: process.env.npm_package_version,

    // Performance Monitoring
    tracesSampleRate: env.NODE_ENV === "production" ? 0.1 : 1.0, // 10% in prod, 100% in dev

    // Profiling
    profilesSampleRate: env.NODE_ENV === "production" ? 0.1 : 1.0,
    integrations: [new ProfilingIntegration()],

    // Filter sensitive data
    beforeSend(event, _hint) {
      // Don't send errors in development
      if (env.NODE_ENV === "development") {
        return null;
      }

      // Remove sensitive headers
      if (event.request?.headers) {
        delete event.request.headers.authorization;
        delete event.request.headers.cookie;
      }

      // Remove sensitive query params
      if (event.request?.query_string) {
        const sanitized = event.request.query_string
          .replace(/token=[^&]+/g, "token=[REDACTED]")
          .replace(/password=[^&]+/g, "password=[REDACTED]");
        event.request.query_string = sanitized;
      }

      return event;
    },

    // Ignore certain errors
    ignoreErrors: [
      "ECONNRESET",
      "ECONNABORTED",
      "EPIPE",
      "ETIMEDOUT",
      "socket hang up",
      "Client network socket disconnected",
    ],
  });

  // Request handler must be the first middleware
  if (app) {
    app.use(Sentry.Handlers.requestHandler());
    app.use(Sentry.Handlers.tracingHandler());
  }

  sentryInitialized = true;
}

/**
 * Error handler middleware (must be after routes)
 * @param {Object} app - Express app
 */
function sentryErrorHandler(app) {
  if (!sentryInitialized) {
    return;
  }

  app.use(
    Sentry.Handlers.errorHandler({
      shouldHandleError(error) {
        // Capture 4xx and 5xx errors
        if (error.status >= 400) {
          return true;
        }
        return false;
      },
    })
  );
}

/**
 * Capture exception manually
 * @param {Error} error - Error to capture
 * @param {Object} context - Additional context
 */
function captureException(error, context = {}) {
  if (!sentryInitialized) {
    return;
  }

  Sentry.withScope((scope) => {
    // Add context
    if (context.user) {
      scope.setUser({
        id: context.user._id || context.user.id,
        email: context.user.email,
        role: context.user.role,
      });
    }

    if (context.tags) {
      Object.entries(context.tags).forEach(([key, value]) => {
        scope.setTag(key, value);
      });
    }

    if (context.extra) {
      scope.setExtras(context.extra);
    }

    Sentry.captureException(error);
  });
}

/**
 * Capture message manually
 * @param {string} message - Message to capture
 * @param {string} level - Severity level
 * @param {Object} context - Additional context
 */
function captureMessage(message, level = "info", context = {}) {
  if (!sentryInitialized) {
    return;
  }

  Sentry.withScope((scope) => {
    if (context.tags) {
      Object.entries(context.tags).forEach(([key, value]) => {
        scope.setTag(key, value);
      });
    }

    if (context.extra) {
      scope.setExtras(context.extra);
    }

    Sentry.captureMessage(message, level);
  });
}

/**
 * Add breadcrumb for debugging
 * @param {Object} breadcrumb - Breadcrumb data
 */
function addBreadcrumb(breadcrumb) {
  if (!sentryInitialized) {
    return;
  }

  Sentry.addBreadcrumb(breadcrumb);
}

/**
 * Set user context
 * @param {Object} user - User object
 */
function setUser(user) {
  if (!sentryInitialized || !user) {
    return;
  }

  Sentry.setUser({
    id: user._id || user.id,
    email: user.email,
    role: user.role,
  });
}

/**
 * Clear user context
 */
function clearUser() {
  if (!sentryInitialized) {
    return;
  }

  Sentry.setUser(null);
}

module.exports = {
  initSentry,
  sentryErrorHandler,
  captureException,
  captureMessage,
  addBreadcrumb,
  setUser,
  clearUser,
};
