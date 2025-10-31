# GIAI ĐOẠN 3: Infrastructure & Production Readiness

**Thời gian:** 2 tuần  
**Mục tiêu:** Hardening hệ thống cho production environment

---

## Week 6: Security & Performance

### 6.1. Security Hardening

#### A. Input Validation (Comprehensive)

##### Schema Validators với Joi/Zod

```javascript
// 🔴 CẦN THÊM: src/middleware/validators/

// users.validators.js
const Joi = require('joi');

const updateUserSchema = Joi.object({
  fullName: Joi.string().min(2).max(100).optional(),
  email: Joi.string().email().optional(),
  // Không cho phép update role, subscriptionStatus từ client
});

// documents.validators.js
const uploadDocumentSchema = Joi.object({
  subjectId: Joi.string().regex(/^[0-9a-fA-F]{24}$/).required(),
  // file sẽ được validate riêng bởi multer + StorageClient
});

// questionSets.validators.js
const generateQuestionSetSchema = Joi.object({
  documentId: Joi.string().regex(/^[0-9a-fA-F]{24}$/).required(),
  topics: Joi.array().items(Joi.string().max(200)).max(10).optional(),
  difficulty: Joi.string().valid('Biết', 'Hiểu', 'Vận dụng', 'Vận dụng cao').optional(),
  numQuestions: Joi.number().integer().min(1).max(100).required(),
  title: Joi.string().min(3).max(200).required(),
});

const shareQuestionSetSchema = Joi.object({
  isShared: Joi.boolean().required(),
});

// quizAttempts.validators.js
const startQuizSchema = Joi.object({
  setId: Joi.string().regex(/^[0-9a-fA-F]{24}$/).required(),
});

const submitQuizSchema = Joi.object({
  answers: Joi.array()
    .items(
      Joi.object({
        questionId: Joi.string().required(),
        selectedIndex: Joi.number().integer().min(0).max(3).required(),
      })
    )
    .required(),
});

// validationRequests.validators.js
const completeValidationSchema = Joi.object({
  decision: Joi.string().valid('Approved', 'Rejected').required(),
  feedback: Joi.string().max(2000).optional(),
  correctedQuestions: Joi.array().optional(), // Complex nested validation
});

module.exports = {
  updateUserSchema,
  uploadDocumentSchema,
  generateQuestionSetSchema,
  shareQuestionSetSchema,
  startQuizSchema,
  submitQuizSchema,
  completeValidationSchema,
};
```

##### Validation Middleware

```javascript
// 🔴 CẦN THÊM: src/middleware/inputValidation.js (enhance)

function validateRequest(schema, source = 'body') {
  return (req, res, next) => {
    const data = source === 'body' ? req.body : 
                 source === 'query' ? req.query : 
                 req.params;

    const { error, value } = schema.validate(data, {
      abortEarly: false, // Return all errors
      stripUnknown: true, // Remove unknown fields
    });

    if (error) {
      const details = error.details.reduce((acc, detail) => {
        acc[detail.path.join('.')] = detail.message;
        return acc;
      }, {});

      return res.status(400).json({
        code: 'ValidationError',
        message: 'Invalid request data',
        details,
      });
    }

    // Replace original data with validated & sanitized data
    if (source === 'body') req.body = value;
    else if (source === 'query') req.query = value;
    else req.params = value;

    next();
  };
}

module.exports = { validateRequest };
```

##### Apply to routes

```javascript
// src/routes/questionSets.routes.js

const { validateRequest } = require('../middleware/inputValidation');
const { 
  generateQuestionSetSchema, 
  shareQuestionSetSchema 
} = require('../middleware/validators/questionSets.validators');

router.post(
  '/generate',
  authenticateJWT,
  validateRequest(generateQuestionSetSchema, 'body'),
  questionSetsController.generateQuestionSet
);

router.post(
  '/:id/share',
  authenticateJWT,
  validateRequest(shareQuestionSetSchema, 'body'),
  questionSetsController.shareQuestionSet
);
```

