const env = require("./env");

/**
 * Enhanced Helmet Configuration for Security Headers
 * Implements OWASP recommendations
 */

function getHelmetOptions() {
  const isDevelopment = env.nodeEnv !== "production";

  return {
    // Content Security Policy
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: isDevelopment
          ? ["'self'", "'unsafe-inline'"] // Allow inline scripts in dev for testing
          : ["'self'"],
        styleSrc: isDevelopment
          ? ["'self'", "'unsafe-inline'"] // Allow inline styles in dev
          : ["'self'"],
        imgSrc: ["'self'", "data:", "https:"], // Allow data URIs and HTTPS images
        fontSrc: ["'self'", "https:", "data:"],
        connectSrc: ["'self'"], // API calls only to same origin
        frameSrc: ["'none'"], // No iframes
        objectSrc: ["'none'"], // No plugins
        mediaSrc: ["'self'"],
        workerSrc: ["'self'"],
        formAction: ["'self'"],
        upgradeInsecureRequests: env.nodeEnv === "production" ? [] : null,
      },
    },

    // Cross-Origin Embedder Policy
    crossOriginEmbedderPolicy: false, // Can cause issues with CDNs, set to false for now

    // Cross-Origin Opener Policy
    crossOriginOpenerPolicy: { policy: "same-origin" },

    // Cross-Origin Resource Policy
    crossOriginResourcePolicy: { policy: "same-origin" },

    // DNS Prefetch Control
    dnsPrefetchControl: { allow: false },

    // Expect-CT (deprecated but still useful)
    expectCt: {
      enforce: true,
      maxAge: 86400, // 24 hours
    },

    // Frameguard (X-Frame-Options)
    frameguard: { action: "deny" },

    // Hide X-Powered-By
    hidePoweredBy: true,

    // HTTP Strict Transport Security
    hsts: {
      maxAge: 31536000, // 1 year
      includeSubDomains: true,
      preload: true,
    },

    // IE No Open
    ieNoOpen: true,

    // X-Content-Type-Options
    noSniff: true,

    // Origin Agent Cluster
    originAgentCluster: true,

    // Permitted Cross-Domain Policies
    permittedCrossDomainPolicies: { permittedPolicies: "none" },

    // Referrer Policy
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },

    // X-XSS-Protection (deprecated but still useful for older browsers)
    xssFilter: true,
  };
}

module.exports = getHelmetOptions;
