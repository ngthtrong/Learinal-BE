/**
 * Global test setup
 * Runs once before all tests
 */

// Suppress console logs during tests (optional)
global.console = {
  ...console,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  // Keep error for debugging test failures
  error: console.error,
};

// Setup test environment variables
process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-jwt-secret-key-for-testing-only";
process.env.JWT_REFRESH_SECRET = "test-jwt-refresh-secret-key";
process.env.DB_MODE = "memory"; // Use in-memory DB for tests
process.env.MONGO_URI = "mongodb://localhost:27017";
process.env.MONGO_DB_NAME = "learinal-test";
process.env.REDIS_URL = "redis://localhost:6379";
process.env.PORT = "0"; // Random port for test server

// Mock external services by default
jest.mock("../src/adapters/emailClient");
jest.mock("../src/adapters/llmClient");
jest.mock("../src/adapters/storageClient");
jest.mock("../src/adapters/oauthClient");
jest.mock("../src/adapters/sepayClient");

// Increase timeout for integration tests
jest.setTimeout(10000);