#### B. CORS Configuration

```javascript
// 🔴 CẦN THÊM: src/config/cors.js

const env = require('./env');

const allowedOrigins = env.corsAllowedOrigins
  ? env.corsAllowedOrigins.split(',').map(o => o.trim())
  : ['http://localhost:3000', 'http://localhost:5173']; // Dev defaults

const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) return callback(null, true);

    if (allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true, // Allow cookies
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Request-ID',
    'Idempotency-Key',
    'If-None-Match',
  ],
  exposedHeaders: [
    'X-Request-ID',
    'X-RateLimit-Limit',
    'X-RateLimit-Remaining',
    'X-RateLimit-Reset',
    'ETag',
  ],
  maxAge: 86400, // 24 hours
};

module.exports = corsOptions;
```

```javascript
// src/app.js
const cors = require('cors');
const corsOptions = require('./config/cors');

app.use(cors(corsOptions));
```

#### C. Helmet (Security Headers)

```javascript
// src/app.js
const helmet = require('helmet');

// 🔴 CẦN THÊM: Configure Helmet
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"], // Adjust based on frontend needs
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'https:'],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"],
        frameSrc: ["'none'"],
      },
    },
    crossOriginEmbedderPolicy: false, // Adjust if embedding resources
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);

// Additional security headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});
```

#### D. Rate Limiting (Advanced)

```javascript
// 🔴 CẦN THÊM: src/middleware/rateLimit.js (enhance)

const rateLimit = require('express-rate-limit');
const RedisStore = require('rate-limit-redis');
const { getRedisClient } = require('../config/redis');

// Standard rate limit (60 requests/min)
const standardLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  store: new RedisStore({
    client: getRedisClient(),
    prefix: 'rl:standard:',
  }),
  handler: (req, res) => {
    res.status(429).json({
      code: 'TooManyRequests',
      message: 'Rate limit exceeded. Please try again later.',
      retryAfter: Math.ceil(req.rateLimit.resetTime / 1000),
    });
  },
});

// Strict rate limit for expensive operations (10 requests/min)
const strictLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  store: new RedisStore({
    client: getRedisClient(),
    prefix: 'rl:strict:',
  }),
  keyGenerator: (req) => {
    // Rate limit per user for authenticated requests
    return req.user?.id || req.ip;
  },
  handler: (req, res) => {
    res.status(429).json({
      code: 'TooManyRequests',
      message: 'Rate limit exceeded for this operation.',
      retryAfter: Math.ceil(req.rateLimit.resetTime / 1000),
    });
  },
});

// Auth rate limit (5 failed attempts/15 min)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  store: new RedisStore({
    client: getRedisClient(),
    prefix: 'rl:auth:',
  }),
  skipSuccessfulRequests: true, // Only count failed auth attempts
  handler: (req, res) => {
    res.status(429).json({
      code: 'TooManyRequests',
      message: 'Too many authentication attempts. Please try again later.',
      retryAfter: Math.ceil(req.rateLimit.resetTime / 1000),
    });
  },
});

module.exports = {
  standardLimiter,
  strictLimiter,
  authLimiter,
};
```

```javascript
// Apply to routes
const { standardLimiter, strictLimiter, authLimiter } = require('../middleware/rateLimit');

// Auth routes
router.post('/auth/exchange', authLimiter, authController.exchange);

// Expensive operations
router.post('/question-sets/generate', 
  authenticateJWT, 
  strictLimiter, 
  questionSetsController.generateQuestionSet
);

// Standard routes
router.use('/api/v1', standardLimiter);
```

#### E. Secrets Management

