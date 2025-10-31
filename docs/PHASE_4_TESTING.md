# GIAI ĐOẠN 4: Testing & Quality Assurance

**Thời gian:** 2 tuần  
**Mục tiêu:** Đạt test coverage ≥ 85% và đảm bảo quality gates

---

## Week 8: Test Implementation

### 8.1. Testing Setup

#### A. Test Framework & Tools

```json
// 🔴 CẦN THÊM: package.json (devDependencies)
{
  "devDependencies": {
    "jest": "^29.7.0",
    "@types/jest": "^29.5.0",
    "supertest": "^6.3.3",
    "mongodb-memory-server": "^9.1.6",
    "nock": "^13.5.0",
    "faker": "^6.6.6",
    "@faker-js/faker": "^8.4.0"
  },
  "scripts": {
    "test": "jest --coverage",
    "test:watch": "jest --watch",
    "test:unit": "jest --testPathPattern=tests/unit",
    "test:integration": "jest --testPathPattern=tests/integration",
    "test:e2e": "jest --testPathPattern=tests/e2e",
    "test:ci": "jest --ci --coverage --maxWorkers=2"
  }
}
```

#### B. Jest Configuration

```javascript
// 🔴 CẦN THÊM: jest.config.js

module.exports = {
  testEnvironment: 'node',
  coverageDirectory: 'coverage',
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/server.js', // Entry point
    '!src/worker.js', // Worker entry point
    '!src/**/*.test.js',
    '!src/**/*.spec.js',
  ],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 85,
      lines: 85,
      statements: 85,
    },
  },
  testMatch: [
    '**/tests/**/*.test.js',
    '**/tests/**/*.spec.js',
  ],
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
  testTimeout: 10000, // 10 seconds
  verbose: true,
};
```

#### C. Test Setup

```javascript
// 🔴 CẦN THÊM: tests/setup.js

const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');

let mongoServer;

// Setup before all tests
beforeAll(async () => {
  // Start in-memory MongoDB
  mongoServer = await MongoMemoryServer.create();
  const mongoUri = mongoServer.getUri();

  // Connect mongoose
  await mongoose.connect(mongoUri, {
    maxPoolSize: 10,
  });
});

// Cleanup after all tests
afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

// Clear database between tests
afterEach(async () => {
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    await collections[key].deleteMany({});
  }
});
```

```javascript
// 🔴 CẦN THÊM: tests/helpers/fixtures.js

const { faker } = require('@faker-js/faker');
const bcrypt = require('bcryptjs');

class Fixtures {
  static createUser(overrides = {}) {
    return {
      fullName: faker.person.fullName(),
      email: faker.internet.email().toLowerCase(),
      hashedPassword: bcrypt.hashSync('Password123!', 10),
      role: 'Learner',
      status: 'Active',
      subscriptionStatus: 'None',
      ...overrides,
    };
  }

  static createSubject(userId, overrides = {}) {
    return {
      userId,
      subjectName: faker.lorem.words(3),
      description: faker.lorem.sentence(),
      tableOfContents: [],
      summary: null,
      ...overrides,
    };
  }

  static createDocument(subjectId, ownerId, overrides = {}) {
    return {
      subjectId,
      ownerId,
      originalFileName: faker.system.fileName(),
      fileType: '.pdf',
      fileSize: faker.number.float({ min: 0.1, max: 20, precision: 0.01 }),
      storagePath: `/uploads/${faker.string.uuid()}.pdf`,
      extractedText: faker.lorem.paragraphs(10),
      summaryShort: faker.lorem.paragraph(),
      summaryFull: faker.lorem.paragraphs(3),
      status: 'Completed',
      uploadedAt: new Date(),
      ...overrides,
    };
  }

  static createQuestion(overrides = {}) {
    return {
      questionId: faker.string.uuid(),
      questionText: faker.lorem.sentence() + '?',
      options: [
        faker.lorem.words(3),
        faker.lorem.words(3),
        faker.lorem.words(3),
        faker.lorem.words(3),
      ],
      correctAnswerIndex: faker.number.int({ min: 0, max: 3 }),
      explanation: faker.lorem.sentence(),
      difficultyLevel: faker.helpers.arrayElement(['Biết', 'Hiểu', 'Vận dụng', 'Vận dụng cao']),
      ...overrides,
    };
  }

  static createQuestionSet(userId, subjectId, overrides = {}) {
    const numQuestions = overrides.numQuestions || 10;
    const questions = Array.from({ length: numQuestions }, () => this.createQuestion());

    return {
      userId,
      subjectId,
      title: faker.lorem.words(5),
      status: 'Private',
      isShared: false,
      sharedUrl: null,
      questions,
      ...overrides,
    };
  }

  static createQuizAttempt(userId, setId, overrides = {}) {
    return {
      userId,
      setId,
      userAnswers: [],
      score: 0,
      isCompleted: false,
      startTime: new Date(),
      endTime: null,
      ...overrides,
    };
  }

  static createValidationRequest(setId, learnerId, overrides = {}) {
    return {
      setId,
      learnerId,
      requesterId: learnerId,
      status: 'PendingAssignment',
      requestTime: new Date(),
      expertId: null,
      adminId: null,
      assignedTime: null,
      completionTime: null,
      decision: null,
      feedback: null,
      ...overrides,
    };
  }
}

module.exports = Fixtures;
```

