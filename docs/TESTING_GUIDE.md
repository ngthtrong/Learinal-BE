# Testing Guide - Learinal Backend

## Overview

This document describes the testing infrastructure for Learinal backend API.

## Testing Stack

- **Test Framework**: Jest 29.x
- **HTTP Testing**: Supertest
- **In-Memory Database**: MongoDB Memory Server
- **Coverage Target**: 60% (branches, functions, lines, statements)

## Test Structure

```
tests/
├── setup.js                    # Global test setup
├── helpers/
│   ├── db.js                  # Database utilities
│   ├── auth.js                # Authentication helpers
│   └── factories.js           # Test data factories
├── unit/                      # Unit tests
│   ├── auth.service.test.js
│   └── subscription.service.test.js
└── integration/               # Integration tests (API endpoints)
    ├── auth.api.test.js
    └── subjects.api.test.js
```

## Running Tests

```bash
# Run all tests with coverage
npm test

# Watch mode (for development)
npm run test:watch

# Unit tests only
npm run test:unit

# Integration tests only
npm run test:integration

# CI mode (optimized for CI/CD)
npm run test:ci
```

## Writing Tests

### Unit Tests

Unit tests should test individual service/utility functions in isolation:

```javascript
const { connectTestDB, closeTestDB, clearTestDB } = require("../helpers/db");
const { createTestUser } = require("../helpers/factories");

describe("AuthService", () => {
  beforeAll(async () => {
    await connectTestDB();
  });

  afterAll(async () => {
    await closeTestDB();
  });

  beforeEach(async () => {
    await clearTestDB();
  });

  it("should create new user on first OAuth login", async () => {
    // Test implementation
  });
});
```

### Integration Tests

Integration tests should test HTTP endpoints end-to-end:

```javascript
const request = require("supertest");
const app = require("../../src/app");
const { authHeader } = require("../helpers/auth");

describe("Subjects API", () => {
  let user;
  let authHeaders;

  beforeEach(async () => {
    await clearTestDB();
    user = await createTestUser();
    authHeaders = authHeader({ userId: user._id.toString() });
  });

  it("should create new subject", async () => {
    const response = await request(app)
      .post("/api/v1/subjects")
      .set(authHeaders)
      .send({ subjectName: "Math" })
      .expect(201);

    expect(response.body).toHaveProperty("id");
  });
});
```

## Test Helpers

### Database (`tests/helpers/db.js`)

- `connectTestDB()` - Connect to in-memory MongoDB
- `closeTestDB()` - Close connection and stop server
- `clearTestDB()` - Clear all collections

### Authentication (`tests/helpers/auth.js`)

- `generateTestToken(payload)` - Generate JWT access token
- `generateTestRefreshToken(payload)` - Generate refresh token
- `authHeader(payload)` - Create Authorization header
- `mockReqUser(payload)` - Mock request.user object

### Factories (`tests/helpers/factories.js`)

- `createTestUser(overrides)` - Create user in DB
- `createTestSubject(userId, overrides)` - Create subject
- `createTestDocument(subjectId, ownerId, overrides)` - Create document
- `createTestQuestionSet(userId, subjectId, overrides)` - Create question set
- `createTestSubscriptionPlan(overrides)` - Create subscription plan
- `createTestUserSubscription(userId, planId, overrides)` - Create user subscription

## Best Practices

### 1. Isolation

- Each test should be independent
- Use `beforeEach` to reset state
- Clear database between tests

### 2. Factories

- Use factory functions to create test data
- Override only necessary fields
- Keep default values realistic

```javascript
const user = await createTestUser({ email: "custom@example.com" });
```

### 3. Assertions

- Use specific matchers (`toMatchObject`, `toHaveProperty`)
- Test both success and error cases
- Verify error codes and messages

```javascript
expect(response.body.code).toBe("ValidationError");
expect(response.body.message).toMatch(/required/i);
```

### 4. Mocking External Services

External adapters are automatically mocked in `tests/setup.js`:

```javascript
jest.mock("../../src/adapters/emailClient");
jest.mock("../../src/adapters/llmClient");
```

Override mock behavior in specific tests:

```javascript
const emailClient = require("../../src/adapters/emailClient");

emailClient.sendEmail.mockResolvedValue({ messageId: "123" });
```

### 5. Coverage

- Aim for 60%+ coverage on critical paths
- Focus on business logic and edge cases
- Don't test trivial getters/setters

## Coverage Report

After running tests, open `coverage/lcov-report/index.html` in browser:

```bash
npm test
# Open coverage/lcov-report/index.html
```

## Continuous Integration

Tests run automatically on CI using:

```bash
npm run test:ci
```

This command:
- Runs in CI mode (no watch)
- Limits workers to 2 (performance)
- Generates coverage report
- Fails if coverage below threshold

## Troubleshooting

### MongoDB Memory Server Issues

If you see "Unable to download MongoDB binaries":

```bash
# Set download URL manually
export MONGOMS_DOWNLOAD_URL=https://fastdl.mongodb.org/linux/mongodb-linux-x86_64-ubuntu2204-7.0.0.tgz
npm test
```

### Port Already in Use

Tests use random ports (`PORT=0`). If issues persist:

```bash
# Kill processes on port 3000
npx kill-port 3000
```

### Jest Timeout

For slow tests, increase timeout:

```javascript
jest.setTimeout(30000); // 30 seconds
```

## Next Steps

- [ ] Add tests for DocumentService
- [ ] Add tests for QuestionSetService
- [ ] Add tests for Payment webhooks
- [ ] Add E2E tests with real MongoDB
- [ ] Add load testing with Artillery
