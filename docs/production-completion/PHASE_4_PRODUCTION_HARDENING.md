# Phase 4: Production Hardening

**Timeline:** 2 tuần  
**Priority:** CRITICAL (must complete before production deployment)  
**Dependencies:** Phase 1, 2, 3

---

## 📋 Tổng quan

Phase này đảm bảo hệ thống **sẵn sàng cho production**:

### Scope
1. **Comprehensive Testing** (0.5 tuần)
2. **Performance Optimization** (0.5 tuần)
3. **Security Hardening** (0.5 tuần)
4. **Monitoring & Observability** (0.25 tuần)
5. **Deployment Automation** (0.25 tuần)

---

## 1️⃣ Comprehensive Testing

### 1.1. Unit Testing Setup

**Dependencies:**
```bash
npm install --save-dev jest supertest @faker-js/faker
```

**Jest config:** `jest.config.js`

```javascript
module.exports = {
  testEnvironment: 'node',
  coverageDirectory: 'coverage',
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/server.js',
    '!src/worker.js',
  ],
  coverageThreshold: {
    global: {
      branches: 85,
      functions: 85,
      lines: 85,
      statements: 85,
    },
  },
  testMatch: ['**/__tests__/**/*.test.js', '**/*.test.js'],
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
};
```

---

### 1.2. Test Setup

**File:** `tests/setup.js`

```javascript
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

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

afterEach(async () => {
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    await collections[key].deleteMany();
  }
});
```

---

### 1.3. Unit Test Examples

**File:** `tests/unit/services/subscriptionPlans.service.test.js`

```javascript
const SubscriptionPlansService = require('../../../src/services/subscriptionPlans.service');
const SubscriptionPlan = require('../../../src/models/subscriptionPlan.model');
const { faker } = require('@faker-js/faker');

describe('SubscriptionPlansService', () => {
  let service;
  let mockRepository;

  beforeEach(() => {
    mockRepository = {
      find: jest.fn(),
      findById: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    };

    service = new SubscriptionPlansService({
      subscriptionPlansRepository: mockRepository,
    });
  });

  describe('listActivePlans', () => {
    it('should return active plans only', async () => {
      const mockPlans = [
        {
          _id: 'plan1',
          planName: 'Standard',
          status: 'Active',
          price: 2000,
          entitlements: {},
        },
        {
          _id: 'plan2',
          planName: 'Pro',
          status: 'Active',
          price: 5000,
          entitlements: {},
        },
      ];

      mockRepository.find.mockResolvedValue(mockPlans);

      const result = await service.listActivePlans();

      expect(mockRepository.find).toHaveBeenCalledWith({ status: 'Active' });
      expect(result).toHaveLength(2);
      expect(result[0].planName).toBe('Standard');
    });
  });

  describe('createPlan', () => {
    it('should create plan with valid entitlements', async () => {
      const planData = {
        planName: 'Enterprise',
        description: 'Enterprise plan',
        billingCycle: 'Yearly',
        price: 50000,
        entitlements: {
          maxMonthlyTestGenerations: 'unlimited',
          maxValidationRequests: 'unlimited',
          priorityProcessing: true,
          shareLimits: 'unlimited',
          maxSubjects: 'unlimited',
          maxDocumentsPerSubject: 'unlimited',
          maxQuestionsPerSet: 500,
        },
      };

      mockRepository.create.mockResolvedValue({
        _id: 'plan3',
        ...planData,
      });

      const result = await service.createPlan(planData);

      expect(mockRepository.create).toHaveBeenCalled();
      expect(result.planName).toBe('Enterprise');
    });

    it('should reject plan with missing entitlements', async () => {
      const invalidData = {
        planName: 'Invalid',
        price: 1000,
        entitlements: {
          maxMonthlyTestGenerations: 10,
          // missing other required fields
        },
      };

      await expect(service.createPlan(invalidData)).rejects.toThrow(
        'Missing required entitlement'
      );
    });
  });
});
```

---

### 1.4. Integration Test Examples

**File:** `tests/integration/subscriptionPlans.api.test.js`

