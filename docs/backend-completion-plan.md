# Kế hoạch Hoàn thiện Backend Learinal

**Phiên bản:** 1.0  
**Ngày tạo:** 28/10/2025  
**Phạm vi:** Hoàn thiện toàn bộ backend MVP v0.1 theo SRS/SDD/OpenAPI

---

## 📋 Mục lục

1. [Tổng quan tình trạng hiện tại](#1-tổng-quan-tình-trạng-hiện-tại)
2. [Các công việc cần hoàn thành](#2-các-công-việc-cần-hoàn-thành)
3. [Kế hoạch chi tiết theo module](#3-kế-hoạch-chi-tiết-theo-module)
4. [Lộ trình triển khai 4 tuần](#4-lộ-trình-triển-khai-4-tuần)
5. [Tiêu chí nghiệm thu (DoD)](#5-tiêu-chí-nghiệm-thu-dod)
6. [Rủi ro và giải pháp](#6-rủi-ro-và-giải-pháp)
7. [Checklist tổng hợp](#7-checklist-tổng-hợp)

---

## 1. Tổng quan tình trạng hiện tại

### ✅ Đã hoàn thành

**Hạ tầng cơ bản:**
- ✅ Cấu trúc thư mục theo kiến trúc layered (Controller → Service → Repository)
- ✅ Mongoose models cho tất cả collections (users, subjects, documents, questionSets, quizAttempts, validationRequests, commissionRecords, subscriptionPlans, userSubscriptions, notifications)
- ✅ Cấu hình môi trường (config/env.js, mongo.js, redis.js, llm.js, email.js, storage.js, stripe.js, oauth.js)
- ✅ Logger (Pino)
- ✅ Routes structure cho tất cả resources

**Adapters (đã có skeleton):**
- ✅ LLMClient (Gemini API với retry/backoff)
- ✅ EmailClient
- ✅ StorageClient
- ✅ OAuthClient
- ✅ EventBus/Queue

**Middleware:**
- ✅ authenticateJWT
- ✅ authorizeRole
- ✅ errorHandler
- ✅ errorFormatter
- ✅ requestId
- ✅ rateLimit
- ✅ etag
- ✅ idempotencyKey
- ✅ inputValidation

**Repositories:**
- ✅ Tất cả repository files đã tạo (users, subjects, documents, questionSets, quizAttempts, validationRequests, commissionRecords, subscriptionPlans, userSubscriptions, notifications)

**Services:**
- ✅ Tất cả service files đã tạo

**Controllers:**
- ✅ Tất cả controller files đã tạo

### ⚠️ Cần hoàn thiện

**Implementation chưa đầy đủ:**
- ⚠️ Controllers: nhiều endpoint chỉ có skeleton, chưa implement logic đầy đủ
- ⚠️ Services: business logic chưa hoàn thiện, thiếu validation rules
- ⚠️ Repositories: các phương thức CRUD cơ bản chưa implement hết
- ⚠️ Jobs/Workers: chưa implement hoàn chỉnh các background jobs
- ⚠️ Integration giữa các modules chưa được test
- ⚠️ Tests: chỉ có smoke.placeholder.js

**Chức năng chưa hoàn thiện:**
- ⚠️ OAuth 2.0 flow (Google) - chưa integrate thật
- ⚠️ LLM integration - cần test và optimize prompts
- ⚠️ File upload/processing pipeline
- ⚠️ Question generation workflow
- ⚠️ Scoring algorithm với trọng số độ khó
- ⚠️ Validation request workflow (assign Expert, notifications)
- ⚠️ Commission calculation
- ⚠️ Subscription/Payment flow
- ⚠️ Stripe webhook handler
- ⚠️ Email templates và notification system

---

## 2. Các công việc cần hoàn thành

### A. Core Features (Ưu tiên cao)

#### A1. Authentication & Authorization
- [ ] Implement OAuth 2.0 flow với Google (exchange code → tokens)
- [ ] JWT refresh token mechanism
- [ ] Token validation và revocation
- [ ] Role-based access control (Learner/Expert/Admin)
- [ ] Ownership checks cho tài nguyên
- [ ] Session management

#### A2. User Management
- [ ] CRUD operations hoàn chỉnh cho users
- [ ] Profile update với ETag support
- [ ] Subscription status tracking
- [ ] Admin user management endpoints

#### A3. Document Management
- [ ] Upload flow (multipart hoặc pre-signed URL)
- [ ] File validation (size ≤20MB, types: .pdf/.docx/.txt)
- [ ] Status workflow: Uploading → Processing → Completed/Error
- [ ] Text extraction job (worker)
- [ ] Summary generation (short/full) job
- [ ] Document retrieval với authorization

#### A4. Question Set Management
- [ ] Generate questions từ document với LLM
- [ ] Prompt engineering cho Gemini API
- [ ] Parse và validate câu hỏi MCQ
- [ ] Enforce difficultyLevel (Biết/Hiểu/Vận dụng/Vận dụng cao)
- [ ] CRUD operations với ownership check
- [ ] Share link generation (unique URL)
- [ ] Idempotency cho generation requests

#### A5. Quiz Attempts & Scoring
- [ ] Start quiz attempt
- [ ] Submit answers
- [ ] Scoring algorithm với trọng số theo độ khó:
  ```
  Biết: 1.0
  Hiểu: 1.5
  Vận dụng: 2.0
  Vận dụng cao: 2.5
  ```
- [ ] Calculate percentage score
- [ ] Store attempt history
- [ ] Commission trigger khi complete

#### A6. Validation Workflow
- [ ] Create validation request
- [ ] Assign to Expert (manual hoặc auto)
- [ ] Expert review interface
- [ ] Update question set sau review
- [ ] Notifications cho Learner/Expert
- [ ] Status tracking (PendingAssignment/Assigned/Completed/Rejected)

#### A7. Notifications
- [ ] In-app notifications
- [ ] Email notifications via SendGrid/SES
- [ ] Email templates (review.assigned, review.completed, welcome, etc.)
- [ ] Mark as read functionality
- [ ] Pagination và filtering

#### A8. Subscriptions & Payments
- [ ] List subscription plans
- [ ] Create subscription (PendingPayment)
- [ ] Stripe payment integration
- [ ] Webhook handler cho payment events
- [ ] Entitlements enforcement
- [ ] Renewal tracking

#### A9. Commission System
- [ ] Calculate commission cho Expert reviews
- [ ] Record commission khi quiz completed
- [ ] Status tracking (Pending/Paid)
- [ ] Commission reports for Experts

### B. Infrastructure & Quality (Ưu tiên trung bình)

#### B1. Background Jobs
- [ ] document.ingestion (text extraction)
- [ ] content.summary (summarize documents)
- [ ] questions.generate (LLM question generation)
- [ ] notifications.email (send email)
- [ ] review.assigned (notify Expert)
- [ ] review.completed (notify Learner)
- [ ] Retry logic với exponential backoff
- [ ] Dead letter queue handling

#### B2. Data Validation & Constraints
- [ ] Input validation với Joi schemas
- [ ] Mongoose schema validators
- [ ] Indexes optimization
- [ ] Unique constraints (email, sharedUrl, validationRequest per set)
- [ ] Partial indexes cho validationRequests

#### B3. Error Handling & Logging
- [ ] Standardized error responses `{ code, message, details }`
- [ ] Error mapping (Mongoose → HTTP)
- [ ] Request correlation (requestId)
- [ ] Structured logging với userId/action
- [ ] Rate limit headers

#### B4. Testing
- [ ] Unit tests cho services (≥85% coverage)
- [ ] Integration tests cho repositories
- [ ] API contract tests (OpenAPI compliance)
- [ ] E2E tests cho critical flows
- [ ] Mock external services (LLM, Email, Storage)

#### B5. Security
- [ ] Input sanitization
- [ ] SQL/NoSQL injection prevention
- [ ] CORS configuration
- [ ] Helmet security headers
- [ ] Secrets management (env vars)
- [ ] File upload security (MIME validation, virus scan)

### C. Nice-to-Have (Ưu tiên thấp)

- [ ] API documentation (Swagger UI)
- [ ] Rate limiting per user/role
- [ ] Caching layer (Redis)
- [ ] Monitoring & metrics (Prometheus/Grafana)
- [ ] CI/CD pipeline
- [ ] Docker containerization
- [ ] Health checks nâng cao (DB/Queue/LLM status)

---

## 3. Kế hoạch chi tiết theo module

### Module 1: Auth & Users (BE1)

**Owner:** Backend Developer 1  
**Timeline:** Tuần 1-2

**Endpoints:**
- POST `/auth/exchange` - Exchange OAuth code for JWT
- POST `/auth/refresh` - Refresh access token
- GET `/users/me` - Get current user profile
- PATCH `/users/me` - Update profile (với ETag)
- GET `/admin/users` - List all users (Admin only)

**Tasks:**
1. ✅ Cấu trúc routes/controllers/services đã có
2. ⚠️ Implement OAuth 2.0 flow:
   - Tích hợp Google OAuth client
   - Exchange authorization code → Google tokens
   - Verify ID token
   - Create/update user record
   - Generate JWT access + refresh tokens
3. ⚠️ Implement refresh token flow:
   - Validate refresh token
   - Generate new access token
   - Rotate refresh token
4. ⚠️ Implement user profile:
   - GET với authorization
   - PATCH với ETag + ownership check
   - Validate input (fullName, email format)
5. ⚠️ Admin endpoints:
   - List users với pagination
   - Filter by role/status
   - Search by email
6. ⚠️ Tests:
   - Unit tests cho auth service
   - Integration tests cho OAuth flow
   - Contract tests cho endpoints

**Acceptance Criteria:**
- [ ] OAuth flow hoạt động với Google (dev + prod)
- [ ] JWT tokens được validate đúng
- [ ] Refresh token mechanism hoạt động
- [ ] ETag prevents concurrent updates
- [ ] RBAC enforced (Admin role required)
- [ ] Tests coverage ≥90%
- [ ] Compliant với OpenAPI spec

---

### Module 2: Subjects & Documents (BE2)

**Owner:** Backend Developer 2  
**Timeline:** Tuần 2-3

**Endpoints:**
- GET/POST `/subjects` - List/Create subjects
- GET/PATCH/DELETE `/subjects/{id}` - Subject operations
- POST `/documents` - Upload document
- GET `/documents/{id}` - Get document info
- GET `/documents/{id}/summary` - Get document summary

**Tasks:**
1. ✅ Cấu trúc cơ bản đã có
2. ⚠️ Implement Subjects CRUD:
   - Create với userId ownership
   - List với pagination, filter by userId
   - Update/Delete với ownership check
   - Validate subjectName, description
3. ⚠️ Document upload flow:
   - Multipart file upload (Multer)
   - File validation (size ≤20MB, types: .pdf/.docx/.txt)
   - MIME type validation
   - Upload to storage (local → S3)
   - Create document record (status: Uploading)
   - Trigger ingestion job
4. ⚠️ Implement StorageAdapter:
   - Local storage cho dev
   - S3 integration cho prod
   - Pre-signed URL generation
5. ⚠️ Background jobs:
   - document.ingestion: extract text (pdf-parse, mammoth)
   - content.summary: call LLM cho tóm tắt
   - Update document status (Processing → Completed/Error)
   - Error handling + retry logic
6. ⚠️ Document retrieval:
   - GET với authorization (owner hoặc shared)
   - Return summary (short/full)
7. ⚠️ Tests:
   - Unit tests cho services
   - Integration tests cho upload flow
   - Worker job tests (happy path + errors)

**Acceptance Criteria:**
- [ ] Upload flow hoạt động end-to-end
- [ ] File validation prevents malicious uploads
- [ ] Text extraction cho .pdf/.docx/.txt
- [ ] Summary generation qua LLM
- [ ] Status workflow đúng
- [ ] Storage adapter có thể swap (local/S3)
- [ ] Jobs có retry + DLQ
- [ ] Tests coverage ≥85%

---

### Module 3: Question Sets & Quiz (BE3)

**Owner:** Backend Developer 3  
**Timeline:** Tuần 3-4

**Endpoints:**
- GET `/question-sets` - List question sets
- POST `/question-sets/generate` - Generate from document
- GET/PATCH `/question-sets/{id}` - QuestionSet operations
- POST `/question-sets/{id}/share` - Generate share link
- POST `/quiz-attempts` - Start quiz
- GET `/quiz-attempts/{id}` - Get attempt
- POST `/quiz-attempts/{id}/submit` - Submit answers

**Tasks:**
1. ✅ Cấu trúc cơ bản đã có
2. ⚠️ Question generation:
   - Validate input (documentId, topics, difficulty, numQuestions)
   - Idempotency-Key support
   - Load document text
   - Build prompt cho LLM (Gemini)
   - Parse JSON response
   - Validate questions (MCQ format, 4 options, 1 correct)
   - Enforce difficultyLevel enum
   - Save to DB (status: Draft)
   - Return 201 (sync) hoặc 202 (async via job)
3. ⚠️ Prompt engineering:
   - Template cho Gemini API
   - Specify JSON format
   - Include difficulty levels
   - Handle parsing errors
4. ⚠️ QuestionSet CRUD:
   - List với pagination + filters (userId, subjectId, status)
   - Get với ownership/sharing check
   - Patch với ownership (edit questions, title, status)
   - Share link: generate unique URL, store in DB
5. ⚠️ Quiz attempt flow:
   - POST /quiz-attempts: create attempt (startTime)
   - Store setId, userId
   - GET /quiz-attempts/{id}: return attempt (không leak đáp án)
   - POST /quiz-attempts/{id}/submit:
     - Validate ownership
     - Check not already completed
     - Score answers theo trọng số độ khó
     - Calculate total score
     - Mark isCompleted, set endTime
     - Trigger commission record creation
6. ⚠️ Scoring algorithm:
   ```javascript
   const weights = {
     'Biết': 1.0,
     'Hiểu': 1.5,
     'Vận dụng': 2.0,
     'Vận dụng cao': 2.5
   };
   
   totalWeightedScore = questions.reduce((sum, q, idx) => {
     const isCorrect = userAnswers[idx].selectedOption === q.correctOption;
     return sum + (isCorrect ? weights[q.difficultyLevel] : 0);
   }, 0);
   
   maxWeightedScore = questions.reduce((sum, q) => sum + weights[q.difficultyLevel], 0);
   
   percentageScore = (totalWeightedScore / maxWeightedScore) * 100;
   ```
7. ⚠️ Tests:
   - Unit tests cho scoring logic (nhiều cases)
   - Integration tests cho generation flow
   - Mock LLM responses
   - Edge cases (empty questions, invalid difficulty)

**Acceptance Criteria:**
- [ ] Question generation qua LLM hoạt động
- [ ] Idempotency-Key prevents duplicates
- [ ] difficultyLevel validation enforced
- [ ] Share link generation unique
- [ ] Quiz scoring algorithm đúng
- [ ] Commission trigger khi submit
- [ ] Tests coverage ≥85%
- [ ] Compliant với OpenAPI

---

### Module 4: Validation Workflow (BE4)

**Owner:** Backend Developer 1 hoặc 2  
**Timeline:** Tuần 3-4

**Endpoints:**
- POST `/question-sets/{id}/review` - Request validation
- GET `/validation-requests` - List requests (Expert/Admin)
- GET `/validation-requests/{id}` - Get request detail
- PATCH `/validation-requests/{id}` - Update status (assign, complete)

**Tasks:**
1. ✅ Cấu trúc cơ bản đã có
2. ⚠️ Create validation request:
   - Validate setId exists, owned by requester
   - Check no open request (PendingAssignment/Assigned) for this set
   - Create validationRequest record
   - Publish event `review.assigned`
   - Return 202 Accepted
3. ⚠️ List validation requests:
   - Admin: see all
   - Expert: see assigned to them
   - Learner: see their own requests
   - Pagination + filters (status, expertId)
4. ⚠️ Assign Expert (Admin/Auto):
   - PATCH với status=Assigned, expertId
   - Validate Expert role
   - Send notification to Expert
5. ⚠️ Complete review:
   - Expert PATCH với status=Completed, feedback
   - Update questionSet (apply edits if needed)
   - Calculate commission
   - Notify Learner
6. ⚠️ Unique constraint:
   - Partial index: `{ setId: 1 }` unique where `status IN ('PendingAssignment','Assigned')`
   - Handle conflict error → 409
7. ⚠️ Notifications:
   - Email to Expert khi assigned
   - Email to Learner khi completed
   - In-app notifications
8. ⚠️ Tests:
   - Workflow tests (create → assign → complete)
   - Constraint tests (duplicate request)
   - Authorization tests (role checks)

**Acceptance Criteria:**
- [ ] Validation request workflow hoàn chỉnh
- [ ] Unique constraint enforced
- [ ] Expert assignment hoạt động
- [ ] Notifications gửi đúng
- [ ] Commission tính khi complete
- [ ] Tests coverage ≥85%

---

### Module 5: Notifications & Email (BE5)

**Owner:** Backend Developer 3  
**Timeline:** Tuần 4

**Endpoints:**
- GET `/notifications` - List user notifications
- PATCH `/notifications/{id}` - Mark as read

**Tasks:**
1. ✅ Cấu trúc cơ bản đã có
2. ⚠️ Notification service:
   - Create notification record
   - Consume events (review.assigned, review.completed, quiz.completed)
   - Store in notifications collection
3. ⚠️ Email adapter:
   - SendGrid/SES integration
   - Email templates (HTML)
   - Template data injection
4. ⚠️ Email templates:
   - welcome.html
   - review.assigned.html
   - review.completed.html
   - quiz.completed.html
   - validation.approved.html
5. ⚠️ Background job:
   - notifications.email: send emails asynchronously
   - Retry on failure
   - Track sent status
6. ⚠️ Endpoints:
   - GET /notifications: pagination, filter by isRead
   - PATCH /notifications/{id}: mark as read
7. ⚠️ Tests:
   - Mock email service
   - Verify templates render correctly
   - Integration tests cho notification flow

**Acceptance Criteria:**
- [ ] Notifications lưu vào DB
- [ ] Emails gửi qua SendGrid/SES
- [ ] Templates render đúng
- [ ] Mark as read hoạt động
- [ ] Tests coverage ≥80%

---

### Module 6: Subscriptions & Payments (BE6)

**Owner:** Backend Developer 2 hoặc 3  
**Timeline:** Tuần 4 (optional nếu còn thời gian)

**Endpoints:**
- GET `/subscription-plans` - List plans
- GET `/user-subscriptions/me` - My subscriptions
- POST `/subscriptions` - Create subscription
- POST `/webhooks/stripe` - Stripe webhook

**Tasks:**
1. ✅ Cấu trúc cơ bản đã có
2. ⚠️ Subscription plans:
   - Seed data (Free, Premium Monthly, Premium Yearly)
   - List endpoint (public)
3. ⚠️ Create subscription:
   - Validate planId
   - Create userSubscription (status: PendingPayment)
   - Create Stripe checkout session (TBC)
   - Return checkout URL
4. ⚠️ Stripe webhook:
   - Verify signature
   - Handle events:
     - checkout.session.completed → update status=Active
     - invoice.payment_failed → status=Expired
   - Update user.subscriptionStatus
5. ⚠️ Entitlements enforcement:
   - Check user's plan before expensive operations
   - Limits (maxValidationRequests, maxDocuments, etc.)
6. ⚠️ Tests:
   - Mock Stripe API
   - Webhook signature validation
   - Entitlements checks

**Acceptance Criteria:**
- [ ] Plans listing works
- [ ] Subscription creation (stub payment OK)
- [ ] Webhook handler (Stripe integration TBC)
- [ ] Entitlements enforced
- [ ] Tests coverage ≥80%

---

### Module 7: Commission Records (BE7)

**Owner:** Backend Developer 1  
**Timeline:** Tuần 4

**Endpoints:**
- GET `/commission-records` - List commissions (Expert/Admin)

**Tasks:**
1. ✅ Cấu trúc cơ bản đã có
2. ⚠️ Commission calculation:
   - Trigger khi quiz attempt completed
   - Formula (theo SRS):
     ```
     commission = quizAttemptPrice * commissionRate
     commissionRate = 0.7 (Expert gets 70%)
     ```
   - Create commissionRecord (status: Pending)
3. ⚠️ List commissions:
   - Expert: see their own records
   - Admin: see all records
   - Pagination + filters (status, expertId, dateRange)
4. ⚠️ Mark as Paid (Admin only):
   - PATCH endpoint to update status=Paid
5. ⚠️ Tests:
   - Calculation logic
   - Authorization (Expert sees own, Admin sees all)

**Acceptance Criteria:**
- [ ] Commission created khi quiz complete
- [ ] Calculation formula đúng
- [ ] Expert query own commissions
- [ ] Admin manage payments
- [ ] Tests coverage ≥85%

---

## 4. Lộ trình triển khai 4 tuần

### 🗓️ Tuần 1: Foundation & Auth

**Mục tiêu:** Hoàn thiện hạ tầng cơ bản và authentication flow

**BE1 (Auth & Users):**
- [ ] Implement OAuth 2.0 flow với Google
- [ ] JWT generation và validation
- [ ] Refresh token mechanism
- [ ] User profile endpoints (GET/PATCH /users/me)
- [ ] Admin users endpoint
- [ ] Unit tests cho auth service

**Infrastructure:**
- [ ] Hoàn thiện error handling middleware
- [ ] ETag support cho PATCH endpoints
- [ ] Rate limiting headers
- [ ] Request logging với correlation ID
- [ ] Input validation schemas (Joi)

**Deliverables:**
- ✅ OAuth flow hoạt động (dev env)
- ✅ JWT tokens validate đúng
- ✅ Error responses theo format chuẩn
- ✅ Tests coverage ≥90% cho auth module
- ✅ Postman collection cho auth endpoints

---

### 🗓️ Tuần 2: Core Domain (Subjects & Documents)

**Mục tiêu:** Hoàn thiện quản lý tài liệu và xử lý nền

**BE2 (Subjects & Documents):**
- [ ] Subjects CRUD hoàn chỉnh
- [ ] Document upload flow
- [ ] File validation và storage
- [ ] Text extraction worker (pdf-parse, mammoth)
- [ ] Summary generation worker (LLM)
- [ ] Status workflow implementation
- [ ] Integration tests cho upload pipeline

**Adapters:**
- [ ] StorageClient implementation (local + S3 ready)
- [ ] LLMClient prompt testing và optimization
- [ ] Queue/EventBus implementation (Redis)

**Deliverables:**
- ✅ Upload + extraction + summary flow end-to-end
- ✅ LLM integration hoạt động
- ✅ Background jobs với retry logic
- ✅ Tests coverage ≥85% cho documents module
- ✅ Postman collection cho subjects/documents

---

### 🗓️ Tuần 3: Question Generation & Quiz

**Mục tiêu:** Hoàn thiện tính năng cốt lõi (sinh đề và làm bài)

**BE3 (QuestionSets & Quiz):**
- [ ] Question generation từ document
- [ ] Prompt engineering cho Gemini
- [ ] QuestionSet CRUD với ownership
- [ ] Share link generation
- [ ] Quiz attempt flow (start/submit)
- [ ] Scoring algorithm với trọng số
- [ ] Commission trigger
- [ ] Idempotency-Key support
- [ ] Integration tests cho full flow

**BE4 (Validation Workflow):**
- [ ] Create validation request
- [ ] Assign Expert workflow
- [ ] Review completion
- [ ] Unique constraint enforcement
- [ ] Notifications integration

**Deliverables:**
- ✅ Generate → Quiz → Score flow hoạt động
- ✅ Validation request workflow
- ✅ LLM prompt quality tốt (ít hallucination)
- ✅ Tests coverage ≥85% cho questionSets/quiz
- ✅ E2E test scenario: upload doc → generate → quiz → review

---

### 🗓️ Tuần 4: Notifications, Subscriptions & Polish

**Mục tiêu:** Hoàn thiện tính năng phụ và polish

**BE5 (Notifications):**
- [ ] Email service integration (SendGrid/SES)
- [ ] Email templates
- [ ] Notification endpoints
- [ ] Background email jobs

**BE6 (Subscriptions - optional):**
- [ ] Subscription plans listing
- [ ] Create subscription
- [ ] Stripe checkout (stub/real)
- [ ] Webhook handler
- [ ] Entitlements enforcement

**BE7 (Commission Records):**
- [ ] Commission calculation
- [ ] List commissions endpoint
- [ ] Admin payment tracking

**Polish:**
- [ ] Security audit (input validation, file upload)
- [ ] Performance optimization (indexes, queries)
- [ ] API documentation (Swagger/OpenAPI UI)
- [ ] Error messages i18n ready
- [ ] Logging improvements
- [ ] Health check endpoint nâng cao

**Deliverables:**
- ✅ Tất cả endpoints theo OpenAPI spec
- ✅ Email notifications hoạt động
- ✅ Subscriptions (basic flow)
- ✅ Commission tracking
- ✅ Overall tests coverage ≥85%
- ✅ API documentation live
- ✅ Production-ready checklist completed

---

## 5. Tiêu chí nghiệm thu (DoD)

### ✅ Definition of Done (mỗi endpoint)

**Functional:**
- [ ] Implementation khớp OpenAPI spec (paths, params, status codes, schemas)
- [ ] Business logic đúng theo SRS/SDD
- [ ] Authorization checks (JWT + RBAC + ownership)
- [ ] Input validation với Joi schemas
- [ ] Error handling với format chuẩn `{ code, message, details }`
- [ ] Pagination cho list endpoints `{ items, meta }`
- [ ] ETag/If-None-Match cho update endpoints (nếu applicable)
- [ ] Idempotency-Key cho creation endpoints (nếu applicable)

**Non-Functional:**
- [ ] Response time < 2s cho sync operations
- [ ] Background jobs < 5 phút (extraction/summary/generation)
- [ ] Rate limiting headers (X-RateLimit-*)
- [ ] Request logging với requestId + userId
- [ ] Graceful error handling (no crashes)

**Quality:**
- [ ] Unit tests coverage ≥85%
- [ ] Integration tests cho happy path
- [ ] Edge cases covered (invalid input, not found, forbidden)
- [ ] Code review passed
- [ ] ESLint no errors
- [ ] No console.log (use logger)

**Documentation:**
- [ ] Inline JSDoc cho public methods
- [ ] Postman/Thunder collection updated
- [ ] README updated (nếu có thay đổi lớn)

---

### ✅ Definition of Done (module)

**All endpoints complete:**
- [ ] Tất cả endpoints trong module pass DoD
- [ ] Integration tests cho module flow
- [ ] Contract tests verify OpenAPI compliance

**Database:**
- [ ] Mongoose schemas có validators/enums
- [ ] Indexes được khai báo (user-scoped, status, unique)
- [ ] Migration script (nếu cần seed data)

**Security:**
- [ ] No SQL/NoSQL injection vulnerabilities
- [ ] File upload security (size, type, MIME validation)
- [ ] Secrets không hardcoded
- [ ] CORS configured properly

**Performance:**
- [ ] Queries optimized (use indexes)
- [ ] N+1 query avoided
- [ ] Pagination implemented
- [ ] Background jobs cho heavy operations

---

### ✅ Definition of Done (MVP v0.1)

**All modules complete:**
- [ ] Tất cả 7 modules pass module DoD
- [ ] E2E tests cho critical flows:
  - OAuth login → create subject → upload doc → generate questions → take quiz → request review
- [ ] Performance testing (basic load test)
- [ ] Security audit completed

**Deployment Ready:**
- [ ] Environment variables documented
- [ ] Database indexes created
- [ ] Seed data script (subscription plans, demo users)
- [ ] Health check endpoint functional
- [ ] Graceful shutdown implemented
- [ ] Logs to stdout (container-friendly)

**Documentation:**
- [ ] API documentation live (Swagger UI)
- [ ] Postman collection complete
- [ ] README with setup instructions
- [ ] Architecture diagrams updated
- [ ] Deployment guide (TBC)

**Quality Metrics:**
- [ ] Overall test coverage ≥85%
- [ ] No critical security vulnerabilities
- [ ] No P0/P1 bugs
- [ ] All OpenAPI endpoints implemented

---

## 6. Rủi ro và giải pháp

### 🔴 Rủi ro cao

#### 1. LLM API cost/quota vượt ngân sách

**Mô tả:** Gemini API có thể tốn phí hoặc bị rate limit

**Giải pháp:**
- Implement quota tracking
- Cache kết quả generation (avoid regenerate)
- Throttle requests (queue system)
- Dev/test dùng LLM_MODE=stub
- Monitor usage daily

**Owner:** BE2, BE3

---

#### 2. Text extraction chất lượng thấp (PDF phức tạp)

**Mô tả:** pdf-parse không parse được PDF scan/OCR/images

**Giải pháp:**
- Document preprocessing (check if scanned)
- Fallback to OCR service (Tesseract/Google Vision - TBC)
- Clear error message cho user
- Support plain text upload (.txt) as alternative
- Limit file size 20MB

**Owner:** BE2

---

#### 3. Question generation hallucination/sai nội dung

**Mô tả:** LLM tạo câu hỏi sai hoặc không liên quan

**Giải pháp:**
- Prompt engineering careful (include context, format)
- Validation workflow (Expert review required)
- User report feature (flag bad questions)
- A/B test prompts
- Fallback to template-based generation (TBD)

**Owner:** BE3

---

### 🟡 Rủi ro trung bình

#### 4. OAuth integration phức tạp (dev/prod env khác nhau)

**Mô tả:** Google OAuth callback URLs, credentials khác nhau

**Giải pháo:**
- Tách config theo env (dev/staging/prod)
- Use AUTH_MODE=stub cho local dev
- Document OAuth setup clearly
- Test integration early

**Owner:** BE1

---

#### 5. Mongoose schema changes breaking data

**Mô tả:** Schema changes có thể làm hỏng dữ liệu cũ

**Giải pháp:**
- Migration scripts cho schema changes
- Backward compatibility khi possible
- Seed data script để recreate clean DB
- Backup before migration (prod)

**Owner:** All

---

#### 6. Background jobs fail silently

**Mô tả:** Worker jobs fail nhưng không notify

**Giải pháo:**
- Implement DLQ (Dead Letter Queue)
- Job status tracking in DB
- Alert/notification khi job fail nhiều lần
- Retry with exponential backoff
- Admin dashboard for job monitoring (TBD)

**Owner:** BE2, BE3, BE5

---

### 🟢 Rủi ro thấp

#### 7. File upload security

**Mô tả:** Malicious file upload

**Giải pháp:**
- MIME type validation
- File extension whitelist (.pdf/.docx/.txt only)
- Size limit 20MB
- Virus scan (ClamAV integration - optional)
- Store uploads isolated (S3 bucket)

**Owner:** BE2

---

#### 8. Rate limiting too strict

**Mô tả:** Legitimate users bị block

**Giải pháp:**
- Configurable rate limits per endpoint
- Higher limits for premium users
- Whitelist admin/internal IPs
- Monitor rate limit hits
- Clear error messages (Retry-After header)

**Owner:** BE1

---

## 7. Checklist tổng hợp

### 📦 Module Completion

- [ ] **BE1: Auth & Users** (Tuần 1-2)
  - [ ] OAuth 2.0 flow
  - [ ] JWT validation
  - [ ] Refresh tokens
  - [ ] User profile (GET/PATCH)
  - [ ] Admin user management
  - [ ] Tests ≥90%

- [ ] **BE2: Subjects & Documents** (Tuần 2)
  - [ ] Subjects CRUD
  - [ ] Document upload
  - [ ] Text extraction (pdf/docx/txt)
  - [ ] Summary generation (LLM)
  - [ ] Background jobs
  - [ ] Tests ≥85%

- [ ] **BE3: QuestionSets & Quiz** (Tuần 3)
  - [ ] Question generation (LLM)
  - [ ] QuestionSet CRUD
  - [ ] Share links
  - [ ] Quiz attempts
  - [ ] Scoring algorithm
  - [ ] Tests ≥85%

- [ ] **BE4: Validation Workflow** (Tuần 3-4)
  - [ ] Create validation request
  - [ ] Assign Expert
  - [ ] Review completion
  - [ ] Notifications
  - [ ] Tests ≥85%

- [ ] **BE5: Notifications** (Tuần 4)
  - [ ] In-app notifications
  - [ ] Email service integration
  - [ ] Email templates
  - [ ] Background email jobs
  - [ ] Tests ≥80%

- [ ] **BE6: Subscriptions** (Tuần 4 - optional)
  - [ ] Plans listing
  - [ ] Create subscription
  - [ ] Stripe integration (basic)
  - [ ] Webhook handler
  - [ ] Tests ≥80%

- [ ] **BE7: Commission Records** (Tuần 4)
  - [ ] Commission calculation
  - [ ] List commissions
  - [ ] Admin tracking
  - [ ] Tests ≥85%

---

### 🧪 Testing

- [ ] Unit tests ≥85% overall coverage
- [ ] Integration tests cho critical flows
- [ ] E2E test: full user journey
- [ ] Contract tests (OpenAPI compliance)
- [ ] Load testing (basic)
- [ ] Security testing (OWASP top 10)

---

### 🔒 Security

- [ ] JWT validation on all protected endpoints
- [ ] RBAC enforcement
- [ ] Ownership checks
- [ ] Input validation (Joi schemas)
- [ ] File upload security
- [ ] CORS configured
- [ ] Helmet middleware
- [ ] Secrets in env vars (not hardcoded)
- [ ] Rate limiting
- [ ] SQL/NoSQL injection prevention

---

### 📊 Database

- [ ] All Mongoose models complete
- [ ] Validators/enums in schemas
- [ ] Indexes declared (user-scoped, status, unique)
- [ ] Timestamps enabled
- [ ] ETag/version keys (__v)
- [ ] Unique constraints (email, sharedUrl)
- [ ] Partial indexes (validationRequests)
- [ ] Seed data script

---

### 🚀 Deployment

- [ ] Environment variables documented
- [ ] Config for dev/staging/prod
- [ ] Health check endpoint
- [ ] Graceful shutdown
- [ ] Logging to stdout
- [ ] Error monitoring setup (TBD)
- [ ] Docker container (optional)
- [ ] CI/CD pipeline (optional)

---

### 📚 Documentation

- [ ] API documentation (Swagger UI)
- [ ] Postman collection complete
- [ ] README updated
- [ ] Architecture diagrams
- [ ] Deployment guide
- [ ] Troubleshooting guide
- [ ] Environment setup guide

---

### ✅ Quality Gates

- [ ] ESLint no errors
- [ ] Prettier formatted
- [ ] No console.log (use logger)
- [ ] Tests pass in CI
- [ ] Code review approved
- [ ] No P0/P1 bugs
- [ ] Security audit passed
- [ ] Performance benchmarks met

---

## 📝 Notes

### Development Mode Flags

Để hỗ trợ phát triển song song không phụ thuộc:

```bash
# Auth
AUTH_MODE=stub|real          # Stub: use X-Dev-User-Id header, Real: verify JWT

# Database
DB_MODE=memory|mongo         # Memory: in-memory DB for tests, Mongo: real connection

# LLM
LLM_MODE=stub|real          # Stub: mock responses, Real: call Gemini API

# Storage
STORAGE_MODE=local|s3       # Local: filesystem, S3: AWS S3

# Queue
QUEUE_MODE=stub|real        # Stub: in-memory queue, Real: Redis/RabbitMQ

# Email
EMAIL_MODE=stub|real        # Stub: log only, Real: send via SendGrid/SES

# Payment
PAYMENT_MODE=stub|real      # Stub: always succeed, Real: Stripe integration
```

### Stub Mode Testing

Khi `AUTH_MODE=stub`, accept headers:
- `X-Dev-User-Id`: user ID
- `X-Dev-User-Role`: Learner|Expert|Admin

Example:
```bash
curl -H "X-Dev-User-Id: 60d5ec49f1b2c8b1f8e4e1a1" \
     -H "X-Dev-User-Role: Admin" \
     http://localhost:3000/api/v1/admin/users
```

### Priority Order

1. **P0 (Critical):** Auth, Documents Upload, Question Generation, Quiz Scoring
2. **P1 (High):** Validation Workflow, Notifications, Subscriptions
3. **P2 (Medium):** Commission Records, Admin features
4. **P3 (Low):** Nice-to-haves, optimizations

### Success Metrics

- **Functional:** 100% OpenAPI endpoints implemented
- **Quality:** ≥85% test coverage
- **Performance:** <2s response time for sync APIs
- **Security:** 0 critical vulnerabilities
- **Documentation:** 100% endpoints documented

---

## 🎯 Kết luận

Kế hoạch này cung cấp lộ trình chi tiết để hoàn thiện backend Learinal MVP v0.1 trong 4 tuần. 

**Key principles:**
- ✅ Tuân thủ OpenAPI spec
- ✅ Chuẩn hóa error responses
- ✅ RBAC + ownership checks
- ✅ Background jobs cho heavy operations
- ✅ Tests coverage ≥85%
- ✅ Stub mode cho phát triển độc lập

**Critical path:**
Auth → Documents → Questions → Quiz → Validation

**Team allocation:**
- BE1: Auth, Users, Commission, Infrastructure
- BE2: Subjects, Documents, Storage, Workers
- BE3: QuestionSets, Quiz, Notifications

Với kế hoạch này, team có thể phát triển song song và tích hợp dần, đảm bảo deliver đúng timeline và chất lượng.

---

**Người duyệt:** _____________________  
**Ngày duyệt:** _____________________
