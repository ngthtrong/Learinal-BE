# GIAI ĐOẠN 5: Deployment & CI/CD

**Thời gian:** 1 tuần  
**Mục tiêu:** Thiết lập pipeline tự động và triển khai production

---

## Week 10: CI/CD & Production Deployment

### 10.1. Environment Setup

#### A. Environment Variables

```bash
# 🔴 CẦN THÊM: .env.example

# Server
NODE_ENV=production
PORT=3000
BASE_URL=https://api.learinal.com

# Database
MONGODB_URI=mongodb+srv://user:password@cluster.mongodb.net/learinal?retryWrites=true&w=majority
MONGODB_MAX_POOL_SIZE=10
MONGODB_MIN_POOL_SIZE=2

# Redis
REDIS_HOST=redis.learinal.com
REDIS_PORT=6379
REDIS_PASSWORD=<strong-redis-password>
REDIS_TLS=true

# Auth
JWT_SECRET=<generate-strong-secret-min-32-chars>
JWT_EXPIRES_IN=15m
REFRESH_TOKEN_EXPIRES_IN=7d
GOOGLE_CLIENT_ID=<google-oauth-client-id>
GOOGLE_CLIENT_SECRET=<google-oauth-client-secret>
GOOGLE_REDIRECT_URI=https://api.learinal.com/auth/callback

# LLM
LLM_MODE=real
GEMINI_API_KEY=<google-gemini-api-key>
GEMINI_MODEL=gemini-1.5-flash

# Storage
STORAGE_MODE=s3
AWS_ACCESS_KEY_ID=<aws-access-key>
AWS_SECRET_ACCESS_KEY=<aws-secret-key>
AWS_REGION=us-east-1
AWS_S3_BUCKET=learinal-uploads

# Email
EMAIL_MODE=real
SENDGRID_API_KEY=<sendgrid-api-key>
SENDGRID_FROM_EMAIL=noreply@learinal.com
SENDGRID_FROM_NAME=Learinal

# Payment
PAYMENT_MODE=real
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PUBLISHABLE_KEY=pk_live_...

# Queue
QUEUE_MODE=real
BULL_BOARD_USERNAME=admin
BULL_BOARD_PASSWORD=<strong-password>

# Rate Limiting
RATE_LIMIT_STANDARD=60
RATE_LIMIT_STRICT=10

# CORS
CORS_ORIGINS=https://learinal.com,https://www.learinal.com

# Logging
LOG_LEVEL=info
```

```bash
# 🔴 CẦN TẠO: Môi trường riêng cho staging và production

# .env.staging
NODE_ENV=staging
BASE_URL=https://api-staging.learinal.com
MONGODB_URI=<staging-mongodb-uri>
...

# .env.production
NODE_ENV=production
BASE_URL=https://api.learinal.com
MONGODB_URI=<production-mongodb-uri>
...
```

#### B. Environment Validation

```javascript
// 🔴 CẦN CẬP NHẬT: src/config/env.js

const requiredEnvVars = {
  production: [
    'MONGODB_URI',
    'REDIS_HOST',
    'JWT_SECRET',
    'GOOGLE_CLIENT_ID',
    'GOOGLE_CLIENT_SECRET',
    'GEMINI_API_KEY',
    'AWS_ACCESS_KEY_ID',
    'AWS_SECRET_ACCESS_KEY',
    'AWS_S3_BUCKET',
    'SENDGRID_API_KEY',
    'STRIPE_SECRET_KEY',
    'STRIPE_WEBHOOK_SECRET',
  ],
  staging: [
    'MONGODB_URI',
    'JWT_SECRET',
    'GOOGLE_CLIENT_ID',
  ],
  development: [],
};

function validateEnvironment() {
  const env = process.env.NODE_ENV || 'development';
  const required = requiredEnvVars[env] || [];
  const missing = required.filter(key => !process.env[key]);

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables for ${env}: ${missing.join(', ')}`
    );
  }

  // Validate JWT_SECRET strength
  if (process.env.JWT_SECRET && process.env.JWT_SECRET.length < 32) {
    throw new Error('JWT_SECRET must be at least 32 characters long');
  }

  console.log(`✅ Environment validation passed for ${env}`);
}

