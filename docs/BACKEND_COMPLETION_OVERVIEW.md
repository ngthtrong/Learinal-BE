# Tài liệu Hoàn thiện Backend Learinal - Tổng quan

**Phiên bản:** 1.0  
**Ngày cập nhật:** 02/11/2025  
**Dành cho:** Team Backend

---

## Mục đích

Tài liệu này cung cấp danh sách đầy đủ các tính năng còn thiếu và cần hoàn thiện để chuyển dự án Learinal từ trạng thái MVP (v0.1) sang phiên bản Production-Ready hoàn chỉnh theo SRS.

## Tình trạng hiện tại (Current Status)

### ✅ Đã hoàn thành (Implemented)

1. **Cơ sở hạ tầng cơ bản**
   - Express server với MongoDB
   - JWT Authentication (real mode)
   - Rate limiting middleware
   - Error handling standardized
   - Request ID tracking
   - ETag support

2. **Auth & Users**
   - OAuth 2.0 integration (Google)
   - Token exchange & refresh
   - User profile management (GET/PATCH /users/me)
   - Basic admin user listing

3. **Subjects Management**
   - CRUD operations cho subjects
   - Ownership validation
   - Pagination support

4. **Documents**
   - File upload (multipart/form-data)
   - Storage integration (stub/real)
   - Document metadata management
   - Basic status tracking

5. **Question Sets**
   - List question sets
   - Generate questions (LLM integration - stub/real)
   - Get question set details
   - Basic PATCH support
   - Share link generation (partial)

6. **Quiz Attempts**
   - Start quiz attempt
   - Get attempt details
   - Submit quiz với scoring cơ bản

### 🔴 Chưa hoàn thiện (Not Implemented / Incomplete)

## 1. SUBSCRIPTION SYSTEM (Quan trọng nhất)

**Trạng thái:** NOT IMPLEMENTED (501 NotImplemented)

### Thiếu hoàn toàn:

1. **SubscriptionPlans Controller & Service**
   - GET /subscription-plans (list public plans)
   - POST /subscription-plans (Admin only - tạo gói mới)
   - PATCH /subscription-plans/:id (Admin only - cập nhật gói)
   - DELETE /subscription-plans/:id (Admin only - archive gói)

2. **UserSubscriptions Controller & Service**
   - GET /user-subscriptions/me (lịch sử đăng ký)
   - POST /subscriptions (checkout/create subscription)
   - PATCH /user-subscriptions/:id/cancel (hủy đăng ký)

3. **Subscription Business Logic**
   - Kiểm tra entitlements (maxMonthlyTestGenerations, maxValidationRequests, etc.)
   - Enforce limits theo gói
   - Auto-renewal logic
   - Expiration handling
   - Upgrade/downgrade workflow

4. **Payment Integration**
   - Webhook handler hoàn chỉnh (hiện tại chỉ có placeholder)
   - Payment verification
   - Transaction logging
   - Refund handling

**Yêu cầu theo SRS:**
- Gói Standard: 2000 VND/tháng
- Gói Pro: 5000 VND/tháng
- Entitlements khác nhau:
  - maxMonthlyTestGenerations (Standard: 50, Pro: unlimited)
  - maxValidationRequests (Standard: 5, Pro: 20)
  - priorityProcessing (Pro only)
  - maxSubjects, shareLimits, etc.

---

## 2. VALIDATION WORKFLOW (Expert Features)

**Trạng thái:** PARTIALLY IMPLEMENTED

### Đã có:
- GET /validation-requests (list)
- GET /validation-requests/:id (get detail)
- PATCH /validation-requests/:id (update status - cơ bản)

### Thiếu:

1. **Request Validation Endpoint**
   - POST /question-sets/:id/review (hiện tại chỉ là stub 202)
   - Kiểm tra subscription limits
   - Prevent duplicate requests
   - Create ValidationRequest record

2. **Expert Assignment Logic**
   - Worker job: `review.assigned.js` (hiện tại throw NotImplemented)
   - Find available Expert (least loaded strategy)
   - Auto-assignment algorithm
   - Email notification cho Expert

3. **Review Completion Workflow**
   - Worker job: `review.completed.js` (hiện tại throw NotImplemented)
   - Apply corrections từ Expert
   - Update QuestionSet status
   - Trigger commission calculation
   - Email notification cho Learner

4. **Expert Dashboard Features**
   - GET /validation-requests?status=Assigned&expertId=me
   - Statistics cho Expert (pending, completed, revenue)
   - Review queue management

---

## 3. COMMISSION SYSTEM

**Trạng thái:** NOT IMPLEMENTED (501 NotImplemented)

### Thiếu hoàn toàn:

1. **Commission Records API**
   - GET /commission-records (Expert view - my commissions)
   - GET /admin/commission-records (Admin view - all commissions)
   - PATCH /admin/commission-records/:id (mark as Paid)

2. **Commission Calculation Logic**
   - Implement công thức từ SRS 4.1.2:
     - NetPremiumRevenue_m × CommissionPoolRate
     - PerAttemptUnit_m calculation
     - Rate_Published vs Rate_Validated
     - Time-based entitlement (T days)
   - Worker job để tính commission khi quiz completed

