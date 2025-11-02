# CI/CD & Deployment Guide

## Overview

This guide covers the complete CI/CD pipeline, Docker containerization, and deployment strategies for Learinal Backend.

**Last Updated:** December 2024  
**Phase:** 4.5 - CI/CD Pipeline

---

## Table of Contents

1. [CI/CD Pipeline](#cicd-pipeline)
2. [Docker Containerization](#docker-containerization)
3. [Environment Management](#environment-management)
4. [Deployment Strategies](#deployment-strategies)
5. [Rollback Procedures](#rollback-procedures)
6. [Database Migrations](#database-migrations)

---

## CI/CD Pipeline

### GitHub Actions Workflow

**File:** `.github/workflows/ci-cd.yml`

### Pipeline Stages

#### 1. **Lint & Format Check**
- Runs ESLint on codebase
- Checks code formatting with Prettier
- Fails if any violations found

```bash
npm run lint
npm run format:check
```

#### 2. **Test Suite**
- Runs unit tests
- Runs integration tests
- Generates coverage report
- Uploads to Codecov

**Test Environment:**
- MongoDB 7 (Docker service)
- Redis 7 (Docker service)
- Node.js 18.x

```bash
npm run test:unit
npm run test:integration
npm run test:coverage
```

#### 3. **Security Audit**
- npm audit for vulnerabilities
- Snyk security scanning
- Continues on non-critical issues

```bash
npm audit --audit-level=moderate
```

#### 4. **Build Docker Image**
- Multi-stage Docker build
- Pushes to Docker Hub
- Tags: `branch-sha`, `latest` (main only)
- Build cache optimization

#### 5. **Deploy to Staging**
- Triggered on `develop` branch
- Updates ECS/App Runner service
- Runs smoke tests
- Requires manual approval (optional)

#### 6. **Deploy to Production**
- Triggered on `main` branch
- Updates ECS/App Runner service
- Creates Sentry release
- Runs smoke tests
- Sends Slack notifications

### Required Secrets

Configure these in GitHub Settings → Secrets:

```yaml
# Docker
DOCKER_USERNAME: <docker-hub-username>
DOCKER_PASSWORD: <docker-hub-token>

# AWS
AWS_ACCESS_KEY_ID: <aws-access-key>
AWS_SECRET_ACCESS_KEY: <aws-secret-key>
AWS_REGION: <aws-region>

# Security
SNYK_TOKEN: <snyk-api-token>
CODECOV_TOKEN: <codecov-token>

# Monitoring
SENTRY_AUTH_TOKEN: <sentry-auth-token>
SENTRY_ORG: <sentry-organization>
SENTRY_PROJECT: <sentry-project>

# Notifications
SLACK_WEBHOOK_URL: <slack-webhook>
```

### Branch Strategy

```
main (production)
  ↑
develop (staging)
  ↑
feature/* (CI only, no deployment)
```

**Workflow:**
1. Create feature branch from `develop`
2. Push commits → triggers lint + test
3. Create PR to `develop` → full CI pipeline
4. Merge to `develop` → deploy to staging
5. Create PR to `main` → manual review
6. Merge to `main` → deploy to production

---

## Docker Containerization

### Multi-Stage Dockerfile

**File:** `Dockerfile`

#### Build Stages

1. **Base Stage**
   - Node.js 18 Alpine
   - Installs dumb-init (signal handling)
   - Copies package files

2. **Development Stage**
   - Installs all dependencies
   - Enables hot reload
   - Volume mounts for source code

3. **Build Stage**
   - Installs dependencies
   - Runs lint and tests
   - Prunes devDependencies

4. **Production Stage**
   - Non-root user (nodejs:1001)
   - Production dependencies only
   - Health check enabled
   - Security labels

### Docker Commands

**Build Production Image:**
```bash
docker build -t learinal-backend:latest .
```

**Build Development Image:**
```bash
docker build --target development -t learinal-backend:dev .
```

**Run Production Container:**
```bash
docker run -p 3000:3000 \
  -e MONGO_URI=<mongo-uri> \
  -e REDIS_URI=<redis-uri> \
  -e JWT_SECRET=<secret> \
  learinal-backend:latest
```

**Run with Docker Compose:**
```bash
# Production
docker-compose up -d

# Development (with hot reload)
docker-compose -f docker-compose.dev.yml up
```

### Docker Compose Services

#### Production (`docker-compose.yml`)

| Service | Image | Port | Purpose |
|---------|-------|------|---------|
| mongodb | mongo:7 | 27017 | Primary database |
| redis | redis:7-alpine | 6379 | Cache & queue |
| backend | learinal-backend | 3000 | API server |
| nginx | nginx:alpine | 80, 443 | Reverse proxy (optional) |

#### Development (`docker-compose.dev.yml`)

- Hot reload enabled
- Debug logging
- Source code volume mounts
- Development database

### Health Checks

**Docker Health Check:**
```dockerfile
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', ...)"
```

**Kubernetes Probes:**
```yaml
livenessProbe:
  httpGet:
    path: /livez
    port: 3000
  initialDelaySeconds: 40
  periodSeconds: 30

readinessProbe:
  httpGet:
    path: /readyz
    port: 3000
  initialDelaySeconds: 10
  periodSeconds: 5
```

---

## Environment Management

### Environment Files

```
.env.development  # Local development
.env.test         # CI/CD testing
.env.staging      # Staging environment
.env.production   # Production (never commit!)
```

### Required Environment Variables

#### Core
```bash
NODE_ENV=production
PORT=3000
LOG_LEVEL=info
```

#### Database
```bash
MONGO_URI=mongodb://user:pass@host:27017/learinal
REDIS_URI=redis://host:6379
```

#### Authentication
```bash
JWT_SECRET=<random-32-chars>
JWT_REFRESH_SECRET=<random-32-chars>
GOOGLE_CLIENT_ID=<google-oauth-id>
GOOGLE_CLIENT_SECRET=<google-oauth-secret>
FACEBOOK_APP_ID=<facebook-app-id>
FACEBOOK_APP_SECRET=<facebook-app-secret>
```

#### AWS Services
```bash
AWS_ACCESS_KEY_ID=<access-key>
AWS_SECRET_ACCESS_KEY=<secret-key>
AWS_REGION=us-east-1
AWS_S3_BUCKET=learinal-uploads
```

#### Payment
```bash
STRIPE_SECRET_KEY=sk_live_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx
SEPAY_API_KEY=<sepay-key>
```

#### AI Services
```bash
OPENAI_API_KEY=sk-xxx
ANTHROPIC_API_KEY=sk-ant-xxx
```

#### Monitoring
```bash
SENTRY_DSN=https://xxx@sentry.io/xxx
```

### Environment-Specific Configs

**Development:**
- `LOG_LEVEL=debug`
- MongoDB local instance
- Redis local instance
- Mock payment providers

**Staging:**
- `LOG_LEVEL=info`
- Managed MongoDB (Atlas)
- Managed Redis (ElastiCache)
- Stripe test mode

**Production:**
- `LOG_LEVEL=warn`
- Managed databases
- Full monitoring enabled
- Stripe live mode

---

## Deployment Strategies

### AWS ECS Deployment

**Task Definition:**
```json
{
  "family": "learinal-backend",
  "containerDefinitions": [{
    "name": "backend",
    "image": "dockerhub/learinal-backend:latest",
    "portMappings": [{"containerPort": 3000}],
    "environment": [...],
    "secrets": [...],
    "healthCheck": {
      "command": ["CMD-SHELL", "curl -f http://localhost:3000/health || exit 1"],
      "interval": 30,
      "timeout": 10,
      "retries": 3,
      "startPeriod": 40
    }
  }]
}
```

**Deployment Command:**
```bash
aws ecs update-service \
  --cluster production \
  --service learinal-backend \
  --force-new-deployment
```

### AWS App Runner Deployment

**apprunner.yaml:**
```yaml
version: 1.0
runtime: nodejs18
build:
  commands:
    build:
      - npm ci --production
run:
  command: npm start
  network:
    port: 3000
  env:
    - name: NODE_ENV
      value: production
```

### Kubernetes Deployment

**deployment.yaml:**
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: learinal-backend
spec:
  replicas: 3
  selector:
    matchLabels:
      app: learinal-backend
  template:
    metadata:
      labels:
        app: learinal-backend
    spec:
      containers:
      - name: backend
        image: dockerhub/learinal-backend:latest
        ports:
        - containerPort: 3000
        env:
        - name: NODE_ENV
          value: production
        livenessProbe:
          httpGet:
            path: /livez
            port: 3000
        readinessProbe:
          httpGet:
            path: /readyz
            port: 3000
```

### Blue-Green Deployment

1. Deploy new version (green) alongside old (blue)
2. Run smoke tests on green
3. Switch traffic to green
4. Monitor metrics for 30 minutes
5. Terminate blue if stable

**ECS Blue-Green:**
```bash
aws deploy create-deployment \
  --application-name learinal \
  --deployment-group-name production \
  --deployment-config-name CodeDeployDefault.ECSAllAtOnce
```

---

## Rollback Procedures

### Quick Rollback (5 minutes)

**ECS:**
```bash
# Rollback to previous task definition
aws ecs update-service \
  --cluster production \
  --service learinal-backend \
  --task-definition learinal-backend:PREVIOUS_REVISION
```

**Docker:**
```bash
# Use previous image tag
docker pull dockerhub/learinal-backend:main-abc123
docker-compose up -d
```

**Kubernetes:**
```bash
# Rollback deployment
kubectl rollout undo deployment/learinal-backend
kubectl rollout status deployment/learinal-backend
```

### Rollback Checklist

- [ ] Identify issue (errors, performance, bugs)
- [ ] Check logs and metrics
- [ ] Decide: rollback vs hotfix
- [ ] Execute rollback command
- [ ] Verify health endpoints
- [ ] Monitor for 15 minutes
- [ ] Notify team via Slack
- [ ] Create postmortem issue

### Database Rollback

**If migration fails:**
```bash
# Run down migration
npm run migrate:down

# Or restore from backup
mongorestore --uri="mongodb://..." --archive=backup.gz
```

---

## Database Migrations

### Migration Strategy

**Schema Changes:**
- Use MongoDB schema versioning
- Add fields without removing old ones
- Deprecate → migrate → remove (3-step process)

**Example Migration:**
```javascript
// scripts/migrations/add-subscription-tier.js
const mongoose = require('mongoose');
const User = require('../src/models/User');

async function up() {
  await User.updateMany(
    { subscriptionTier: { $exists: false } },
    { $set: { subscriptionTier: 'free' } }
  );
}

async function down() {
  await User.updateMany(
    {},
    { $unset: { subscriptionTier: '' } }
  );
}

module.exports = { up, down };
```

**Run Migration:**
```bash
node scripts/run-migration.js add-subscription-tier
```

### Zero-Downtime Migrations

**Step 1: Add New Field (Deploy v1.1)**
```javascript
// Reads old field, writes both old and new
user.email = req.body.email; // Old
user.emailAddress = req.body.email; // New
```

**Step 2: Backfill Data (Background Job)**
```javascript
// Copy old field to new field
await User.updateMany(
  { emailAddress: null },
  [{ $set: { emailAddress: '$email' } }]
);
```

**Step 3: Switch Reads (Deploy v1.2)**
```javascript
// Read from new field, write both
const email = user.emailAddress || user.email;
```

**Step 4: Remove Old Field (Deploy v1.3)**
```javascript
// Only use new field
const email = user.emailAddress;
```

---

## Monitoring Deployments

### Pre-Deployment Checks

- [ ] All tests passing
- [ ] No critical security vulnerabilities
- [ ] Staging tested for 24 hours
- [ ] Database migrations tested
- [ ] Rollback plan documented

### Post-Deployment Monitoring

**First 5 Minutes:**
- Health check status
- Error rate (should be < 1%)
- Response time (p95 < 500ms)

**First Hour:**
- Monitor Sentry for new errors
- Check Prometheus metrics
- Review application logs
- Test critical user flows

**First 24 Hours:**
- Daily active users (no drop)
- Payment success rate
- API error rates
- Database query performance

### Deployment Metrics

| Metric | Target | Critical |
|--------|--------|----------|
| Deployment Time | < 10 min | < 20 min |
| Downtime | 0 sec | < 30 sec |
| Error Spike | < 2x baseline | < 5x baseline |
| Rollback Time | < 5 min | < 10 min |

---

## Troubleshooting

### Deployment Fails

**Symptom:** ECS task fails to start

**Diagnosis:**
```bash
# Check task logs
aws logs tail /ecs/learinal-backend --follow

# Check task status
aws ecs describe-tasks --cluster production --tasks <task-id>
```

**Common Issues:**
- Missing environment variables
- Database connection timeout
- Health check failure
- Out of memory

### High Error Rate After Deployment

**Immediate Actions:**
1. Check Sentry for error patterns
2. Review CloudWatch logs
3. Compare with staging metrics
4. **If errors > 5%:** Rollback immediately

**Root Cause Analysis:**
- Breaking API changes
- Database query issues
- External service failures
- Configuration problems

---

## Related Documentation

- [Performance Guide](./PERFORMANCE_GUIDE.md)
- [Security Guide](./PHASE_4.2_SECURITY_COMPLETE.md)
- [Testing Guide](./TESTING_GUIDE.md)

---

**Phase 4.5 Complete** ✅

All phases of production hardening are now complete!