---

### 8.2. Unit Tests

#### A. Repository Tests

```javascript
// 🔴 CẦN THÊM: tests/unit/repositories/users.repository.test.js

const UsersRepository = require('../../../src/repositories/users.repository');
const User = require('../../../src/models/user.model');
const Fixtures = require('../../helpers/fixtures');

describe('UsersRepository', () => {
  describe('create', () => {
    it('should create a user', async () => {
      const userData = Fixtures.createUser();
      const user = await UsersRepository.create(userData);

      expect(user).toBeDefined();
      expect(user.id).toBeDefined();
      expect(user.email).toBe(userData.email);
      expect(user.role).toBe(userData.role);
    });

    it('should throw error for duplicate email', async () => {
      const userData = Fixtures.createUser({ email: 'test@example.com' });
      await UsersRepository.create(userData);

      await expect(
        UsersRepository.create({ ...userData })
      ).rejects.toThrow();
    });
  });

  describe('findByEmail', () => {
    it('should find user by email', async () => {
      const userData = Fixtures.createUser({ email: 'find@example.com' });
      await UsersRepository.create(userData);

      const user = await UsersRepository.findByEmail('find@example.com');
      expect(user).toBeDefined();
      expect(user.email).toBe('find@example.com');
    });

    it('should return null for non-existent email', async () => {
      const user = await UsersRepository.findByEmail('nonexistent@example.com');
      expect(user).toBeNull();
    });
  });

  describe('update', () => {
    it('should update user fields', async () => {
      const userData = Fixtures.createUser();
      const created = await UsersRepository.create(userData);

      const updated = await UsersRepository.update(created.id, {
        fullName: 'Updated Name',
      });

      expect(updated.fullName).toBe('Updated Name');
      expect(updated.email).toBe(created.email); // Unchanged
    });
  });

  describe('findByRole', () => {
    it('should find users by role', async () => {
      await UsersRepository.create(Fixtures.createUser({ role: 'Expert' }));
      await UsersRepository.create(Fixtures.createUser({ role: 'Expert' }));
      await UsersRepository.create(Fixtures.createUser({ role: 'Learner' }));

      const experts = await UsersRepository.findByRole('Expert');
      expect(experts.length).toBe(2);
      expect(experts.every(u => u.role === 'Expert')).toBe(true);
    });
  });
});
```

#### B. Service Tests

