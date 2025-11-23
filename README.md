
# 🚀 Quick Start - Learinal Backend

Hướng dẫn nhanh để chạy dự án trong 5 phút!

---

## Phương án 1: Chạy Local (Development)

### Bước 1: Cài đặt Dependencies

```bash
# Clone repo
git clone https://github.com/ngthtrong/Learinal-BE.git
cd Learinal-BE

# Cài đặt packages
npm install
```

### Bước 2: Chuẩn bị Database

**Option A: Docker (Recommended)**

```bash
# Chạy MongoDB
docker run -d -p 27017:27017 --name learinal-mongo \
  -e MONGO_INITDB_ROOT_USERNAME=admin \
  -e MONGO_INITDB_ROOT_PASSWORD=adminpass \
  mongo:7

# Chạy Redis
docker run -d -p 6379:6379 --name learinal-redis redis:7-alpine
```

**Option B: Local Installation**

- MongoDB: https://www.mongodb.com/docs/manual/installation/
- Redis: https://redis.io/docs/getting-started/installation/

### Bước 3: Tạo file .env

```bash
# Copy file mẫu
cp .env.example .env
```

**Nội dung .env tối thiểu:**

```env
NODE_ENV=development
PORT=3000

# Database
MONGO_URI=mongodb://admin:adminpass@localhost:27017/learinal-dev?authSource=admin
REDIS_URI=redis://localhost:6379

# JWT (generate random strings)
JWT_SECRET=my-super-secret-jwt-key-min-32-characters
JWT_REFRESH_SECRET=my-super-secret-refresh-key-min-32-characters

# LLM (cần ít nhất 1)
OPENAI_API_KEY=sk-your-openai-api-key
# hoặc
ANTHROPIC_API_KEY=sk-ant-your-anthropic-api-key

# Storage (local cho dev)
STORAGE_MODE=local

# Log
LOG_LEVEL=debug
```

### Bước 4: Seed dữ liệu (Optional)

```bash
npm run seed:plans
```

### Bước 5: Chạy Server

```bash
# Terminal 1: API Server
npm run dev

# Terminal 2: Background Worker (optional)
npm run worker
```

✅ **Server đang chạy tại:** http://localhost:3000

### Bước 6: Test API

```bash
# Health check
curl http://localhost:3000/health

# Expected response:
# {"status":"healthy","timestamp":"...","uptime":...}
```

---

## Phương án 2: Docker Compose (Fastest)

### Bước 1: Clone & Setup

```bash
git clone https://github.com/ngthtrong/Learinal-BE.git
cd Learinal-BE

# Tạo .env (xem nội dung ở trên)
cp .env.example .env
nano .env
```

### Bước 2: Chạy Docker Compose

```bash
# Development mode (with hot reload)
docker-compose -f docker-compose.dev.yml up

# Hoặc production mode
docker-compose up -d
```

✅ **Stack running:**

- MongoDB: `localhost:27017`
- Redis: `localhost:6379`
- Backend API: `localhost:3000`

### Bước 3: Kiểm tra logs

```bash
docker-compose logs -f backend
```

### Dừng stack

```bash
docker-compose down
```

---

## 🧪 Test API với các tools

### 1. cURL

```bash
# Health check
curl http://localhost:3000/health

# Deep health check
curl http://localhost:3000/health/deep

# Metrics
curl http://localhost:3000/metrics
```

### 2. Postman

Import collection từ: `docs/postman/Learinal.postman_collection.json`

### 3. OpenAPI/Swagger

Xem spec tại: `docs/api/learinal-openapi.yaml`

---

## 📝 Development Workflow

### 1. Chạy tests

```bash
# All tests
npm test

# Unit tests only
npm run test:unit

# Integration tests
npm run test:integration

# Watch mode
npm run test:watch
```

### 2. Lint & Format

```bash
# Check linting
npm run lint

# Fix linting issues
npm run lint:fix

# Format code
npm run format
```

### 3. Hot Reload

Server tự động restart khi code thay đổi (với `npm run dev`)

---

## 🔑 API Authentication Flow

### 1. Lấy Access Token (Development)

**Với OAuth stub mode:**

```bash
curl -X POST http://localhost:3000/api/v1/auth/exchange \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "google",
    "code": "test-code"
  }'
```

**Response:**

```json
{
  "accessToken": "eyJhbGci...",
  "refreshToken": "eyJhbGci...",
  "user": {...}
}
```

### 2. Sử dụng Access Token

```bash
curl http://localhost:3000/api/v1/users/me \
  -H "Authorization: Bearer eyJhbGci..."
```

### 3. Refresh Token

```bash
curl -X POST http://localhost:3000/api/v1/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{
    "refreshToken": "eyJhbGci..."
  }'
```

---

## 📊 Monitoring Endpoints

| Endpoint         | Description           |
| ---------------- | --------------------- |
| `/health`      | Basic health check    |
| `/healthz`     | Kubernetes liveness   |
| `/readyz`      | Kubernetes readiness  |
| `/livez`       | Liveness probe        |
| `/health/deep` | Full dependency check |
| `/metrics`     | Prometheus metrics    |

---

## 🐛 Troubleshooting

### MongoDB connection error

```bash
# Kiểm tra MongoDB
docker ps | grep mongo

# Xem logs
docker logs learinal-mongo

# Restart
docker restart learinal-mongo
```

### Redis connection error

```bash
# Test Redis connection
redis-cli ping

# Hoặc với Docker
docker exec -it learinal-redis redis-cli ping
```

### Port 3000 đã được sử dụng

```bash
# Windows
netstat -ano | findstr :3000
taskkill /PID <PID> /F

# Mac/Linux
lsof -i :3000
kill -9 <PID>
```

### Dependencies issues

```bash
# Clear cache và reinstall
rm -rf node_modules package-lock.json
npm install
```

---

## 📚 Next Steps

✅ Server đang chạy
✅ API responding

**Tiếp theo:**

1. Đọc [API Documentation](docs/api/learinal-openapi-overview.md)
2. Import [Postman Collection](docs/postman/Learinal.postman_collection.json)
3. Xem [Testing Guide](docs/TESTING_GUIDE.md)
4. Đọc [README.md](README.md) để hiểu full architecture

---

## 💡 Tips

### Tạo JWT Secret nhanh

```bash
# Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# OpenSSL
openssl rand -hex 32
```

### Clear Redis cache

```bash
redis-cli FLUSHALL

# Hoặc với Docker
docker exec -it learinal-redis redis-cli FLUSHALL
```

### Reset MongoDB database

```bash
# Drop database
mongosh "mongodb://admin:adminpass@localhost:27017/learinal-dev?authSource=admin" \
  --eval "db.dropDatabase()"

# Seed lại
npm run seed:plans
```

---

## 🎯 Common Tasks

### Tạo user mới (Manual)

```bash
curl -X POST http://localhost:3000/api/v1/auth/exchange \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "google",
    "code": "test-code",
    "email": "user@example.com"
  }'
```

### Upload document

```bash
curl -X POST http://localhost:3000/api/v1/documents \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "file=@/path/to/document.pdf" \
  -F "subjectId=SUBJECT_ID"
```

### Generate questions

```bash
curl -X POST http://localhost:3000/api/v1/question-sets/generate \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "subjectId": "SUBJECT_ID",
    "title": "Test Quiz",
    "numQuestions": 10,
    "difficulty": "Hiểu"
  }'
```

---

**Happy Coding! 🚀**