3. **Commission Reports**
   - Monthly commission summary cho Expert
   - Revenue breakdown (by set, by type)
   - Payment history

---

## 4. NOTIFICATION SYSTEM

**Trạng thái:** STUB ONLY

### Đã có:
- Models và repositories
- GET /notifications (list)
- PATCH /notifications/:id (mark as read)

### Thiếu:

1. **Email Templates**
   - Welcome email
   - Password reset email
   - Validation assigned email
   - Validation completed email
   - Commission earned email
   - Subscription renewal reminder
   - Payment receipt

2. **Email Worker**
   - `notifications.email.js` (hiện tại throw NotImplemented)
   - Queue processing
   - Template rendering
   - SendGrid/SES integration (real mode)

3. **Notification Creation Logic**
   - Auto-create notifications cho các events:
     - Document processing completed
     - Question set generated
     - Validation request assigned
     - Validation completed
     - Quiz attempt completed
     - Commission earned
     - Subscription status change

---

## 5. QUESTION GENERATION - DIFFICULTY LEVELS

**Trạng thái:** PARTIALLY IMPLEMENTED

### Đã có:
- Generate endpoint với difficulty parameter
- Difficulty enum trong model

### Thiếu:

1. **Multi-level Question Generation**
   - Hiện tại: chỉ generate 1 mức độ duy nhất
   - Cần: support generate mixed difficulty levels
   - API parameter: `difficultyDistribution` object
     ```json
     {
       "Biết": 2,
       "Hiểu": 3,
       "Vận dụng": 3,
       "Vận dụng cao": 2
     }
     ```

2. **LLM Prompt Engineering**
   - Refine prompts để ensure correct difficulty
   - Validation cho LLM output
   - Fallback strategies nếu LLM không generate đúng distribution

3. **Scoring Weight Validation**
   - Ensure all questions có difficultyLevel
   - Validate scoring formula trong quiz submission
   - Hiện tại scoring đã implement nhưng cần test kỹ

---

## 6. DOCUMENT PROCESSING PIPELINE

**Trạng thái:** PARTIALLY IMPLEMENTED

### Đã có:
- Upload endpoint
- Basic status tracking

### Thiếu:

1. **Text Extraction**
   - Worker job: `document.ingestion.js` (hiện tại stub)
   - PDF parsing (pdf-parse)
   - DOCX parsing (mammoth)
   - TXT direct read
   - Error handling cho corrupted files

2. **Summary Generation**
   - Worker job: `content.summary.js` (hiện tại stub)
   - Generate summaryShort (3-5 câu)
   - Generate summaryFull (6-10 bullet points)
   - Update Document status
   - GET /documents/:id/summary (hiện tại chưa gọi LLM thật)

3. **Table of Contents Generation**
   - Extract structure từ document
   - Update Subject.tableOfContents
   - LLM-based intelligent ToC

---

## 7. ADMIN FEATURES

**Trạng thái:** MINIMAL IMPLEMENTATION

### Đã có:
- GET /admin/users (basic listing)

### Thiếu:

1. **User Management**
   - PATCH /admin/users/:id (update user role/status)
   - POST /admin/users/:id/deactivate
   - POST /admin/users/:id/activate
   - User activity logs

2. **System Configuration**
   - Manage subscription plans (CRUD)
   - Configure commission rates
   - Set validation request limits
   - System-wide settings API

3. **Content Moderation**
   - Review flagged content
   - Manage shared question sets
   - Expert performance monitoring
   - Quality metrics dashboard API

4. **Financial Management**
   - Commission payment workflow
   - Revenue reports
   - Subscription analytics
   - Refund management

5. **Expert Management**
   - Assign expertise areas to Experts
   - Manual validation request assignment
   - Expert onboarding/offboarding
   - Performance tracking

---

## 8. REAL MODE ADAPTERS

**Trạng thái:** MIXED (stub/real)

### Cần chuyển từ stub sang real:

1. **LLM Client** ✅ (đã support real mode)
   - Cần optimize prompts
   - Add cost tracking
   - Implement caching strategies

2. **Email Client** 🔴 (chỉ có stub)
   - SendGrid integration
   - Template management
   - Delivery tracking
   - Bounce handling

3. **Storage Client** 🟡 (có real mode nhưng chưa test kỹ)
   - S3 upload/download
   - Cloudinary integration
   - File cleanup policies
   - CDN integration

4. **Queue System** 🔴 (chỉ có stub)
   - Redis integration
   - Bull/BullMQ setup
   - Job retry strategies
   - Dead letter queue
   - Worker processes

5. **Payment Gateway** 🔴 (webhook placeholder only)
   - SePay integration hoàn chỉnh
   - Signature verification
   - Event handling
   - Transaction reconciliation

---

## 9. DATA VALIDATION & CONSTRAINTS

**Trạng thái:** BASIC

### Cần bổ sung:

1. **Input Validation**
   - Comprehensive Joi/Zod schemas cho tất cả endpoints
   - File upload validation (size, type, content)
   - Business rule validation