```javascript
// 🔴 CẦN THÊM: tests/unit/services/quizAttempts.service.test.js

const QuizAttemptsService = require('../../../src/services/quizAttempts.service');
const Fixtures = require('../../helpers/fixtures');

describe('QuizAttemptsService', () => {
  describe('calculateScore', () => {
    it('should calculate score với correct answers', () => {
      const questions = [
        Fixtures.createQuestion({ difficultyLevel: 'Biết', correctAnswerIndex: 0 }),
        Fixtures.createQuestion({ difficultyLevel: 'Hiểu', correctAnswerIndex: 1 }),
        Fixtures.createQuestion({ difficultyLevel: 'Vận dụng', correctAnswerIndex: 2 }),
        Fixtures.createQuestion({ difficultyLevel: 'Vận dụng cao', correctAnswerIndex: 3 }),
      ];

      const userAnswers = [
        { questionId: questions[0].questionId, selectedIndex: 0 }, // Correct
        { questionId: questions[1].questionId, selectedIndex: 1 }, // Correct
        { questionId: questions[2].questionId, selectedIndex: 2 }, // Correct
        { questionId: questions[3].questionId, selectedIndex: 3 }, // Correct
      ];

      const result = QuizAttemptsService.calculateScore(questions, userAnswers);

      // Scores: Biết=1, Hiểu=2, Vận dụng=3, Vận dụng cao=4
      expect(result.totalScore).toBe(10); // 1+2+3+4
      expect(result.maxScore).toBe(10);
      expect(result.correctCount).toBe(4);
      expect(result.accuracy).toBe(100);
    });

    it('should calculate partial score với mixed answers', () => {
      const questions = [
        Fixtures.createQuestion({ difficultyLevel: 'Biết', correctAnswerIndex: 0 }),
        Fixtures.createQuestion({ difficultyLevel: 'Hiểu', correctAnswerIndex: 1 }),
        Fixtures.createQuestion({ difficultyLevel: 'Vận dụng', correctAnswerIndex: 2 }),
      ];

      const userAnswers = [
        { questionId: questions[0].questionId, selectedIndex: 0 }, // Correct (1 point)
        { questionId: questions[1].questionId, selectedIndex: 0 }, // Wrong (0 points)
        { questionId: questions[2].questionId, selectedIndex: 2 }, // Correct (3 points)
      ];

      const result = QuizAttemptsService.calculateScore(questions, userAnswers);

      expect(result.totalScore).toBe(4); // 1 + 0 + 3
      expect(result.maxScore).toBe(6); // 1 + 2 + 3
      expect(result.correctCount).toBe(2);
      expect(result.accuracy).toBeCloseTo(66.67, 1);
    });

    it('should handle missing user answers', () => {
      const questions = [
        Fixtures.createQuestion({ difficultyLevel: 'Biết', correctAnswerIndex: 0 }),
      ];

      const userAnswers = []; // Empty

      const result = QuizAttemptsService.calculateScore(questions, userAnswers);

      expect(result.totalScore).toBe(0);
      expect(result.maxScore).toBe(1);
      expect(result.correctCount).toBe(0);
    });
  });

  describe('checkQuestionSetAccess', () => {
    it('should allow owner access', () => {
      const userId = 'user123';
      const questionSet = { userId, status: 'Private', isShared: false };

      const canAccess = QuizAttemptsService.checkQuestionSetAccess(userId, questionSet);
      expect(canAccess).toBe(true);
    });

    it('should allow access to validated sets', () => {
      const userId = 'user123';
      const questionSet = { userId: 'other', status: 'Validated', isShared: false };

      const canAccess = QuizAttemptsService.checkQuestionSetAccess(userId, questionSet);
      expect(canAccess).toBe(true);
    });

    it('should allow access to shared sets', () => {
      const userId = 'user123';
      const questionSet = { userId: 'other', status: 'Private', isShared: true };

      const canAccess = QuizAttemptsService.checkQuestionSetAccess(userId, questionSet);
      expect(canAccess).toBe(true);
    });

    it('should deny access to private non-owned sets', () => {
      const userId = 'user123';
      const questionSet = { userId: 'other', status: 'Private', isShared: false };

      const canAccess = QuizAttemptsService.checkQuestionSetAccess(userId, questionSet);
      expect(canAccess).toBe(false);
    });
  });
});
```