```javascript
const request = require('supertest');
const app = require('../../src/app');
const User = require('../../src/models/user.model');
const SubscriptionPlan = require('../../src/models/subscriptionPlan.model');
const jwt = require('jsonwebtoken');
const config = require('../../src/config');

describe('Subscription Plans API', () => {
  let adminToken;
  let learnerToken;
  let adminUser;

  beforeAll(async () => {
    // Create admin user
    adminUser = await User.create({
      fullName: 'Admin User',
      email: 'admin@test.com',
      role: 'Admin',
      status: 'Active',
    });

    adminToken = jwt.sign(
      { userId: adminUser._id, role: 'Admin' },
      config.jwtSecret
    );

    // Create learner user
    const learner = await User.create({
      fullName: 'Learner User',
      email: 'learner@test.com',
      role: 'Learner',
      status: 'Active',
    });

    learnerToken = jwt.sign(
      { userId: learner._id, role: 'Learner' },
      config.jwtSecret
    );

    // Create test plans
    await SubscriptionPlan.create([
      {
        planName: 'Standard',
        price: 2000,
        status: 'Active',
        entitlements: {},
      },
      {
        planName: 'Pro',
        price: 5000,
        status: 'Active',
        entitlements: {},
      },
    ]);
  });

  describe('GET /subscription-plans', () => {
    it('should list active plans (public)', async () => {
      const res = await request(app)
        .get('/api/v1/subscription-plans')
        .expect(200);

      expect(res.body).toBeInstanceOf(Array);
      expect(res.body.length).toBe(2);
    });
  });

  describe('POST /subscription-plans', () => {
    it('should create plan (admin)', async () => {
      const res = await request(app)
        .post('/api/v1/subscription-plans')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          planName: 'Enterprise',
          billingCycle: 'Yearly',
          price: 50000,
          entitlements: {
            maxMonthlyTestGenerations: 'unlimited',
            maxValidationRequests: 'unlimited',
            priorityProcessing: true,
            shareLimits: 'unlimited',
            maxSubjects: 'unlimited',
            maxDocumentsPerSubject: 'unlimited',
            maxQuestionsPerSet: 500,
          },
        })
        .expect(201);

      expect(res.body.planName).toBe('Enterprise');
    });

    it('should reject non-admin', async () => {
      await request(app)
        .post('/api/v1/subscription-plans')
        .set('Authorization', `Bearer ${learnerToken}`)
        .send({})
        .expect(403);
    });
  });
});
```

---

### 1.5. E2E Test Examples

**File:** `tests/e2e/subscription-flow.test.js`

```javascript
const request = require('supertest');
const app = require('../../src/app');
const User = require('../../src/models/user.model');
const SubscriptionPlan = require('../../src/models/subscriptionPlan.model');
const UserSubscription = require('../../src/models/userSubscription.model');
const jwt = require('jsonwebtoken');
const config = require('../../src/config');

describe('E2E: Complete Subscription Flow', () => {
  let learnerToken;
  let learner;
  let standardPlan;

  beforeAll(async () => {
    // Setup user
    learner = await User.create({
      fullName: 'Test Learner',
      email: 'learner@test.com',
      role: 'Learner',
      status: 'Active',
    });

    learnerToken = jwt.sign(
      { userId: learner._id, role: 'Learner' },
      config.jwtSecret
    );

    // Setup plan
    standardPlan = await SubscriptionPlan.create({
      planName: 'Standard',
      price: 2000,
      billingCycle: 'Monthly',
      status: 'Active',
      entitlements: {
        maxMonthlyTestGenerations: 50,
        maxValidationRequests: 5,
        priorityProcessing: false,
        shareLimits: 20,
        maxSubjects: 10,
        maxDocumentsPerSubject: 20,
        maxQuestionsPerSet: 50,
      },
    });
  });

  it('should complete full subscription flow', async () => {
    // 1. List available plans
    const plansRes = await request(app)
      .get('/api/v1/subscription-plans')
      .expect(200);

    expect(plansRes.body.length).toBeGreaterThan(0);

    // 2. Create subscription
    const subscribeRes = await request(app)
      .post('/api/v1/subscriptions')
      .set('Authorization', `Bearer ${learnerToken}`)
      .send({ planId: standardPlan._id.toString() })
      .expect(201);

    expect(subscribeRes.body.status).toBe('PendingPayment');
    expect(subscribeRes.body.checkoutUrl).toBeDefined();

    const subscriptionId = subscribeRes.body.id;

    // 3. Simulate payment webhook
    await UserSubscription.findByIdAndUpdate(subscriptionId, {
      status: 'Active',
    });

    await User.findByIdAndUpdate(learner._id, {
      subscriptionStatus: 'Active',
    });

    // 4. Check subscription history
    const historyRes = await request(app)
      .get('/api/v1/user-subscriptions/me')
      .set('Authorization', `Bearer ${learnerToken}`)
      .expect(200);

    expect(historyRes.body.length).toBe(1);
    expect(historyRes.body[0].status).toBe('Active');

    // 5. Cancel subscription
    const cancelRes = await request(app)
      .patch(`/api/v1/user-subscriptions/${subscriptionId}/cancel`)
      .set('Authorization', `Bearer ${learnerToken}`)
      .expect(200);

    expect(cancelRes.body.status).toBe('Cancelled');
  });
});
```