validateEnvironment();
```

---

### 10.2. GitHub Actions CI/CD

#### A. CI Pipeline

```yaml
# 🔴 CẦN THÊM: .github/workflows/ci.yml

name: CI

on:
  pull_request:
    branches: [main, develop]
  push:
    branches: [develop]

jobs:
  lint-and-test:
    runs-on: ubuntu-latest

    services:
      mongodb:
        image: mongo:7.0
        ports:
          - 27017:27017
        env:
          MONGO_INITDB_ROOT_USERNAME: test
          MONGO_INITDB_ROOT_PASSWORD: test
      
      redis:
        image: redis:7-alpine
        ports:
          - 6379:6379

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '18'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Run linter
        run: npm run lint

      - name: Run tests
        run: npm run test:ci
        env:
          NODE_ENV: test
          MONGODB_URI: mongodb://test:test@localhost:27017/learinal-test?authSource=admin
          REDIS_HOST: localhost
          JWT_SECRET: test-secret-min-32-characters-long

      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          files: ./coverage/lcov.info
          fail_ci_if_error: true

      - name: Security audit
        run: npm audit --audit-level=moderate

  build:
    runs-on: ubuntu-latest
    needs: lint-and-test

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '18'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci --production

      - name: Build artifacts
        run: |
          echo "No build step required for Node.js"
          echo "Artifacts are source files + node_modules"
```

#### B. CD Pipeline (Staging)

```yaml
# 🔴 CẦN THÊM: .github/workflows/deploy-staging.yml

name: Deploy to Staging

on:
  push:
    branches: [develop]

jobs:
  deploy:
    runs-on: ubuntu-latest
    environment: staging

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '18'

      - name: Install dependencies
        run: npm ci --production

      - name: Deploy to Heroku Staging
        uses: akhileshns/heroku-deploy@v3.12.14
        with:
          heroku_api_key: ${{ secrets.HEROKU_API_KEY }}
          heroku_app_name: learinal-api-staging
          heroku_email: ${{ secrets.HEROKU_EMAIL }}
          env_file: .env.staging
          healthcheck: https://api-staging.learinal.com/health
          delay: 10

      - name: Run smoke tests
        run: |
          npm install -g newman
          newman run tests/postman/Learinal.postman_collection.json \
            -e tests/postman/staging.postman_environment.json \
            --bail

      - name: Notify Slack
        if: always()
        uses: 8398a7/action-slack@v3
        with:
          status: ${{ job.status }}
          text: 'Staging deployment completed'
          webhook_url: ${{ secrets.SLACK_WEBHOOK }}
```

#### C. CD Pipeline (Production)

```yaml
# 🔴 CẦN THÊM: .github/workflows/deploy-production.yml

name: Deploy to Production

on:
  push:
    tags:
      - 'v*.*.*'  # Trigger on version tags: v1.0.0, v1.0.1, etc.