#### C. Adapter Tests (với mocking)

```javascript
// 🔴 CẦN THÊM: tests/unit/adapters/llmClient.test.js

const nock = require('nock');
const LLMClient = require('../../../src/adapters/llmClient');

describe('LLMClient', () => {
  let llmClient;

  beforeEach(() => {
    llmClient = new LLMClient({
      model: 'gemini-1.5-flash',
      apiKey: 'test-api-key',
      timeoutMs: 5000,
      maxRetries: 2,
    });
  });

  afterEach(() => {
    nock.cleanAll();
  });

  describe('generateQuestions', () => {
    it('should generate questions successfully', async () => {
      // Mock Gemini API response
      nock('https://generativelanguage.googleapis.com')
        .post(/\/v1\/models\/.*:generateContent/)
        .query(true)
        .reply(200, {
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      questions: [
                        {
                          questionId: 'q1',
                          questionText: 'Test question?',
                          options: ['A', 'B', 'C', 'D'],
                          correctAnswerIndex: 0,
                          explanation: 'Test explanation',
                          difficultyLevel: 'Hiểu',
                        },
                      ],
                    }),
                  },
                ],
              },
            },
          ],
        });

      const result = await llmClient.generateQuestions({
        contextText: 'Test context',
        numQuestions: 1,
        difficulty: 'Hiểu',
      });

      expect(result.questions).toHaveLength(1);
      expect(result.questions[0].questionText).toBe('Test question?');
    });

    it('should retry on transient errors', async () => {
      // First call fails with 500
      nock('https://generativelanguage.googleapis.com')
        .post(/\/v1\/models\/.*:generateContent/)
        .query(true)
        .reply(500, { error: 'Internal server error' });

      // Second call succeeds
      nock('https://generativelanguage.googleapis.com')
        .post(/\/v1\/models\/.*:generateContent/)
        .query(true)
        .reply(200, {
          candidates: [
            {
              content: {
                parts: [{ text: JSON.stringify({ questions: [] }) }],
              },
            },
          ],
        });

      const result = await llmClient.generateQuestions({
        contextText: 'Test',
        numQuestions: 1,
      });

      expect(result.questions).toBeDefined();
    });

    it('should throw error after max retries', async () => {
      // All calls fail
      nock('https://generativelanguage.googleapis.com')
        .post(/\/v1\/models\/.*:generateContent/)
        .query(true)
        .times(3)
        .reply(500, { error: 'Internal server error' });

      await expect(
        llmClient.generateQuestions({
          contextText: 'Test',
          numQuestions: 1,
        })
      ).rejects.toThrow();
    });
  });
});
```

---

### 8.3. Integration Tests

#### A. API Endpoint Tests

