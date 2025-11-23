const jwt = require("jsonwebtoken");
const { env } = require("../../src/config");

/**
 * Generate test JWT token
 * @param {Object} payload - Token payload
 * @param {string} payload.userId - User ID
 * @param {string} payload.role - User role (Learner, Expert, Admin)
 * @param {string} payload.email - User email
 * @param {Object} options - JWT options
 * @returns {string} JWT token
 */
function generateTestToken(payload, options = {}) {
  const defaultPayload = {
    userId: payload.userId || "507f1f77bcf86cd799439011",
    role: payload.role || "Learner",
    email: payload.email || "test@example.com",
  };

  return jwt.sign(
    defaultPayload,
    env.jwtSecret || "test-jwt-secret-key-for-testing-only",
    {
      expiresIn: options.expiresIn || "1h",
      ...options,
    }
  );
}

/**
 * Generate refresh token
 * @param {Object} payload - Token payload
 * @returns {string} Refresh token
 */
function generateTestRefreshToken(payload) {
  return jwt.sign(
    {
      userId: payload.userId || "507f1f77bcf86cd799439011",
      type: "refresh",
    },
    env.jwtRefreshSecret || "test-jwt-refresh-secret-key",
    { expiresIn: "7d" }
  );
}

/**
 * Create authorization header
 * @param {Object} payload - Token payload
 * @returns {Object} Headers object
 */
function authHeader(payload) {
  const token = generateTestToken(payload);
  return {
    Authorization: `Bearer ${token}`,
  };
}

/**
 * Mock authenticated request user
 * @param {Object} payload - User data
 * @returns {Object} Request user object
 */
function mockReqUser(payload = {}) {
  return {
    userId: payload.userId || "507f1f77bcf86cd799439011",
    role: payload.role || "Learner",
    email: payload.email || "test@example.com",
  };
}

module.exports = {
  generateTestToken,
  generateTestRefreshToken,
  authHeader,
  mockReqUser,
};