---

## 2️⃣ Performance Optimization

### 2.1. Database Indexes

**File:** `scripts/create-indexes.js`

```javascript
const mongoose = require('mongoose');
const config = require('../src/config');

async function createIndexes() {
  await mongoose.connect(config.mongo.uri);

  const db = mongoose.connection.db;

  // Users indexes
  await db.collection('users').createIndex({ email: 1 }, { unique: true });
  await db.collection('users').createIndex({ role: 1, status: 1 });

  // Documents indexes
  await db.collection('documents').createIndex({ ownerId: 1 });
  await db.collection('documents').createIndex({ subjectId: 1 });
  await db.collection('documents').createIndex({ status: 1 });

  // QuestionSets indexes
  await db.collection('questionsets').createIndex({ creatorId: 1 });
  await db.collection('questionsets').createIndex({ status: 1 });
  await db.collection('questionsets').createIndex({ isShared: 1, status: 1 });

  // ValidationRequests indexes
  await db.collection('validationrequests').createIndex({ learnerId: 1 });
  await db.collection('validationrequests').createIndex({ expertId: 1 });
  await db.collection('validationrequests').createIndex({ status: 1 });

  // CommissionRecords indexes
  await db.collection('commissionrecords').createIndex({ expertId: 1 });
  await db.collection('commissionrecords').createIndex({ status: 1 });

  // QuizAttempts indexes
  await db.collection('quizattempts').createIndex({ userId: 1 });
  await db.collection('quizattempts').createIndex({ setId: 1 });

  console.log('✅ All indexes created');
  await mongoose.disconnect();
}

createIndexes().catch(console.error);
```

---

### 2.2. Query Optimization

**Use `.lean()` for read-only queries:**

```javascript
// Instead of:
const users = await User.find({ status: 'Active' });

// Use:
const users = await User.find({ status: 'Active' }).lean();
```

**Projection to reduce data:**

```javascript
// Only select needed fields
const users = await User.find({ status: 'Active' })
  .select('fullName email role')
  .lean();
```

**Pagination with `skip` and `limit`:**

```javascript
const page = 1;
const pageSize = 20;
const skip = (page - 1) * pageSize;

const users = await User.find({})
  .skip(skip)
  .limit(pageSize)
  .lean();
```

---

### 2.3. Caching Strategy

**Dependencies:**
```bash
npm install redis
```

**File:** `src/utils/cache.js`

```javascript
const Redis = require('ioredis');
const config = require('../config');

class CacheManager {
  constructor() {
    this.client = new Redis(config.redis.url);
  }

  async get(key) {
    const data = await this.client.get(key);
    return data ? JSON.parse(data) : null;
  }

  async set(key, value, ttl = 3600) {
    await this.client.set(key, JSON.stringify(value), 'EX', ttl);
  }

  async del(key) {
    await this.client.del(key);
  }

  async invalidatePattern(pattern) {
    const keys = await this.client.keys(pattern);
    if (keys.length > 0) {
      await this.client.del(...keys);
    }
  }
}

module.exports = new CacheManager();
```

**Usage in service:**

```javascript
const cache = require('../utils/cache');

async listActivePlans() {
  const cacheKey = 'subscription-plans:active';

  // Try cache first
  const cached = await cache.get(cacheKey);
  if (cached) {
    return cached;
  }

  // Query database
  const plans = await this.repository.find({ status: 'Active' });
  const result = plans.map(this.mapToDTO);

  // Cache for 1 hour
  await cache.set(cacheKey, result, 3600);

  return result;
}
```

---

## 3️⃣ Security Hardening

### 3.1. Rate Limiting

**Enhanced rate limiting:**