```javascript
// 🔴 CẦN THÊM: Validate required secrets at startup

// src/config/validateEnv.js
function validateEnvironment() {
  const required = [
    'MONGO_URI',
    'JWT_SECRET',
    'JWT_REFRESH_SECRET',
    'GOOGLE_CLIENT_ID',
    'GOOGLE_CLIENT_SECRET',
  ];

  const missing = required.filter(key => !process.env[key]);

  if (missing.length > 0) {
    console.error('❌ Missing required environment variables:');
    missing.forEach(key => console.error(`   - ${key}`));
    process.exit(1);
  }

  // Warn about defaults
  const warnings = [];
  if (process.env.JWT_SECRET === 'change-me') {
    warnings.push('JWT_SECRET is using default value');
  }
  if (process.env.NODE_ENV === 'production' && !process.env.SENDGRID_API_KEY) {
    warnings.push('SENDGRID_API_KEY not set in production');
  }

  if (warnings.length > 0) {
    console.warn('⚠️  Environment warnings:');
    warnings.forEach(w => console.warn(`   - ${w}`));
  }
}

module.exports = { validateEnvironment };
```

```javascript
// src/server.js
const { validateEnvironment } = require('./config/validateEnv');

validateEnvironment();
// ... rest of server bootstrap
```

#### Checklist - Security