```javascript
// 🔴 CẦN THÊM: tests/integration/subjects.test.js

const request = require('supertest');
const app = require('../../src/app');
const User = require('../../src/models/user.model');
const Subject = require('../../src/models/subject.model');
const Fixtures = require('../helpers/fixtures');
const jwt = require('jsonwebtoken');
const { env } = require('../../src/config');

describe('Subjects API', () => {
  let authToken;
  let userId;

  beforeEach(async () => {
    // Create test user
    const userData = Fixtures.createUser();
    const user = await User.create(userData);
    userId = user._id.toString();

    // Generate auth token
    authToken = jwt.sign(
      { sub: userId, role: user.role, email: user.email },
      env.jwtSecret,
      { expiresIn: '1h' }
    );
  });

  describe('POST /subjects', () => {
    it('should create a subject', async () => {
      const subjectData = {
        subjectName: 'Mathematics',
        description: 'Math course',
      };

      const res = await request(app)
        .post('/api/v1/subjects')
        .set('Authorization', `Bearer ${authToken}`)
        .send(subjectData)
        .expect(201);

      expect(res.body.id).toBeDefined();
      expect(res.body.subjectName).toBe('Mathematics');
      expect(res.body.userId).toBe(userId);
    });

    it('should require authentication', async () => {
      await request(app)
        .post('/api/v1/subjects')
        .send({ subjectName: 'Test' })
        .expect(401);
    });

    it('should validate input', async () => {
      const res = await request(app)
        .post('/api/v1/subjects')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ subjectName: '' }) // Invalid
        .expect(400);

      expect(res.body.code).toBe('ValidationError');
    });
  });

  describe('GET /subjects', () => {
    it('should list user subjects', async () => {
      // Create subjects
      await Subject.create(Fixtures.createSubject(userId));
      await Subject.create(Fixtures.createSubject(userId));

      const res = await request(app)
        .get('/api/v1/subjects')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body.items).toHaveLength(2);
      expect(res.body.meta.totalItems).toBe(2);
    });

    it('should support pagination', async () => {
      // Create 25 subjects
      for (let i = 0; i < 25; i++) {
        await Subject.create(Fixtures.createSubject(userId));
      }

      const res = await request(app)
        .get('/api/v1/subjects?page=2&pageSize=10')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body.items).toHaveLength(10);
      expect(res.body.meta.page).toBe(2);
      expect(res.body.meta.totalPages).toBe(3);
    });
  });

  describe('PATCH /subjects/:id', () => {
    it('should update subject', async () => {
      const subject = await Subject.create(Fixtures.createSubject(userId));

      const res = await request(app)
        .patch(`/api/v1/subjects/${subject._id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ subjectName: 'Updated Name' })
        .expect(200);

      expect(res.body.subjectName).toBe('Updated Name');
    });

    it('should enforce ownership', async () => {
      const otherUser = await User.create(Fixtures.createUser());
      const subject = await Subject.create(Fixtures.createSubject(otherUser._id));

      await request(app)
        .patch(`/api/v1/subjects/${subject._id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ subjectName: 'Hack' })
        .expect(404); // Not found (ownership check)
    });
  });
});
```

#### B. Workflow Integration Tests

```javascript
// 🔴 CẦN THÊM: tests/integration/questionGeneration.workflow.test.js

const request = require('supertest');
const app = require('../../src/app');
const User = require('../../src/models/user.model');
const Subject = require('../../src/models/subject.model');
const Document = require('../../src/models/document.model');
const QuestionSet = require('../../src/models/questionSet.model');
const Fixtures = require('../helpers/fixtures');
const jwt = require('jsonwebtoken');
const { env } = require('../../src/config');

describe('Question Generation Workflow', () => {
  let authToken;
  let userId;
  let subjectId;
  let documentId;

  beforeEach(async () => {
    // Setup user
    const user = await User.create(Fixtures.createUser());
    userId = user._id.toString();
    authToken = jwt.sign(
      { sub: userId, role: user.role, email: user.email },
      env.jwtSecret
    );

    // Setup subject
    const subject = await Subject.create(Fixtures.createSubject(userId));
    subjectId = subject._id.toString();

    // Setup document
    const document = await Document.create(
      Fixtures.createDocument(subjectId, userId, {
        status: 'Completed',
        extractedText: 'Sample text for question generation...',
      })
    );
    documentId = document._id.toString();
  });

  it('should complete full workflow: generate → get → share', async () => {
    // 1. Generate questions
    const generateRes = await request(app)
      .post('/api/v1/question-sets/generate')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        documentId,
        title: 'Test Questions',
        numQuestions: 5,
        difficulty: 'Hiểu',
      })
      .expect(202);

    const setId = generateRes.body.id;
    expect(setId).toBeDefined();

    // Note: In real workflow, this would be async via worker
    // For integration test, we'll manually update the question set
    await QuestionSet.findByIdAndUpdate(setId, {
      status: 'Private',
      questions: Array.from({ length: 5 }, () => Fixtures.createQuestion()),
    });

    // 2. Get question set
    const getRes = await request(app)
      .get(`/api/v1/question-sets/${setId}`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    expect(getRes.body.id).toBe(setId);
    expect(getRes.body.questions).toHaveLength(5);

    // 3. Share question set
    const shareRes = await request(app)
      .post(`/api/v1/question-sets/${setId}/share`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ isShared: true })
      .expect(200);

    expect(shareRes.body.sharedUrl).toBeDefined();
    expect(shareRes.body.isShared).toBe(true);
  });
});
```

---

### 8.4. E2E Tests

```javascript
// 🔴 CẦN THÊM: tests/e2e/fullUserJourney.test.js

const request = require('supertest');
const app = require('../../src/app');
const User = require('../../src/models/user.model');
const Fixtures = require('../helpers/fixtures');
const jwt = require('jsonwebtoken');
const { env } = require('../../src/config');

describe('Full User Journey', () => {
  it('should complete learner journey: register → upload → generate → quiz', async () => {
    // 1. Create user (simulating registration)
    const user = await User.create(Fixtures.createUser());
    const authToken = jwt.sign(
      { sub: user._id.toString(), role: user.role, email: user.email },
      env.jwtSecret
    );

    // 2. Create subject
    const subjectRes = await request(app)
      .post('/api/v1/subjects')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        subjectName: 'Computer Science',
        description: 'CS fundamentals',
      })
      .expect(201);

    const subjectId = subjectRes.body.id;

    // 3. Upload document (mock file upload)
    // Note: This would require actual file buffer in real test
    // For E2E, we'll simulate by creating document directly
    const Document = require('../../src/models/document.model');
    const document = await Document.create(
      Fixtures.createDocument(subjectId, user._id, {
        status: 'Completed',
        extractedText: 'Computer Science fundamentals...',
      })
    );

    // 4. Generate questions
    const QuestionSet = require('../../src/models/questionSet.model');
    const questionSet = await QuestionSet.create(
      Fixtures.createQuestionSet(user._id, subjectId, {
        status: 'Private',
        numQuestions: 10,
      })
    );

    // 5. Start quiz
    const startQuizRes = await request(app)
      .post('/api/v1/quiz-attempts')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ setId: questionSet._id.toString() })
      .expect(201);

    const attemptId = startQuizRes.body.id;

    // 6. Submit quiz
    const answers = questionSet.questions.map(q => ({
      questionId: q.questionId,
      selectedIndex: q.correctAnswerIndex, // All correct
    }));

    const submitRes = await request(app)
      .post(`/api/v1/quiz-attempts/${attemptId}/submit`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ answers })
      .expect(200);

    expect(submitRes.body.score).toBeGreaterThan(0);
    expect(submitRes.body.correctCount).toBe(10);
  });
});
```

---

## Week 9: Load Testing & Security Testing

### 9.1. Load Testing

```javascript
// 🔴 CẦN THÊM: tests/load/loadTest.js (với k6 hoặc artillery)

// Install: npm install -g artillery

// artillery.yml
/*
config:
  target: 'http://localhost:3000'
  phases:
    - duration: 60
      arrivalRate: 10  # 10 requests/sec for 1 minute
    - duration: 120
      arrivalRate: 50  # 50 requests/sec for 2 minutes
  
scenarios:
    - name: "Get subjects"
      flow:
        - get:
            url: "/api/v1/subjects"
            headers:
              Authorization: "Bearer {{ token }}"
    
    - name: "Create subject"
      flow:
        - post:
            url: "/api/v1/subjects"
            headers:
              Authorization: "Bearer {{ token }}"
            json:
              subjectName: "Load Test Subject"
              description: "Testing load"
*/

// Run: artillery run artillery.yml
```

### 9.2. Security Testing

#### A. OWASP Top 10 Checklist

```markdown
# 🔴 CẦN THÊM: docs/SECURITY_CHECKLIST.md

## OWASP Top 10 Security Checklist

- [ ] **A01: Broken Access Control**
  - [ ] Enforce authentication on all protected endpoints
  - [ ] Verify ownership before CRUD operations
  - [ ] Implement RBAC correctly
  - [ ] Test horizontal privilege escalation

- [ ] **A02: Cryptographic Failures**
  - [ ] Use bcrypt for password hashing
  - [ ] Use HTTPS in production
  - [ ] Store secrets securely (env vars, vault)
  - [ ] Don't expose sensitive data in logs/errors

- [ ] **A03: Injection**
  - [ ] Use Mongoose (ORM) to prevent NoSQL injection
  - [ ] Validate all inputs với Joi/Zod
  - [ ] Sanitize user inputs
  - [ ] Use parameterized queries

- [ ] **A04: Insecure Design**
  - [ ] Implement rate limiting
  - [ ] Add CAPTCHA for auth endpoints (if needed)
  - [ ] Use idempotency keys for payments
  - [ ] Implement CSRF protection

- [ ] **A05: Security Misconfiguration**
  - [ ] Use Helmet for security headers
  - [ ] Configure CORS properly
  - [ ] Disable stack traces in production
  - [ ] Keep dependencies updated

- [ ] **A06: Vulnerable Components**
  - [ ] Run `npm audit` regularly
  - [ ] Update dependencies
  - [ ] Use Dependabot/Renovate

- [ ] **A07: Authentication Failures**
  - [ ] Implement OAuth 2.0 correctly
  - [ ] Use JWT with proper expiry
  - [ ] Implement refresh token rotation
  - [ ] Rate limit authentication attempts

- [ ] **A08: Software and Data Integrity**
  - [ ] Verify Stripe webhook signatures
  - [ ] Use package-lock.json
  - [ ] Implement CI/CD with security scans

- [ ] **A09: Logging and Monitoring**
  - [ ] Log security events
  - [ ] Monitor for suspicious activity
  - [ ] Set up alerts for errors

- [ ] **A10: Server-Side Request Forgery (SSRF)**
  - [ ] Validate URLs before fetching
  - [ ] Whitelist allowed domains
  - [ ] Don't expose internal services
```

#### B. Automated Security Scans

```json
// 🔴 CẦN THÊM: package.json scripts
{
  "scripts": {
    "security:audit": "npm audit --audit-level=moderate",
    "security:fix": "npm audit fix",
    "security:snyk": "snyk test" // If using Snyk
  }
}
```

---

## Testing Checklist

### Unit Tests (Target: ≥85% coverage)
- [ ] All repositories tested
- [ ] All services tested (business logic)
- [ ] All adapters tested (với mocking)
- [ ] Utilities/helpers tested

### Integration Tests
- [ ] All API endpoints tested (happy path)
- [ ] All API endpoints tested (error cases)
- [ ] Authentication/authorization tested
- [ ] Rate limiting tested
- [ ] Input validation tested

### E2E Tests
- [ ] Full learner journey tested
- [ ] Full expert review workflow tested
- [ ] Subscription purchase flow tested
- [ ] Payment webhook flow tested

### Load Tests
- [ ] Identify throughput limits
- [ ] Identify bottlenecks
- [ ] Test with realistic load (10x expected users)

### Security Tests
- [ ] OWASP Top 10 checklist completed
- [ ] npm audit clean (no high/critical vulnerabilities)
- [ ] Dependency scanning passed
- [ ] Manual penetration testing (if budget allows)

---

**Tiếp tục với PHASE_5_DEPLOYMENT.md...**