jobs:
  deploy:
    runs-on: ubuntu-latest
    environment: production

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '18'

      - name: Install dependencies
        run: npm ci --production

      - name: Deploy to Heroku Production
        uses: akhileshns/heroku-deploy@v3.12.14
        with:
          heroku_api_key: ${{ secrets.HEROKU_API_KEY }}
          heroku_app_name: learinal-api-production
          heroku_email: ${{ secrets.HEROKU_EMAIL }}
          env_file: .env.production
          healthcheck: https://api.learinal.com/health
          delay: 15

      - name: Run smoke tests
        run: |
          npm install -g newman
          newman run tests/postman/Learinal.postman_collection.json \
            -e tests/postman/production.postman_environment.json \
            --bail

      - name: Rollback on failure
        if: failure()
        run: |
          heroku rollback -a learinal-api-production
          echo "Deployment failed. Rolled back to previous version."

      - name: Create GitHub Release
        if: success()
        uses: actions/create-release@v1
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        with:
          tag_name: ${{ github.ref }}
          release_name: Release ${{ github.ref }}
          draft: false
          prerelease: false

      - name: Notify Slack
        if: always()
        uses: 8398a7/action-slack@v3
        with:
          status: ${{ job.status }}
          text: 'Production deployment ${{ job.status }}'
          webhook_url: ${{ secrets.SLACK_WEBHOOK }}
```

---

### 10.3. Heroku Deployment

#### A. Procfile

```procfile
# 🔴 CẦN THÊM: Procfile

web: node src/server.js
worker: node src/worker.js
```

#### B. App Configuration

```bash
# 🔴 CẦN CHẠY: Heroku setup commands

# 1. Create Heroku apps
heroku create learinal-api-staging
heroku create learinal-api-production

# 2. Add MongoDB addon (hoặc sử dụng MongoDB Atlas)
heroku addons:create mongolab:sandbox -a learinal-api-staging
heroku addons:create mongolab:shared-cluster-1 -a learinal-api-production

# 3. Add Redis addon
heroku addons:create heroku-redis:mini -a learinal-api-staging
heroku addons:create heroku-redis:premium-0 -a learinal-api-production

# 4. Set environment variables
heroku config:set NODE_ENV=staging -a learinal-api-staging
heroku config:set JWT_SECRET=<strong-secret> -a learinal-api-staging
heroku config:set GEMINI_API_KEY=<api-key> -a learinal-api-staging
# ... repeat for all env vars

# 5. Scale dynos
heroku ps:scale web=1 worker=1 -a learinal-api-staging
heroku ps:scale web=2 worker=2 -a learinal-api-production

# 6. Enable auto-scaling (production only)
heroku ps:autoscale:enable -a learinal-api-production --min 2 --max 5

# 7. Setup logging
heroku logs:tail -a learinal-api-staging
```

#### C. Health Check Configuration

```json
// 🔴 CẦN THÊM: package.json (for Heroku)
{
  "engines": {
    "node": "18.x",
    "npm": "10.x"
  },
  "scripts": {
    "start": "node src/server.js",
    "worker": "node src/worker.js"
  }
}
```

---

### 10.4. Docker Deployment (Alternative)

#### A. Dockerfile

```dockerfile
# 🔴 CẦN THÊM: Dockerfile

FROM node:18-alpine AS base

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci --production && npm cache clean --force

# Copy source code
COPY . .

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 && \
    chown -R nodejs:nodejs /app

USER nodejs

EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

CMD ["node", "src/server.js"]
```

#### B. Docker Compose (for local testing)

```yaml
# 🔴 CẦN THÊM: docker-compose.yml

version: '3.9'

services:
  api:
    build: .
    ports:
      - '3000:3000'
    environment:
      - NODE_ENV=production
      - MONGODB_URI=mongodb://mongo:27017/learinal
      - REDIS_HOST=redis
      - REDIS_PORT=6379
    depends_on:
      - mongo
      - redis
    restart: unless-stopped

  worker:
    build: .
    command: node src/worker.js
    environment:
      - NODE_ENV=production
      - MONGODB_URI=mongodb://mongo:27017/learinal
      - REDIS_HOST=redis
    depends_on:
      - mongo
      - redis
    restart: unless-stopped

  mongo:
    image: mongo:7.0
    ports:
      - '27017:27017'
    volumes:
      - mongo-data:/data/db
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    ports:
      - '6379:6379'
    volumes:
      - redis-data:/data
    restart: unless-stopped

volumes:
  mongo-data:
  redis-data:
```

---

### 10.5. Database Migration Strategy

```javascript
// 🔴 CẦN THÊM: scripts/migrate.js

/**
 * Database migration script
 * Run before deploying new version that requires schema changes
 */

const mongoose = require('mongoose');
const { mongoConfig } = require('../src/config');

async function migrate() {
  try {
    await mongoose.connect(mongoConfig.uri, mongoConfig.options);
    console.log('Connected to MongoDB');

    // Example migration: Add indexes
    const db = mongoose.connection.db;
    
    // Add compound index for validationRequests
    await db.collection('validationrequests').createIndex(
      { setId: 1 },
      {
        unique: true,
        partialFilterExpression: {
          status: { $in: ['PendingAssignment', 'Assigned'] }
        }
      }
    );
    console.log('✅ Created partial unique index on validationrequests.setId');

    // Add index for documents.status + uploadedAt
    await db.collection('documents').createIndex(
      { status: 1, uploadedAt: -1 }
    );
    console.log('✅ Created index on documents.status + uploadedAt');

    // Add more migrations as needed...

    console.log('🎉 Migration completed successfully');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

migrate();
```

```json
// 🔴 CẦN THÊM: package.json script
{
  "scripts": {
    "migrate": "node scripts/migrate.js"
  }
}
```

---

### 10.6. Monitoring & Observability

#### A. Application Performance Monitoring (APM)

```javascript
// 🔴 CẦN THÊM: src/monitoring/apm.js (nếu dùng New Relic/Datadog)

/**
 * APM integration
 * Uncomment and configure based on chosen provider
 */

// New Relic
// require('newrelic');

// Datadog
// const tracer = require('dd-trace').init({
//   service: 'learinal-api',
//   env: process.env.NODE_ENV,
//   version: process.env.npm_package_version,
// });

// module.exports = tracer;
```

#### B. Error Tracking (Sentry)

```javascript
// 🔴 CẦN THÊM: src/monitoring/sentry.js

const Sentry = require('@sentry/node');
const { env } = require('../config');

if (env.nodeEnv === 'production' && env.sentryDsn) {
  Sentry.init({
    dsn: env.sentryDsn,
    environment: env.nodeEnv,
    tracesSampleRate: 0.1, // Sample 10% of transactions
    integrations: [
      new Sentry.Integrations.Http({ tracing: true }),
      new Sentry.Integrations.Express({ app: true }),
    ],
  });

  console.log('✅ Sentry error tracking initialized');
}

module.exports = Sentry;
```

```javascript
// 🔴 CẦN CẬP NHẬT: src/app.js

const Sentry = require('./monitoring/sentry');

// Add BEFORE all routes
if (process.env.NODE_ENV === 'production') {
  app.use(Sentry.Handlers.requestHandler());
  app.use(Sentry.Handlers.tracingHandler());
}

// ... routes ...

// Add AFTER all routes, BEFORE error handlers
if (process.env.NODE_ENV === 'production') {
  app.use(Sentry.Handlers.errorHandler());
}
```

#### C. Uptime Monitoring

```markdown
# 🔴 CẦN SETUP: External uptime monitoring

Khuyến nghị các dịch vụ miễn phí/freemium:
1. **UptimeRobot** (https://uptimerobot.com)
   - Monitor: https://api.learinal.com/health
   - Interval: 5 minutes
   - Alert: Email/Slack khi down

2. **Better Uptime** (https://betteruptime.com)
   - Monitor: https://api.learinal.com/health
   - Status page: https://status.learinal.com

3. **Pingdom** (trial/paid)
   - Real user monitoring
   - Performance insights
```

---

### 10.7. Backup & Disaster Recovery

#### A. MongoDB Backup

```bash
# 🔴 CẦN SETUP: Automated MongoDB backups

# Option 1: MongoDB Atlas (recommended)
# - Enable continuous backup trong Atlas dashboard
# - Retention: 7 days
# - Point-in-time restore

# Option 2: Manual backup script (nếu self-hosted)
#!/bin/bash
# scripts/backup-mongo.sh

DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/backups/mongodb"
MONGODB_URI="mongodb+srv://..."

mongodump --uri="$MONGODB_URI" --out="$BACKUP_DIR/$DATE"

# Upload to S3
aws s3 sync "$BACKUP_DIR/$DATE" "s3://learinal-backups/mongodb/$DATE"

# Cleanup old backups (keep last 7 days)
find "$BACKUP_DIR" -type d -mtime +7 -exec rm -rf {} \;
```

#### B. Redis Backup

```bash
# 🔴 CẦN SETUP: Redis persistence

# redis.conf (hoặc Heroku Redis config)
appendonly yes
appendfsync everysec
save 900 1
save 300 10
save 60 10000
```

---

### 10.8. Rollback Procedure

```markdown
# 🔴 CẦN TÀI LIỆU: docs/ROLLBACK_PROCEDURE.md

## Rollback Procedure

### Heroku Rollback

1. Check recent releases:
   ```bash
   heroku releases -a learinal-api-production
   ```

2. Rollback to previous version:
   ```bash
   heroku rollback -a learinal-api-production
   ```

3. Verify rollback:
   ```bash
   curl https://api.learinal.com/health
   ```

### Database Rollback

1. Stop application:
   ```bash
   heroku maintenance:on -a learinal-api-production
   ```

2. Restore database from backup:
   ```bash
   # MongoDB Atlas: Use point-in-time restore in dashboard
   # Or manual restore:
   mongorestore --uri="$MONGODB_URI" --drop /path/to/backup
   ```

3. Restart application:
   ```bash
   heroku maintenance:off -a learinal-api-production
   ```

### Emergency Contacts

- On-call engineer: [Phone/Slack]
- Database admin: [Contact]
- DevOps lead: [Contact]
```

---

## Deployment Checklist

### Pre-Deployment
- [ ] All tests passing (unit, integration, E2E)
- [ ] Code review approved
- [ ] Security audit clean
- [ ] Environment variables configured
- [ ] Database migrations prepared
- [ ] Backup verified
- [ ] Rollback plan documented

### Deployment
- [ ] CI/CD pipeline green
- [ ] Staging deployment successful
- [ ] Smoke tests passed on staging
- [ ] Production deployment triggered
- [ ] Health checks passing
- [ ] Smoke tests passed on production

### Post-Deployment
- [ ] Monitor error rates (first 30 minutes)
- [ ] Monitor performance metrics
- [ ] Verify critical flows (login, quiz, payment)
- [ ] Check logs for errors
- [ ] Update release notes
- [ ] Notify team

### Monitoring Setup
- [ ] APM configured (New Relic/Datadog)
- [ ] Error tracking enabled (Sentry)
- [ ] Uptime monitoring configured (UptimeRobot)
- [ ] Alerts configured (Slack/Email)
- [ ] Status page updated

---

## Release Process

### Version Numbering (Semantic Versioning)
- `v1.0.0` - Major release (breaking changes)
- `v1.1.0` - Minor release (new features, backward compatible)
- `v1.1.1` - Patch release (bug fixes)

### Release Workflow

1. **Feature development**
   - Branch: `feature/feature-name`
   - Target: `develop` branch

2. **Release preparation**
   - Create release branch: `release/v1.1.0`
   - Update version in `package.json`
   - Update CHANGELOG.md
   - Final testing on staging

3. **Production deployment**
   - Merge to `main`
   - Tag: `git tag v1.1.0`
   - Push tag: `git push origin v1.1.0`
   - GitHub Actions auto-deploys

4. **Post-release**
   - Monitor production
   - Merge `main` back to `develop`
   - Close milestone in GitHub

---

**KẾT THÚC GIAI ĐOẠN 5 - Production Readiness Plan hoàn thành!**