2. **Database Constraints**
   - Unique indexes (email, sharedUrl, etc.)
   - Partial indexes (validation requests)
   - Foreign key validation
   - Data migration scripts

3. **Rate Limiting theo Subscription**
   - Hiện tại: fixed 60 rpm cho tất cả
   - Cần: dynamic limits theo subscription tier
   - Feature-specific limits

---

## 10. TESTING

**Trạng thái:** MINIMAL (placeholder only)

### Cần implement:

1. **Unit Tests**
   - Service layer tests (coverage ≥ 85%)
   - Repository tests
   - Adapter tests với mocking
   - Utility function tests

2. **Integration Tests**
   - API endpoint tests
   - Database integration
   - External service mocking

3. **E2E Tests**
   - Full user journeys
   - Error scenarios
   - Edge cases

4. **Test Infrastructure**
   - MongoDB in-memory server setup
   - Fixtures và test data
   - CI/CD integration

---

## Ưu tiên thực hiện (Priority Order)

### Phase 1: Critical Business Features (2-3 tuần)
1. **Subscription System** (CRITICAL)
   - Plans CRUD
   - User subscriptions
   - Entitlement checks
   - Payment integration

2. **Commission System** (HIGH)
   - Commission calculation
   - Records API
   - Payment workflow

### Phase 2: Expert Workflow (2 tuần)
3. **Validation Workflow** (HIGH)
   - Request validation endpoint
   - Expert assignment
   - Review completion
   - Notifications

4. **Email System** (MEDIUM)
   - Template setup
   - Email worker
   - SendGrid integration

### Phase 3: Content & Quality (1-2 tuần)
5. **Document Processing** (MEDIUM)
   - Text extraction
   - Summary generation
   - ToC generation

6. **Question Generation Enhancement** (MEDIUM)
   - Multi-level difficulty
   - Better prompts
   - Validation

### Phase 4: Admin & Management (1-2 tuần)
7. **Admin Features** (MEDIUM)
   - User management
   - System configuration
   - Content moderation

8. **Real Adapters** (HIGH for production)
   - Queue system
   - Email real mode
   - Storage optimization

### Phase 5: Quality & Stability (1-2 tuần)
9. **Testing** (HIGH)
   - Unit tests
   - Integration tests
   - E2E tests

10. **Production Readiness** (CRITICAL before launch)
    - Security hardening
    - Performance optimization
    - Monitoring & logging
    - Documentation

---

## Tài liệu chi tiết

Mỗi phase có tài liệu riêng:

1. `PHASE_SUBSCRIPTION_SYSTEM.md` - Subscription & Payment
2. `PHASE_EXPERT_WORKFLOW.md` - Validation & Commission
3. `PHASE_CONTENT_PROCESSING.md` - Document & Question Generation
4. `PHASE_ADMIN_MANAGEMENT.md` - Admin features
5. `PHASE_TESTING_QA.md` - Testing & Quality Assurance

---

## Metrics & Success Criteria

### Subscription System
- [ ] All subscription plans configurable via Admin API
- [ ] User can subscribe/cancel through API
- [ ] Entitlements enforced on all features
- [ ] Payment webhook processes 100% of events
- [ ] Zero payment discrepancies

### Validation Workflow
- [ ] Expert assignment < 5 minutes average
- [ ] Review completion notification < 1 minute
- [ ] 95% validation requests completed within SLA
- [ ] Zero duplicate requests per question set

### Commission System
- [ ] 100% accuracy trong commission calculation
- [ ] Monthly commission reports available
- [ ] Payment reconciliation automated

### Testing
- [ ] Unit test coverage ≥ 85%
- [ ] Integration test coverage ≥ 70%
- [ ] All critical paths có E2E tests
- [ ] Zero critical bugs in production

### Performance
- [ ] API response time < 500ms (p95)
- [ ] Document processing < 2 minutes (p95)
- [ ] Question generation < 30 seconds (p95)
- [ ] System uptime ≥ 99.5%

---

## Notes cho Team

1. **Code Style & Standards**
   - Follow instruction file `.github/instructions/instruction_learinal_backend.instructions.md`
   - Tuân thủ DIP, SRP principles
   - Controller → Service → Repository pattern
   - Mongoose ODM với proper schemas

2. **API Compatibility**
   - Tất cả API phải match `learinal-openapi.yaml`
   - Error response format chuẩn
   - Pagination format nhất quán

3. **Database**
   - Follow schema trong `mongodb-schema.md`
   - Indexes declared in Mongoose Schema
   - Migration scripts cho schema changes

4. **Testing Requirements**
   - Mỗi feature MỚI phải có unit tests
   - Critical endpoints phải có integration tests
   - Không merge code không có tests

5. **Documentation**
   - Update API docs nếu có changes
   - Code comments cho complex logic
   - README cho setup instructions

---

**Tổng thời gian ước tính:** 8-12 tuần (với team 3 người)

**Ghi chú:** Đây là roadmap hoàn thiện SRS đầy đủ. Có thể điều chỉnh priority dựa trên business needs và deadline thực tế.
