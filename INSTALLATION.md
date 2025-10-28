# Learinal Backend - Setup & Installation Guide

Complete guide to set up and run the Learinal backend on your local machine or production environment.

---

## 📋 Prerequisites

### Required Software
- **Node.js**: v18 or later ([Download](https://nodejs.org/))
- **MongoDB**: v6.0 or later ([Download](https://www.mongodb.com/try/download/community))
- **Redis**: v7.0 or later ([Download](https://redis.io/download/))
- **npm** or **yarn**: Comes with Node.js

### External Services (Required for Full Functionality)
1. **Google OAuth** (Authentication)
   - Create app at [Google Cloud Console](https://console.cloud.google.com/)
   - Enable Google+ API
   - Create OAuth 2.0 credentials

2. **Google Gemini API** (LLM for question generation)
   - Get API key at [Google AI Studio](https://makersuite.google.com/app/apikey)

3. **Email Provider** (Choose one):
   - **SendGrid**: [Sign up](https://sendgrid.com/)
   - **AWS SES**: [Setup](https://aws.amazon.com/ses/)

4. **Storage Provider** (Choose one):
   - **AWS S3**: [Setup](https://aws.amazon.com/s3/)
   - **Cloudinary**: [Sign up](https://cloudinary.com/)

5. **Stripe** (Optional - for payments)
   - [Sign up](https://stripe.com/)

---

## 🚀 Quick Start (Local Development)

### 1. Clone the Repository
```bash
git clone <repository-url>
cd Learinal-BE
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Environment Configuration
Create a `.env` file in the root directory:

```env
# Server Configuration
NODE_ENV=development
PORT=3000
BASE_URL=http://localhost:3000

# Database
MONGODB_URI=mongodb://localhost:27017/learinal-dev
REDIS_URL=redis://localhost:6379

# Authentication
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
JWT_REFRESH_SECRET=your-super-secret-refresh-key-change-this-too
JWT_EXPIRES_IN=1h
JWT_REFRESH_EXPIRES_IN=7d

# Google OAuth
GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-google-client-secret
GOOGLE_REDIRECT_URI=http://localhost:3000/auth/callback

# Google Gemini API (LLM)
GEMINI_API_KEY=your-gemini-api-key

# Email (SendGrid)
SENDGRID_API_KEY=your-sendgrid-api-key
FROM_EMAIL=noreply@learinal.com
FROM_NAME=Learinal

# OR Email (AWS SES)
# AWS_SES_REGION=us-east-1
# AWS_SES_ACCESS_KEY=your-aws-access-key
# AWS_SES_SECRET_KEY=your-aws-secret-key

# Storage (AWS S3)
AWS_S3_BUCKET=learinal-uploads-dev
AWS_S3_REGION=us-east-1
AWS_S3_ACCESS_KEY=your-aws-access-key
AWS_S3_SECRET_KEY=your-aws-secret-key

# OR Storage (Cloudinary)
# CLOUDINARY_CLOUD_NAME=your-cloud-name
# CLOUDINARY_API_KEY=your-api-key
# CLOUDINARY_API_SECRET=your-api-secret

# Stripe (Optional - TBC)
# STRIPE_SECRET_KEY=sk_test_...
# STRIPE_WEBHOOK_SECRET=whsec_...

# Rate Limiting
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=60
```

### 4. Start MongoDB and Redis

#### Option A: Local Installation
```bash
# Start MongoDB
mongod --dbpath ./data/db

# Start Redis (in another terminal)
redis-server
```

#### Option B: Docker
```bash
# Start MongoDB
docker run -d -p 27017:27017 --name mongodb mongo:6

# Start Redis
docker run -d -p 6379:6379 --name redis redis:7-alpine
```

### 5. Run the Application

#### Development Mode (with hot reload)
```bash
# Start API server
npm run dev

# Start background worker (in another terminal)
npm run worker
```

#### Production Mode
```bash
# Start API server
npm start

# Start background worker (in another terminal)
npm run worker
```

### 6. Verify Installation

Visit http://localhost:3000/health - you should see:
```json
{
  "status": "ok",
  "timestamp": "2025-01-30T..."
}
```

---

## 🧪 Running Tests

### Install Test Dependencies
```bash
npm install --save-dev jest mongodb-memory-server
```

### Run Tests
```bash
# All tests
npm test

# Unit tests only
npm run test:unit

# Integration tests only
npm run test:integration

# Smoke tests
npm run test:smoke

# With coverage report
npm run test:coverage

# Watch mode (re-run on changes)
npm run test:watch
```

### View Coverage Report
After running `npm run test:coverage`, open:
```
coverage/lcov-report/index.html
```

---

## 📁 Project Structure

```
Learinal-BE/
├── src/
│   ├── adapters/        # External service clients (LLM, Email, Storage)
│   ├── config/          # Configuration files
│   ├── controllers/     # HTTP request handlers
│   ├── jobs/            # Background job handlers
│   ├── middleware/      # Express middleware
│   ├── models/          # Mongoose schemas
│   ├── repositories/    # Database access layer
│   ├── routes/          # API route definitions
│   ├── services/        # Business logic
│   ├── utils/           # Helper functions
│   ├── app.js           # Express app setup
│   ├── server.js        # HTTP server entry point
│   └── worker.js        # Background worker entry point
├── tests/               # Test suites
├── docs/                # Documentation
├── uploads/             # Temporary file uploads (git-ignored)
├── .env                 # Environment variables (git-ignored)
├── package.json
└── README.md
```

---

## 🔧 Common Setup Issues

### Issue: MongoDB Connection Error
**Error**: `MongooseServerSelectionError: connect ECONNREFUSED`

**Solution**:
1. Check MongoDB is running: `mongosh` or `mongo`
2. Verify MONGODB_URI in `.env`
3. Check firewall/network settings

### Issue: Redis Connection Error
**Error**: `Error: connect ECONNREFUSED 127.0.0.1:6379`

**Solution**:
1. Check Redis is running: `redis-cli ping` (should return PONG)
2. Verify REDIS_URL in `.env`
3. Try: `redis-server` to start Redis

### Issue: JWT Authentication Fails
**Error**: `401 Unauthorized`

**Solution**:
1. Verify JWT_SECRET is set in `.env`
2. Check token format: `Bearer <token>`
3. Ensure token hasn't expired (default 1 hour)

### Issue: File Upload Fails
**Error**: `413 Payload Too Large` or `500 Storage Error`

**Solution**:
1. Check file size (<20MB)
2. Verify file type (.pdf, .docx, .txt only)
3. Confirm AWS S3 credentials are correct
4. Check S3 bucket permissions (PutObject, GetObject)

### Issue: LLM Question Generation Fails
**Error**: `503 Service Unavailable` or `LLM Error`

**Solution**:
1. Verify GEMINI_API_KEY is valid
2. Check API quota/billing in Google AI Studio
3. Fallback to stub questions should work automatically

### Issue: Emails Not Sending
**Error**: `Email send failed`

**Solution**:
1. Verify SendGrid API key or AWS SES credentials
2. Check FROM_EMAIL is verified in SendGrid/SES
3. Review email templates in `src/jobs/notifications.email.js`

---

## 🔒 Security Checklist

### Before Deploying to Production:

- [ ] Change all default secrets (JWT_SECRET, etc.)
- [ ] Use strong, randomly generated secrets (min 32 characters)
- [ ] Enable HTTPS (TLS/SSL)
- [ ] Set NODE_ENV=production
- [ ] Configure CORS allowed origins
- [ ] Enable rate limiting (already configured)
- [ ] Review and restrict MongoDB/Redis network access
- [ ] Enable MongoDB authentication
- [ ] Use environment-specific .env files
- [ ] Never commit .env files to version control
- [ ] Rotate secrets regularly
- [ ] Enable database backups
- [ ] Set up monitoring and alerts
- [ ] Configure proper logging (no sensitive data)

---

## 📊 Monitoring & Logging

### Development Logging
Logs are output to console with Pino (structured JSON logs):
```bash
npm run dev
# Logs: {"level":30,"time":...,"msg":"Server started"}
```

### Production Logging (Recommended)
1. **Log Aggregation**: Use services like:
   - Datadog
   - New Relic
   - LogDNA/Mezmo
   - CloudWatch (AWS)

2. **Configure Log Level** in `.env`:
```env
LOG_LEVEL=info  # Options: trace, debug, info, warn, error, fatal
```

### Health Checks
- **Endpoint**: `GET /health`
- **Use for**: Kubernetes liveness/readiness probes, load balancer health checks

### Metrics to Monitor
- API response times (p50, p95, p99)
- Error rates (4xx, 5xx)
- Database connection pool
- Redis queue depth
- Background job processing times

---

## 🚢 Deployment

### Environment-Specific Configuration

#### Staging
```env
NODE_ENV=staging
BASE_URL=https://api-staging.learinal.com
MONGODB_URI=mongodb://staging-db.example.com/learinal
```

#### Production
```env
NODE_ENV=production
BASE_URL=https://api.learinal.com
MONGODB_URI=mongodb://prod-db.example.com/learinal
```

### Deployment Platforms

#### Heroku
```bash
# Install Heroku CLI
heroku create learinal-backend

# Add MongoDB addon
heroku addons:create mongolab:sandbox

# Add Redis addon
heroku addons:create heroku-redis:hobby-dev

# Set environment variables
heroku config:set JWT_SECRET=your-secret
heroku config:set GEMINI_API_KEY=your-key
# ... (set all required env vars)

# Deploy
git push heroku main

# Start worker
heroku ps:scale worker=1
```

#### AWS (EC2 + RDS + ElastiCache)
1. Set up EC2 instance (Ubuntu 20.04 LTS)
2. Install Node.js, PM2
3. Set up MongoDB Atlas or RDS
4. Set up ElastiCache (Redis)
5. Configure environment variables
6. Use PM2 for process management:

```bash
# Install PM2
npm install -g pm2

# Start API server
pm2 start src/server.js --name learinal-api

# Start worker
pm2 start src/worker.js --name learinal-worker

# Save PM2 config
pm2 save

# Setup auto-restart on reboot
pm2 startup
```

#### Docker
```dockerfile
# Dockerfile (create this file)
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3000
CMD ["node", "src/server.js"]
```

```bash
# Build image
docker build -t learinal-backend .

# Run container
docker run -d -p 3000:3000 --env-file .env learinal-backend
```

---

## 🛠️ Useful Commands

### Database Management
```bash
# Connect to MongoDB
mongosh learinal-dev

# View collections
show collections

# Query users
db.users.find().pretty()

# Create indexes (auto-created by Mongoose, but manual if needed)
db.questionsets.createIndex({ userId: 1, createdAt: -1 })
```

### Redis Management
```bash
# Connect to Redis
redis-cli

# Check queue
KEYS bull:*

# Monitor commands
MONITOR
```

### Debugging
```bash
# Enable debug mode
NODE_ENV=development DEBUG=* npm run dev

# Run with inspector (Chrome DevTools)
node --inspect src/server.js
```

---

## 📞 Support & Resources

### Documentation
- **API Documentation**: `docs/api/learinal-openapi.yaml` (OpenAPI spec)
- **Database Schema**: `docs/mongodb-schema.md`
- **System Design**: `docs/SDD_Learinal.md`
- **Test Guide**: `tests/README.md`

### Troubleshooting
1. Check logs for detailed error messages
2. Verify all environment variables are set
3. Ensure external services (MongoDB, Redis) are running
4. Review test suite for examples: `tests/`

### Community
- Report issues: [GitHub Issues](#)
- Questions: [Stack Overflow](#)
- Slack: [#learinal-dev](#)

---

## 🎓 Next Steps

After successful installation:

1. ✅ **Explore the API**: Import `docs/postman/Learinal.postman_collection.json` into Postman
2. ✅ **Read the OpenAPI Spec**: `docs/api/learinal-openapi.yaml`
3. ✅ **Run Tests**: `npm test` to verify everything works
4. ✅ **Review Code**: Start with `src/app.js` and follow the flow
5. ✅ **Set Up Frontend**: Connect your frontend app to `http://localhost:3000`

---

**Status**: ✅ Ready to Code!  
**Version**: 1.0.0  
**Last Updated**: 2025-01-30