- [ ] Implement comprehensive input validation với Joi/Zod
- [ ] Apply validators cho tất cả endpoints
- [ ] Configure CORS properly với whitelist
- [ ] Setup Helmet với CSP headers
- [ ] Implement advanced rate limiting (standard/strict/auth)
- [ ] Validate environment variables at startup
- [ ] Sanitize error messages (don't expose internals)
- [ ] Hash sensitive data (passwords already done với bcrypt)
- [ ] Add request logging (không log passwords/tokens)
- [ ] Security audit checklist (OWASP Top 10)

---

### 6.2. Performance Optimization

#### A. Database Indexes (MongoDB)

```javascript
// 🔴 CẦN THÊM: Ensure indexes are created at startup

// src/models/user.model.js
userSchema.index({ email: 1 }, { unique: true });
userSchema.index({ role: 1, status: 1 });
userSchema.index({ subscriptionPlanId: 1, subscriptionStatus: 1 });

// src/models/subject.model.js
subjectSchema.index({ userId: 1, subjectName: 1 });
subjectSchema.index({ userId: 1, createdAt: -1 });

// src/models/document.model.js
documentSchema.index({ subjectId: 1, uploadedAt: -1 });
documentSchema.index({ ownerId: 1, uploadedAt: -1 });
documentSchema.index({ status: 1, updatedAt: -1 });

// src/models/questionSet.model.js
questionSetSchema.index({ userId: 1, subjectId: 1, status: 1, createdAt: -1 });
questionSetSchema.index({ sharedUrl: 1 }, { unique: true, sparse: true });
questionSetSchema.index({ status: 1, isShared: 1 });

// src/models/quizAttempt.model.js
quizAttemptSchema.index({ userId: 1, endTime: -1 });
quizAttemptSchema.index({ setId: 1, endTime: -1 });
quizAttemptSchema.index({ userId: 1, setId: 1, isCompleted: 1 });

// src/models/validationRequest.model.js
validationRequestSchema.index({ status: 1, requestTime: -1 });
validationRequestSchema.index({ expertId: 1, status: 1 });
validationRequestSchema.index({ learnerId: 1, status: 1 });
// Unique partial index: only 1 open request per set
validationRequestSchema.index(
  { setId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      status: { $in: ['PendingAssignment', 'Assigned'] },
    },
  }
);

// src/models/commissionRecord.model.js
commissionRecordSchema.index({ expertId: 1, status: 1, transactionDate: -1 });
commissionRecordSchema.index({ setId: 1, transactionDate: -1 });

// src/models/notification.model.js
notificationSchema.index({ userId: 1, isRead: 1, createdAt: -1 });
```

```javascript
// 🔴 CẦN THÊM: Index initialization helper

// src/utils/initIndexes.js
const mongoose = require('mongoose');
const logger = require('./logger');

async function ensureIndexes() {
  const models = mongoose.modelNames();
  
  for (const modelName of models) {
    const model = mongoose.model(modelName);
    try {
      await model.createIndexes();
      logger.info({ model: modelName }, 'Indexes created');
    } catch (error) {
      logger.error({ model: modelName, error: error.message }, 'Index creation failed');
    }
  }
}

module.exports = { ensureIndexes };
```

```javascript
// src/server.js
const { ensureIndexes } = require('./utils/initIndexes');

mongoose.connect(mongoUri).then(async () => {
  logger.info('MongoDB connected');
  await ensureIndexes();
  // Start server...
});
```

#### B. Query Optimization

```javascript
// 🔴 CẦN THÊM: Use .lean() and projections in repositories

// src/repositories/base.repository.js
class BaseRepository {
  async find(filter = {}, options = {}) {
    const {
      sort = {},
      page = 1,
      pageSize = 20,
      projection = null,
    } = options;

    const skip = (page - 1) * pageSize;

    let query = this.model.find(filter);

    if (projection) {
      query = query.select(projection);
    }

    query = query
      .sort(sort)
      .skip(skip)
      .limit(pageSize)
      .lean(); // 🔴 IMPORTANT: Return plain objects, not Mongoose documents

    const items = await query.exec();
    const totalItems = await this.model.countDocuments(filter);

    return {
      items: items.map(this.toDTO.bind(this)),
      meta: {
        page,
        pageSize,
        totalItems,
        totalPages: Math.ceil(totalItems / pageSize),
      },
    };
  }

  async findById(id, projection = null) {
    let query = this.model.findById(id);
    
    if (projection) {
      query = query.select(projection);
    }

    const doc = await query.lean().exec();
    return doc ? this.toDTO(doc) : null;
  }
}
```

```javascript
// Example: Don't fetch extractedText unless needed
async function getDocumentSummary(documentId) {
  // Only fetch summary fields
  const document = await DocumentsRepository.findById(documentId, {
    summaryShort: 1,
    summaryFull: 1,
    summaryUpdatedAt: 1,
    originalFileName: 1,
  });
  
  return document;
}
```

#### C. Caching Strategy

```javascript
// 🔴 CẦN THÊM: src/utils/cache.js

const { getRedisClient } = require('../config/redis');
const logger = require('./logger');

class CacheManager {
  constructor() {
    this.redis = getRedisClient();
    this.defaultTTL = 3600; // 1 hour
  }

  async get(key) {
    if (!this.redis) return null;
    
    try {
      const value = await this.redis.get(key);
      if (value) {
        logger.debug({ key }, 'Cache hit');
        return JSON.parse(value);
      }
      return null;
    } catch (error) {
      logger.warn({ key, error: error.message }, 'Cache get failed');
      return null;
    }
  }

  async set(key, value, ttl = null) {
    if (!this.redis) return;
    
    try {
      const ttlSeconds = ttl || this.defaultTTL;
      await this.redis.setex(key, ttlSeconds, JSON.stringify(value));
      logger.debug({ key, ttl: ttlSeconds }, 'Cache set');
    } catch (error) {
      logger.warn({ key, error: error.message }, 'Cache set failed');
    }
  }

  async del(key) {
    if (!this.redis) return;
    
    try {
      await this.redis.del(key);
      logger.debug({ key }, 'Cache deleted');
    } catch (error) {
      logger.warn({ key, error: error.message }, 'Cache delete failed');
    }
  }

  async delPattern(pattern) {
    if (!this.redis) return;
    
    try {
      const keys = await this.redis.keys(pattern);
      if (keys.length > 0) {
        await this.redis.del(...keys);
        logger.debug({ pattern, count: keys.length }, 'Cache pattern deleted');
      }
    } catch (error) {
      logger.warn({ pattern, error: error.message }, 'Cache pattern delete failed');
    }
  }

  buildKey(prefix, ...parts) {
    return `${prefix}:${parts.join(':')}`;
  }
}

const cache = new CacheManager();

module.exports = cache;
```

```javascript
// Usage example in services
const cache = require('../utils/cache');

class SubjectsService {
  async getSubject(subjectId) {
    // Try cache first
    const cacheKey = cache.buildKey('subject', subjectId);
    const cached = await cache.get(cacheKey);
    
    if (cached) return cached;

    // Fetch from DB
    const subject = await SubjectsRepository.findById(subjectId);
    
    // Cache for 1 hour
    await cache.set(cacheKey, subject, 3600);
    
    return subject;
  }

  async updateSubject(subjectId, data) {
    const subject = await SubjectsRepository.update(subjectId, data);
    
    // Invalidate cache
    const cacheKey = cache.buildKey('subject', subjectId);
    await cache.del(cacheKey);
    
    return subject;
  }
}
```

#### D. Connection Pooling

```javascript
// 🔴 CẦN THÊM: MongoDB connection options

// src/config/mongoose.js
const mongoose = require('mongoose');
const env = require('./env');
const logger = require('../utils/logger');

const mongooseOptions = {
  // Connection pool
  maxPoolSize: 10, // Max connections
  minPoolSize: 2,  // Min connections
  
  // Timeouts
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
  
  // Retry
  retryWrites: true,
  retryReads: true,
  
  // Performance
  autoIndex: env.nodeEnv !== 'production', // Don't auto-create indexes in prod
};

async function connectDB() {
  try {
    await mongoose.connect(env.mongoUri, mongooseOptions);
    logger.info('MongoDB connected');
    
    // Monitor connection
    mongoose.connection.on('error', (err) => {
      logger.error({ error: err.message }, 'MongoDB connection error');
    });
    
    mongoose.connection.on('disconnected', () => {
      logger.warn('MongoDB disconnected');
    });
    
    mongoose.connection.on('reconnected', () => {
      logger.info('MongoDB reconnected');
    });
    
  } catch (error) {
    logger.error({ error: error.message }, 'MongoDB connection failed');
    process.exit(1);
  }
}

module.exports = { connectDB, mongooseOptions };
```

#### Checklist - Performance

- [ ] Create all required indexes in Mongoose schemas
- [ ] Implement index initialization at startup
- [ ] Use `.lean()` for read-only queries
- [ ] Use projections to limit fields returned
- [ ] Implement caching layer (Redis)
- [ ] Cache frequently accessed data (subjects, subscription plans)
- [ ] Invalidate cache on updates
- [ ] Configure MongoDB connection pool
- [ ] Monitor slow queries (enable MongoDB profiling)
- [ ] Add query explain plans in development

---

## Week 7: Logging, Monitoring & Production Config

### 7.1. Structured Logging

#### A. Enhanced Logger

```javascript
// 🔴 CẦN THÊM: src/utils/logger.js (enhance)

const pino = require('pino');
const env = require('../config/env');

const logLevel = env.logLevel || (env.nodeEnv === 'production' ? 'info' : 'debug');

const logger = pino({
  level: logLevel,
  
  // Production: JSON format for log aggregators
  // Development: Pretty print
  transport: env.nodeEnv !== 'production' 
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname',
        },
      }
    : undefined,
  
  // Base fields
  base: {
    env: env.nodeEnv,
    service: 'learinal-api',
  },
  
  // Redact sensitive fields
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'password',
      'token',
      'apiKey',
      'secret',
    ],
    censor: '[REDACTED]',
  },
  
  // Serializers
  serializers: {
    req: (req) => ({
      id: req.id,
      method: req.method,
      url: req.url,
      query: req.query,
      params: req.params,
      userAgent: req.headers['user-agent'],
      userId: req.user?.id,
    }),
    res: (res) => ({
      statusCode: res.statusCode,
    }),
    err: pino.stdSerializers.err,
  },
});

module.exports = logger;
```

#### B. Request Logging Middleware

```javascript
// 🔴 CẦN THÊM: src/middleware/requestLogger.js

const logger = require('../utils/logger');

function requestLogger(req, res, next) {
  const startTime = Date.now();

  // Log request
  logger.info({
    req,
    requestId: req.id,
  }, 'Incoming request');

  // Log response
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    
    const logData = {
      req,
      res,
      requestId: req.id,
      duration,
      userId: req.user?.id,
    };

    if (res.statusCode >= 500) {
      logger.error(logData, 'Request completed with server error');
    } else if (res.statusCode >= 400) {
      logger.warn(logData, 'Request completed with client error');
    } else {
      logger.info(logData, 'Request completed');
    }
  });

  next();
}

module.exports = requestLogger;
```

```javascript
// src/app.js
const requestLogger = require('./middleware/requestLogger');

app.use(requestLogger);
```

#### C. Correlation IDs

```javascript
// src/middleware/requestId.js (already exists, enhance)
const { v4: uuidv4 } = require('uuid');

function requestId(req, res, next) {
  // Use existing request ID from header or generate new
  req.id = req.headers['x-request-id'] || uuidv4();
  
  // Set response header
  res.setHeader('X-Request-ID', req.id);
  
  next();
}

module.exports = requestId;
```

### 7.2. Health Checks (Deep)

```javascript
// 🔴 CẦN THÊM: src/services/health.service.js (enhance)

const mongoose = require('mongoose');
const { getRedisClient } = require('../config/redis');
const axios = require('axios');
const logger = require('../utils/logger');

class HealthService {
  static async checkHealth() {
    const checks = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      checks: {
        database: await this.checkDatabase(),
        redis: await this.checkRedis(),
        llm: await this.checkLLM(),
        storage: await this.checkStorage(),
        email: await this.checkEmail(),
      },
    };

    // Overall status
    const hasFailures = Object.values(checks.checks).some(check => check.status === 'unhealthy');
    checks.status = hasFailures ? 'unhealthy' : 'healthy';

    return checks;
  }

  static async checkDatabase() {
    try {
      const state = mongoose.connection.readyState;
      // 0 = disconnected, 1 = connected, 2 = connecting, 3 = disconnecting
      
      if (state === 1) {
        // Ping database
        await mongoose.connection.db.admin().ping();
        return {
          status: 'healthy',
          message: 'MongoDB connected',
          responseTime: Date.now(),
        };
      }
      
      return {
        status: 'unhealthy',
        message: `MongoDB connection state: ${state}`,
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        message: error.message,
      };
    }
  }

  static async checkRedis() {
    try {
      const redis = getRedisClient();
      if (!redis) {
        return {
          status: 'degraded',
          message: 'Redis not configured',
        };
      }

      const start = Date.now();
      await redis.ping();
      const responseTime = Date.now() - start;

      return {
        status: 'healthy',
        message: 'Redis connected',
        responseTime,
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        message: error.message,
      };
    }
  }

  static async checkLLM() {
    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return {
          status: 'degraded',
          message: 'LLM API key not configured',
        };
      }

      // Simple ping to Gemini API (lightweight request)
      const url = 'https://generativelanguage.googleapis.com/v1/models?key=' + apiKey;
      const start = Date.now();
      await axios.get(url, { timeout: 5000 });
      const responseTime = Date.now() - start;

      return {
        status: 'healthy',
        message: 'Gemini API reachable',
        responseTime,
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        message: error.message,
      };
    }
  }

  static async checkStorage() {
    try {
      const provider = process.env.STORAGE_PROVIDER || 'local';
      
      if (provider === 'local') {
        return {
          status: 'healthy',
          message: 'Local storage configured',
        };
      }

      if (provider === 's3') {
        const { S3Client, ListBucketsCommand } = require('@aws-sdk/client-s3');
        const s3 = new S3Client({ region: process.env.S3_REGION });
        
        const start = Date.now();
        await s3.send(new ListBucketsCommand({}));
        const responseTime = Date.now() - start;

        return {
          status: 'healthy',
          message: 'S3 connected',
          responseTime,
        };
      }

      return {
        status: 'unknown',
        message: `Unknown storage provider: ${provider}`,
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        message: error.message,
      };
    }
  }

  static async checkEmail() {
    try {
      const provider = process.env.EMAIL_PROVIDER || 'sendgrid';
      
      if (provider === 'sendgrid') {
        const apiKey = process.env.SENDGRID_API_KEY;
        if (!apiKey) {
          return {
            status: 'degraded',
            message: 'SendGrid API key not configured',
          };
        }

        // Lightweight check: validate API key format
        return {
          status: 'healthy',
          message: 'SendGrid configured',
        };
      }

      return {
        status: 'healthy',
        message: `${provider} configured`,
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        message: error.message,
      };
    }
  }
}

module.exports = HealthService;
```

```javascript
// src/controllers/health.controller.js (enhance)
async function getHealth(req, res) {
  const health = await HealthService.checkHealth();
  
  const statusCode = health.status === 'healthy' ? 200 : 503;
  res.status(statusCode).json(health);
}
```

### 7.3. Metrics & Monitoring

```javascript
// 🔴 CẦN THÊM: src/utils/metrics.js

class MetricsCollector {
  constructor() {
    this.metrics = {
      requests: {
        total: 0,
        byStatus: {},
        byMethod: {},
        byEndpoint: {},
      },
      latency: {
        p50: 0,
        p95: 0,
        p99: 0,
      },
      errors: {
        total: 0,
        byType: {},
      },
      workers: {
        jobsProcessed: 0,
        jobsFailed: 0,
        avgProcessingTime: 0,
      },
    };
  }

  recordRequest(method, endpoint, statusCode, duration) {
    this.metrics.requests.total += 1;
    
    this.metrics.requests.byStatus[statusCode] = 
      (this.metrics.requests.byStatus[statusCode] || 0) + 1;
    
    this.metrics.requests.byMethod[method] = 
      (this.metrics.requests.byMethod[method] || 0) + 1;
    
    this.metrics.requests.byEndpoint[endpoint] = 
      (this.metrics.requests.byEndpoint[endpoint] || 0) + 1;

    // Update latency (simplified, use proper percentile calculation in production)
    // Consider using libraries like: prom-client, hot-shots
  }

  recordError(errorType) {
    this.metrics.errors.total += 1;
    this.metrics.errors.byType[errorType] = 
      (this.metrics.errors.byType[errorType] || 0) + 1;
  }

  recordWorkerJob(jobType, success, duration) {
    if (success) {
      this.metrics.workers.jobsProcessed += 1;
    } else {
      this.metrics.workers.jobsFailed += 1;
    }
    
    // Update avg processing time (simplified)
  }

  getMetrics() {
    return this.metrics;
  }

  reset() {
    // Reset metrics (for periodic snapshots)
    this.metrics = {
      requests: { total: 0, byStatus: {}, byMethod: {}, byEndpoint: {} },
      latency: { p50: 0, p95: 0, p99: 0 },
      errors: { total: 0, byType: {} },
      workers: { jobsProcessed: 0, jobsFailed: 0, avgProcessingTime: 0 },
    };
  }
}

const metrics = new MetricsCollector();

module.exports = metrics;
```

```javascript
// 🔴 CẦN THÊM: GET /metrics endpoint (for Prometheus or monitoring)

// src/routes/metrics.routes.js
const express = require('express');
const router = express.Router();
const metrics = require('../utils/metrics');
const authenticateJWT = require('../middleware/authenticateJWT');
const authorizeRole = require('../middleware/authorizeRole');

router.get(
  '/metrics',
  authenticateJWT,
  authorizeRole('Admin'),
  (req, res) => {
    res.status(200).json(metrics.getMetrics());
  }
);

module.exports = router;
```

### 7.4. Graceful Shutdown

```javascript
// 🔴 CẦN THÊM: src/server.js (enhance shutdown)

const mongoose = require('mongoose');
const { closeRedis } = require('./config/redis');
const logger = require('./utils/logger');

let server;

function startServer() {
  const PORT = env.port;
  server = app.listen(PORT, () => {
    logger.info({ port: PORT }, 'Server started');
  });
}

async function gracefulShutdown(signal) {
  logger.info({ signal }, 'Shutdown signal received, closing server gracefully');

  // Stop accepting new requests
  if (server) {
    server.close(() => {
      logger.info('HTTP server closed');
    });
  }

  try {
    // Close database connections
    await mongoose.connection.close();
    logger.info('MongoDB connection closed');

    // Close Redis connection
    await closeRedis();
    logger.info('Redis connection closed');

    // Give workers time to finish current jobs (if integrated with worker process)
    // await closeWorkers();

    logger.info('Graceful shutdown completed');
    process.exit(0);
  } catch (error) {
    logger.error({ error: error.message }, 'Error during shutdown');
    process.exit(1);
  }
}

// Listen for termination signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  logger.fatal({ error }, 'Uncaught exception');
  gracefulShutdown('uncaughtException');
});

process.on('unhandledRejection', (reason) => {
  logger.fatal({ reason }, 'Unhandled promise rejection');
  gracefulShutdown('unhandledRejection');
});

module.exports = { startServer, gracefulShutdown };
```

### 7.5. Environment-specific Configs

```javascript
// 🔴 CẦN THÊM: .env.example

NODE_ENV=development
PORT=3000

# Database
MONGO_URI=mongodb://localhost:27017/learinal
MONGO_DB_NAME=learinal

# JWT
JWT_SECRET=change-me-in-production
JWT_EXPIRES_IN=1h
JWT_REFRESH_SECRET=change-me-refresh-in-production
JWT_REFRESH_EXPIRES_IN=7d

# OAuth
GOOGLE_CLIENT_ID=your-client-id
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_REDIRECT_URI=http://localhost:3000/auth/callback

# Redis
REDIS_URL=redis://localhost:6379

# LLM (Gemini)
GEMINI_API_KEY=your-gemini-api-key
GEMINI_MODEL=gemini-1.5-flash
LLM_CACHE_ENABLED=true

# Storage
STORAGE_PROVIDER=s3
S3_REGION=us-east-1
S3_BUCKET=learinal-documents
S3_ACCESS_KEY=your-access-key
S3_SECRET_KEY=your-secret-key

# Email
EMAIL_PROVIDER=sendgrid
SENDGRID_API_KEY=your-sendgrid-key

# Payment
STRIPE_SECRET_KEY=your-stripe-key
STRIPE_WEBHOOK_SECRET=your-webhook-secret

# App
APP_BASE_URL=http://localhost:3000
CORS_ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5173

# Logging
LOG_LEVEL=debug
```

```javascript
// 🔴 CẦN THÊM: .env.production.example

NODE_ENV=production
PORT=3000

# Use environment-specific values
# MONGO_URI=mongodb+srv://...
# REDIS_URL=redis://...
# etc.

LOG_LEVEL=info
```

#### Checklist - Infrastructure

- [ ] Implement structured logging với Pino
- [ ] Add request logging middleware với correlation IDs
- [ ] Implement deep health checks (DB, Redis, external services)
- [ ] Add metrics collection
- [ ] Expose /metrics endpoint (Admin only)
- [ ] Implement graceful shutdown
- [ ] Handle uncaught exceptions/rejections
- [ ] Create .env.example files
- [ ] Document all environment variables
- [ ] Setup environment-specific configs (dev/staging/prod)

---

**Tiếp tục với PHASE_4_TESTING.md và PHASE_5_DEPLOYMENT.md...**