```javascript
// src/middleware/rateLimit.js
const rateLimit = require('express-rate-limit');
const RedisStore = require('rate-limit-redis');
const Redis = require('ioredis');
const config = require('../config');

const redisClient = new Redis(config.redis.url);

// General API rate limit
const apiLimiter = rateLimit({
  store: new RedisStore({
    client: redisClient,
    prefix: 'rl:api:',
  }),
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per 15 minutes
  message: {
    code: 'TooManyRequests',
    message: 'Too many requests, please try again later',
  },
});

// Auth endpoints - stricter
const authLimiter = rateLimit({
  store: new RedisStore({
    client: redisClient,
    prefix: 'rl:auth:',
  }),
  windowMs: 15 * 60 * 1000,
  max: 5, // 5 login attempts per 15 minutes
  message: {
    code: 'TooManyRequests',
    message: 'Too many login attempts, please try again later',
  },
});

module.exports = {
  apiLimiter,
  authLimiter,
};
```

---

### 3.2. Input Sanitization

**Dependencies:**
```bash
npm install express-mongo-sanitize xss-clean hpp
```

**File:** `src/middleware/security.js`

```javascript
const mongoSanitize = require('express-mongo-sanitize');
const xss = require('xss-clean');
const hpp = require('hpp');

function setupSecurity(app) {
  // Prevent NoSQL injection
  app.use(mongoSanitize());

  // Prevent XSS attacks
  app.use(xss());

  // Prevent HTTP Parameter Pollution
  app.use(hpp());
}

module.exports = setupSecurity;
```

---

### 3.3. HTTPS Enforcement

```javascript
// src/middleware/httpsRedirect.js
function enforceHTTPS(req, res, next) {
  if (process.env.NODE_ENV === 'production' && !req.secure) {
    return res.redirect(301, `https://${req.headers.host}${req.url}`);
  }
  next();
}

module.exports = enforceHTTPS;
```

---

### 3.4. Security Headers

**Using Helmet (already included):**

```javascript
// src/app.js
const helmet = require('helmet');

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", 'data:', 'https:'],
    },
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  },
}));
```

---

## 4️⃣ Monitoring & Observability

### 4.1. Structured Logging

**Enhanced logger:** `src/utils/logger.js`

```javascript
const pino = require('pino');

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport:
    process.env.NODE_ENV !== 'production'
      ? {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:standard',
            ignore: 'pid,hostname',
          },
        }
      : undefined,
  serializers: {
    req: (req) => ({
      method: req.method,
      url: req.url,
      headers: req.headers,
      remoteAddress: req.remoteAddress,
      remotePort: req.remotePort,
    }),
    res: (res) => ({
      statusCode: res.statusCode,
    }),
    err: pino.stdSerializers.err,
  },
});

module.exports = logger;
```

---

### 4.2. Request Logging Middleware

```javascript
// src/middleware/requestLogger.js
const logger = require('../utils/logger');
const { v4: uuidv4 } = require('uuid');

function requestLogger(req, res, next) {
  req.id = uuidv4();
  req.startTime = Date.now();

  const log = logger.child({ requestId: req.id });

  log.info({ req }, 'Incoming request');

  res.on('finish', () => {
    const duration = Date.now() - req.startTime;
    log.info(
      {
        res,
        duration,
        userId: req.user?.id,
      },
      'Request completed'
    );
  });

  next();
}

module.exports = requestLogger;
```

---

### 4.3. Error Tracking

**Dependencies:**
```bash
npm install @sentry/node
```

**File:** `src/utils/errorTracker.js`

```javascript
const Sentry = require('@sentry/node');

function initErrorTracking(app) {
  if (process.env.SENTRY_DSN) {
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      environment: process.env.NODE_ENV,
      tracesSampleRate: 1.0,
    });

    // Request handler must be first
    app.use(Sentry.Handlers.requestHandler());

    // TracingHandler for performance monitoring
    app.use(Sentry.Handlers.tracingHandler());
  }
}

function captureException(error, context = {}) {
  if (process.env.SENTRY_DSN) {
    Sentry.captureException(error, { extra: context });
  }
}

module.exports = {
  initErrorTracking,
  captureException,
  Sentry,
};
```

---

### 4.4. Health Check Endpoint

**Enhanced health check:**

```javascript
// src/controllers/health.controller.js
const mongoose = require('mongoose');
const Redis = require('ioredis');
const config = require('../config');

