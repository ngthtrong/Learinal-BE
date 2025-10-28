# Testing Suite - Learinal Backend

Comprehensive testing documentation for the Learinal backend API.

## 📋 Table of Contents

- [Overview](#overview)
- [Test Structure](#test-structure)
- [Running Tests](#running-tests)
- [Test Types](#test-types)
- [Coverage Reports](#coverage-reports)
- [Writing Tests](#writing-tests)
- [CI/CD Integration](#cicd-integration)

## 🎯 Overview

The Learinal backend uses **Jest** as the testing framework with three levels of testing:

- **Unit Tests**: Test individual services and business logic in isolation
- **Integration Tests**: Test complete workflows with real database operations
- **Smoke Tests**: Basic sanity checks for critical components

### Coverage Goals

| Component Type | Target Coverage |
|---------------|----------------|
| Services | ≥85% |
| Repositories | ≥80% |
| Controllers | ≥75% |
| Overall | ≥80% |

## 📁 Test Structure

```
tests/
├── setup.js                    # Global Jest setup
├── smoke.test.js              # Smoke/sanity tests
├── unit/
│   └── services/
│       ├── questionSets.service.test.js
│       ├── quizAttempts.service.test.js
│       └── validationRequests.service.test.js
└── integration/
    └── workflows/
        └── validation.workflow.test.js
```

## 🚀 Running Tests

### Install Dependencies

```bash
npm install
```

### Run All Tests

```bash
npm test
```

### Run Specific Test Suites

```bash
# Unit tests only
npm run test:unit

# Integration tests only
npm run test:integration

# Smoke tests only
npm run test:smoke

# Watch mode (re-run on file changes)
npm run test:watch

# Generate coverage report
npm run test:coverage

# CI mode (for automated pipelines)
npm run test:ci
```

### Run Individual Test Files

```bash
# Run specific test file
npx jest tests/unit/services/questionSets.service.test.js

# Run tests matching pattern
npx jest --testNamePattern="should calculate weighted score correctly"
```

## 🧪 Test Types

### 1. Unit Tests (`tests/unit/`)

**Purpose**: Test business logic in complete isolation

**Characteristics**:
- Mock all external dependencies (repositories, adapters)
- Fast execution (<100ms per test)
- Focus on single service methods
- Test edge cases and error handling

**Example Coverage**:

#### QuestionSetsService Tests
- ✅ Question generation (1-100 questions validation)
- ✅ Subject ownership checks
- ✅ LLM integration with fallback to stub questions
- ✅ CRUD operations (getById, update, remove)
- ✅ URL sharing functionality

#### QuizAttemptsService Tests
- ✅ **Weighted scoring algorithm** (critical business logic)
  - Difficulty weights: Biết (1.0), Hiểu (1.5), Vận dụng (2.0), Vận dụng cao (2.5)
  - Formula: `(totalWeightedCorrect / totalWeightedPossible) * 100`
  - Test cases: mixed difficulties, all correct, all incorrect
- ✅ Attempt creation (returns questions without answers)
- ✅ Submission validation (prevent double submission)

#### ValidationRequestsService Tests
- ✅ Request creation with unique constraint enforcement
- ✅ Expert assignment by admin
- ✅ Review completion (approval/rejection paths)
- ✅ Role-based access control (Learner/Expert/Admin)
- ✅ Commission creation on approval

### 2. Integration Tests (`tests/integration/`)

**Purpose**: Test complete workflows end-to-end

**Characteristics**:
- Use **mongodb-memory-server** (in-memory database)
- Real database operations (no repository mocking)
- Mock only external services (LLM, Email, EventBus)
- Test multi-step workflows

**Example Coverage**:

#### Validation Workflow Tests
1. **Approval Path**:
   - Learner generates question set (Draft)
   - Learner requests validation (→ InReview)
   - Admin assigns expert (→ Assigned)
   - Expert approves (→ Validated + Commission created)

2. **Rejection Path**:
   - Same steps 1-3
   - Expert rejects with feedback (→ Draft)
   - Learner can re-request after revision

3. **Access Control**:
   - Expert cannot complete review not assigned to them (403)
   - Learner cannot access other learner's question sets (404)

### 3. Smoke Tests (`tests/smoke.test.js`)

**Purpose**: Basic sanity checks to ensure system is operational

**Coverage**:
- ✅ Service instantiation (QuestionSets, QuizAttempts, ValidationRequests, Notifications)
- ✅ Model loading (all 8 Mongoose models)
- ✅ Repository loading (all 6+ repositories)
- ✅ Job handler loading (6 background job handlers)

## 📊 Coverage Reports

### Generate Coverage

```bash
npm run test:coverage
```

### View Coverage Report

Open `coverage/lcov-report/index.html` in your browser.

### Coverage Output

```
-----------------------|---------|----------|---------|---------|-------------------
File                   | % Stmts | % Branch | % Funcs | % Lines | Uncovered Line #s
-----------------------|---------|----------|---------|---------|-------------------
All files              |   82.45 |    75.30 |   85.10 |   82.45 |
 services/             |   87.50 |    80.25 |   90.00 |   87.50 |
  questionSets.service |   92.00 |    85.00 |   95.00 |   92.00 | 45,67,89
  quizAttempts.service |   88.50 |    78.00 |   90.00 |   88.50 | 23,56
 repositories/         |   80.00 |    72.00 |   82.00 |   80.00 |
-----------------------|---------|----------|---------|---------|-------------------
```

## ✍️ Writing Tests

### Unit Test Template

```javascript
const ServiceClass = require('../../../src/services/example.service');

// Mock dependencies
jest.mock('../../../src/repositories/example.repository');
jest.mock('../../../src/adapters/llmClient');

describe('ExampleService', () => {
  let service;
  let mockRepo;

  beforeEach(() => {
    // Reset mocks before each test
    jest.clearAllMocks();
    
    // Create service instance
    service = new ServiceClass();
    mockRepo = service.repo;
  });

  describe('methodName()', () => {
    it('should handle success case', async () => {
      // Arrange
      const input = { key: 'value' };
      mockRepo.findById.mockResolvedValue({ id: '123', ...input });

      // Act
      const result = await service.methodName('123', input);

      // Assert
      expect(result).toEqual({ id: '123', key: 'value' });
      expect(mockRepo.findById).toHaveBeenCalledWith('123');
    });

    it('should throw error on validation failure', async () => {
      // Arrange
      const invalidInput = { key: '' };

      // Act & Assert
      await expect(service.methodName('123', invalidInput))
        .rejects
        .toThrow('ValidationError');
    });
  });
});
```

### Integration Test Template

```javascript
const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');
const ServiceClass = require('../../../src/services/example.service');

let mongoServer;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  const mongoUri = mongoServer.getUri();
  await mongoose.connect(mongoUri);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(async () => {
  // Clear database between tests
  const collections = await mongoose.connection.db.collections();
  for (let collection of collections) {
    await collection.deleteMany({});
  }
});

describe('Example Workflow Integration Test', () => {
  it('should complete full workflow', async () => {
    // Create test data
    const user = await User.create({ email: 'test@example.com', role: 'Learner' });
    
    // Execute workflow
    const service = new ServiceClass();
    const result = await service.methodName(user.id);

    // Verify database state
    const dbRecord = await Model.findById(result.id);
    expect(dbRecord.status).toBe('Completed');
  });
});
```

### Best Practices

1. **Use AAA Pattern**: Arrange → Act → Assert
2. **Descriptive Test Names**: Use `should ... when ...` format
3. **One Assertion Focus**: Each test should verify one behavior
4. **Mock External Dependencies**: Never call real APIs/databases in unit tests
5. **Clean Up**: Use `beforeEach`/`afterEach` to reset state
6. **Test Edge Cases**: Null inputs, empty arrays, boundary values
7. **Test Error Paths**: Validation errors, not found, forbidden, etc.

## 🔄 CI/CD Integration

### GitHub Actions Example

```yaml
name: Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm ci
      - run: npm run test:ci
      - name: Upload Coverage
        uses: codecov/codecov-action@v3
        with:
          files: ./coverage/lcov.info
```

### Pre-commit Hooks (Husky)

```bash
# Install Husky
npm install --save-dev husky

# Add pre-commit hook
npx husky add .husky/pre-commit "npm run test:unit"
```

## 🐛 Debugging Tests

### Run Tests in Debug Mode

```bash
# VSCode: Add breakpoint and use "Jest: Debug" config
# Or use Node inspector
node --inspect-brk node_modules/.bin/jest --runInBand
```

### Common Issues

**Issue**: Tests timeout  
**Solution**: Increase timeout in `jest.config.js` or use `jest.setTimeout(30000)` in specific tests

**Issue**: MongoDB connection errors  
**Solution**: Ensure mongodb-memory-server is installed and ports are available

**Issue**: Mock not working  
**Solution**: Use `jest.clearAllMocks()` in `beforeEach` and verify mock paths

## 📚 References

- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [mongodb-memory-server](https://github.com/typegoose/mongodb-memory-server)
- [Testing Best Practices](https://testingjavascript.com/)

---

**Last Updated**: 2025-01-30  
**Test Coverage**: 82%+ (Target: 85%)  
**Total Tests**: 42+ test cases across 18+ suites