class HealthController {
  async check(req, res) {
    const health = {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV,
      services: {},
    };

    // Check MongoDB
    try {
      if (mongoose.connection.readyState === 1) {
        health.services.mongodb = 'connected';
      } else {
        health.services.mongodb = 'disconnected';
        health.status = 'degraded';
      }
    } catch (error) {
      health.services.mongodb = 'error';
      health.status = 'unhealthy';
    }

    // Check Redis
    try {
      const redis = new Redis(config.redis.url);
      await redis.ping();
      health.services.redis = 'connected';
      redis.disconnect();
    } catch (error) {
      health.services.redis = 'error';
      health.status = 'degraded';
    }

    const statusCode = health.status === 'ok' ? 200 : health.status === 'degraded' ? 200 : 503;
    res.status(statusCode).json(health);
  }
}

module.exports = new HealthController();
```

---

## 5️⃣ Deployment Automation

### 5.1. Docker Setup

**File:** `Dockerfile`

```dockerfile
FROM node:18-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .

FROM node:18-alpine

WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app .

EXPOSE 3000

CMD ["node", "src/server.js"]
```

**File:** `docker-compose.yml`

```yaml
version: '3.8'

services:
  app:
    build: .
    ports:
      - '3000:3000'
    environment:
      - NODE_ENV=production
      - MONGODB_URI=${MONGODB_URI}
      - REDIS_URL=${REDIS_URL}
    depends_on:
      - mongo
      - redis

  worker:
    build: .
    command: node src/worker.js
    environment:
      - NODE_ENV=production
      - MONGODB_URI=${MONGODB_URI}
      - REDIS_URL=${REDIS_URL}
    depends_on:
      - mongo
      - redis

  mongo:
    image: mongo:7
    volumes:
      - mongo-data:/data/db

  redis:
    image: redis:7-alpine
    volumes:
      - redis-data:/data

volumes:
  mongo-data:
  redis-data:
```

---

### 5.2. CI/CD Pipeline

**File:** `.github/workflows/ci.yml`

```yaml
name: CI/CD

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main, develop]

jobs:
  test:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'

      - name: Install dependencies
        run: npm ci

      - name: Run linter
        run: npm run lint

      - name: Run tests
        run: npm test

      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          files: ./coverage/lcov.info

  build:
    needs: test
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'

    steps:
      - uses: actions/checkout@v3

      - name: Build Docker image
        run: docker build -t learinal-backend:latest .

      - name: Push to registry
        run: |
          echo "${{ secrets.DOCKER_PASSWORD }}" | docker login -u "${{ secrets.DOCKER_USERNAME }}" --password-stdin
          docker tag learinal-backend:latest ${{ secrets.DOCKER_USERNAME }}/learinal-backend:latest
          docker push ${{ secrets.DOCKER_USERNAME }}/learinal-backend:latest
```

---

## ✅ Acceptance Criteria - Phase 4

### Testing
- [ ] Unit test coverage ≥ 85%
- [ ] Integration tests for all APIs
- [ ] E2E tests for critical flows
- [ ] All tests passing in CI

### Performance
- [ ] API response time p95 < 500ms
- [ ] Database queries optimized
- [ ] Caching implemented
- [ ] Indexes created

### Security
- [ ] Rate limiting active
- [ ] Input sanitization
- [ ] HTTPS enforced
- [ ] Security headers set
- [ ] No security vulnerabilities (npm audit)

### Monitoring
- [ ] Structured logging
- [ ] Error tracking (Sentry)
- [ ] Health check endpoint
- [ ] Request logging

### Deployment
- [ ] Docker containers working
- [ ] docker-compose working locally
- [ ] CI/CD pipeline passing
- [ ] Environment variables documented

---

## 🚀 Production Checklist

### Pre-Deployment
- [ ] All tests passing
- [ ] Security audit complete
- [ ] Performance benchmarks met
- [ ] Database migrations ready
- [ ] Backup strategy in place

### Deployment
- [ ] Environment variables configured
- [ ] SSL certificates installed
- [ ] Domain configured
- [ ] Load balancer setup (if needed)
- [ ] CDN configured (if needed)

### Post-Deployment
- [ ] Health checks passing
- [ ] Monitoring dashboards setup
- [ ] Alerts configured
- [ ] Documentation updated
- [ ] Team trained

---

**Timeline:** 2 tuần  
**Status:** Ready for production deployment ✅
