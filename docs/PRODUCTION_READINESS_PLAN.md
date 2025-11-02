# Kế hoạch Chuyển đổi Backend Learinal sang Production-Ready

**Phiên bản:** 1.0
**Ngày tạo:** 30/10/2025
**Mục tiêu:** Loại bỏ toàn bộ chế độ stub/mock/simulation, chuyển hệ thống sang chế độ REAL production-ready

---

## Tổng quan

Tài liệu này cung cấp kế hoạch chi tiết để hoàn thành backend Learinal MVP v0.1, chuyển đổi từ chế độ development với các stub/mock sang hệ thống production-ready hoàn chỉnh. Kế hoạch được chia thành các giai đoạn rõ ràng với checklist cụ thể cho từng thành phần.

### Tình trạng hiện tại (As-Is)

Dựa trên phân tích codebase:

**✅ ĐÃ HOÀN THÀNH:**

- Cấu trúc dự án theo kiến trúc phân lớp (Controller → Service → Repository)
- Mongoose Models với schema đầy đủ cho tất cả collections
- Middleware nền tảng: authenticateJWT (real), authorizeRole, errorHandler, rateLimit, requestId
- Auth flow cơ bản: OAuth Google (real), JWT token generation & verification (real)
- Routes và Controllers cho tất cả endpoints theo OpenAPI
- Services cơ bản cho: Users, Subjects, Documents, QuestionSets, QuizAttempts, Validation
- Repositories cho tất cả collections
- LLMClient với Gemini API (có chế độ stub/real)
- EmailClient với SendGrid/SES (có chế độ stub/real)
- Queue infrastructure với BullMQ + Redis
- Worker cơ bản cho document ingestion, content summary

**⚠️ CÒN Ở CHẾ ĐỘ STUB/PARTIAL:**

- LLM_MODE: mặc định "stub" (cần chuyển "real")
- STORAGE_MODE: mặc định "local" (cần S3/Cloudinary)
- QUEUE_MODE: mặc định "stub" (cần real Redis/RabbitMQ)
- PAYMENT_MODE: mặc định "stub" (cần Stripe webhook thực)
- Worker jobs: chưa hoàn chỉnh các job handlers
- Validation workflow: chưa triển khai đầy đủ luồng Expert review
- Notification system: chưa triển khai gửi email/notification tự động
- Commission calculation: chưa triển khai công thức tính hoa hồng
- Subscription management: chưa tích hợp payment gateway hoàn chỉnh
- Testing: chưa có test coverage đầy đủ
- Production infrastructure: chưa có config cho deployment, monitoring, logging

**🔴 CHƯA TRIỂN KHAI:**

- Comprehensive error handling với retry/circuit breaker patterns
- Rate limiting theo subscription tier
- Data validation đầy đủ ở tầng Mongoose Schema
- Indexes optimization và performance tuning
- Security hardening (CSRF, XSS, SQL injection prevention)
- API documentation (Swagger UI)
- Health checks nâng cao (DB connection, Redis, external services)
- Graceful shutdown
- Production logging với structured logs (JSON format)
- Metrics và monitoring (Prometheus/Grafana hoặc tương đương)
- CI/CD pipeline
- Environment-specific configurations
- Secrets management
- Backup & disaster recovery procedures

---

## Mục tiêu cuối cùng (To-Be)

Hệ thống backend Learinal hoàn chỉnh với:

1. **Tất cả adapters hoạt động ở chế độ REAL:**

   - OAuth Google: REAL (đã có)
   - JWT: REAL (đã có)
   - LLM (Gemini): REAL với error handling, retry, cost tracking
   - Email (SendGrid/SES): REAL với template support, retry
   - Storage (S3/Cloudinary): REAL với signed URLs, CDN
   - Queue (Redis/BullMQ): REAL với DLQ, monitoring
   - Payment (SePay): REAL với webhook verification
2. **Tất cả business flows hoàn chỉnh:**

   - User registration → Email verification → Account activation
   - Document upload → Text extraction → Summary generation → ToC generation
   - Question generation từ documents → Review workflow → Expert validation
   - Quiz attempt → Scoring → Commission calculation
   - Subscription purchase → Payment processing → Entitlement activation
   - Notification triggers → Email/in-app notifications
3. **Production-ready infrastructure:**

   - Comprehensive error handling & logging
   - Performance optimization & caching
   - Security hardening
   - Monitoring & alerting
   - CI/CD pipeline
   - Documentation đầy đủ

---

## Nguyên tắc thực hiện

1. **Tuần tự và từng bước:** Mỗi giai đoạn phải hoàn thành đầy đủ trước khi chuyển sang giai đoạn tiếp theo
2. **Test-driven:** Mỗi thay đổi phải có test coverage tương ứng
3. **Backward compatibility:** Không phá vỡ các API đã hoạt động
4. **Feature flags:** Sử dụng environment variables để bật/tắt tính năng mới
5. **Documentation:** Cập nhật docs đồng thời với code changes
6. **Code review:** Tất cả changes phải được review trước khi merge
7. **Incremental deployment:** Deploy từng phần nhỏ, không deploy big bang

---

## Cấu trúc tài liệu

Kế hoạch được chia thành các file riêng biệt để dễ quản lý:

1. **PRODUCTION_READINESS_PLAN.md** (file này): Tổng quan và roadmap
2. **PHASE_1_ADAPTERS.md**: Chi tiết triển khai adapters (LLM, Storage, Queue, Email, Payment)
3. **PHASE_2_BUSINESS_FLOWS.md**: Chi tiết triển khai business workflows
4. **PHASE_3_INFRASTRUCTURE.md**: Chi tiết triển khai infrastructure
5. **PHASE_4_TESTING.md**: Chi tiết strategy và implementation cho testing
6. **PHASE_5_DEPLOYMENT.md**: Chi tiết CI/CD và deployment procedures

---

## Roadmap tổng thể

### 🎯 Giai đoạn 1: Adapters & External Services (2 tuần)

**Mục tiêu:** Chuyển tất cả adapters sang chế độ REAL với error handling đầy đủ

- [ ] **Week 1:**

  - LLM Adapter (Gemini): Real mode với retry, timeout, cost tracking
  - Storage Adapter: S3/Cloudinary với signed URLs, validation
  - Email Adapter: SendGrid/SES với templates, retry logic
- [ ] **Week 2:**

  - Queue system: Real Redis/BullMQ với DLQ, monitoring
  - Payment Adapter: Stripe với webhook verification
  - OAuth hardening: State validation, PKCE support

**Deliverables:**

- Tất cả adapters hoạt động ở REAL mode
- Error handling & retry logic cho mọi external calls
- Unit tests cho adapters (coverage ≥ 85%)
- Integration tests với external services (có thể dùng test accounts)

---

### 🎯 Giai đoạn 2: Business Workflows (3 tuần)

**Mục tiêu:** Triển khai đầy đủ các business flows theo SRS

- [ ] **Week 3:**

  - Document processing pipeline: Upload → Extract → Summarize → ToC
  - Worker jobs: Ingestion, Summary, Question generation
  - Error handling & retry cho async jobs
- [ ] **Week 4:**

  - Validation workflow: Request → Assignment → Expert review → Completion
  - Commission calculation theo công thức trong SRS
  - Notification system: Email & in-app notifications
- [ ] **Week 5:**

  - Subscription management: Plans → Purchase → Payment → Activation
  - Stripe webhook handling: payment_intent.succeeded, subscription events
  - Entitlement enforcement

**Deliverables:**

- Tất cả workflows hoạt động end-to-end
- Worker jobs xử lý async tasks với retry & DLQ
- Commission calculation chính xác theo SRS
- Subscription lifecycle hoàn chỉnh
- Service tests (coverage ≥ 85%)

---

### 🎯 Giai đoạn 3: Infrastructure & Production Readiness (2 tuần)

**Mục tiêu:** Hardening hệ thống cho production

- [ ] **Week 6:**

  - Security hardening: Input validation, CORS, Helmet, rate limiting
  - Performance optimization: Indexes, caching, query optimization
  - Logging: Structured JSON logs, log levels, correlation IDs
  - Health checks: Deep health checks cho DB, Redis, external services
- [ ] **Week 7:**

  - Monitoring: Metrics collection (latency, throughput, errors)
  - Error tracking: Sentry hoặc tương đương
  - Graceful shutdown
  - Production configs: Environment-based configuration management

**Deliverables:**

- Security audit passed
- Performance benchmarks met (latency < 200ms p95 cho sync endpoints)
- Structured logging với correlation tracking
- Monitoring dashboards
- Production-ready configurations

---

### 🎯 Giai đoạn 4: Testing & Quality Assurance (2 tuần)

**Mục tiêu:** Đạt test coverage ≥ 85% và quality gates

- [ ] **Week 8:**

  - Unit tests cho tất cả services & repositories
  - Integration tests cho API endpoints
  - E2E tests cho critical flows
- [ ] **Week 9:**

  - Load testing: Xác định throughput limits
  - Security testing: OWASP top 10
  - Regression testing
  - Bug fixes & refinements

**Deliverables:**

- Test coverage ≥ 85% (unit + integration)
- E2E test suite cho critical paths
- Load test results & capacity planning
- Security scan reports
- Bug fixes completed

---

### 🎯 Giai đoạn 5: CI/CD & Deployment (1 tuần)

**Mục tiêu:** Tự động hóa deployment pipeline

- [ ] **Week 10:**
  - CI pipeline: Build, lint, test, security scan
  - CD pipeline: Staging → Production with approval gates
  - Environment management: Dev, Staging, Production configs
  - Rollback procedures
  - Documentation finalization

**Deliverables:**

- Automated CI/CD pipeline
- Deployment runbooks
- Rollback procedures documented
- Production deployment completed
- Post-deployment verification

---

## Metrics & Success Criteria

### Technical Metrics

- [ ] Test coverage ≥ 85% (unit + integration)
- [ ] API response time p95 < 200ms (sync endpoints)
- [ ] Worker job processing time < 30s (p95)
- [ ] Error rate < 1%
- [ ] Uptime ≥ 99.5%

### Business Metrics

- [ ] Document upload → Summary generation success rate ≥ 95%
- [ ] Question generation success rate ≥ 90%
- [ ] Payment processing success rate ≥ 99%
- [ ] Email delivery rate ≥ 98%

### Code Quality

- [ ] Tất cả endpoints tuân thủ OpenAPI spec
- [ ] Tất cả errors theo shape chuẩn `{ code, message, details }`
- [ ] Tất cả async operations có retry & timeout
- [ ] Tất cả external calls có circuit breaker pattern
- [ ] Tất cả sensitive data được encrypt/hash

---

## Rủi ro & Mitigation

### Rủi ro kỹ thuật

1. **LLM API rate limits/costs:**

   - Mitigation: Implement caching, quota management, fallback strategies
2. **External service downtime:**

   - Mitigation: Circuit breakers, graceful degradation, retry with backoff
3. **Data migration issues:**

   - Mitigation: Comprehensive testing, rollback plan, incremental migration
4. **Performance bottlenecks:**

   - Mitigation: Load testing early, identify bottlenecks, optimize before production

### Rủi ro business

1. **Payment integration complexities:**

   - Mitigation: Start with Stripe test mode, thorough webhook testing
2. **Expert onboarding for validation:**

   - Mitigation: Clear documentation, admin tools for expert management
3. **Content quality from LLM:**

   - Mitigation: Human review workflow, quality metrics, feedback loop

---

## Resources Required

### Team

- **BE1 Developer:** Adapters, Infrastructure, Security
- **BE2 Developer:** Business workflows, Worker jobs
- **BE3 Developer:** Testing, CI/CD, Documentation
- **DevOps (part-time):** Infrastructure setup, monitoring
- **QA (part-time):** Testing strategy, quality assurance

### External Services

- **Google Cloud:**

  - Gemini API (LLM)
  - Cloud Storage hoặc alternative S3-compatible
- **Email:**

  - SendGrid (recommended) hoặc AWS SES
- **Payment:**

  - Stripe (subscription & one-time payments)
- **Infrastructure:**

  - MongoDB Atlas (managed MongoDB)
  - Redis Cloud (managed Redis) hoặc self-hosted
  - Hosting: Render, Railway, AWS, hoặc Vercel
- **Monitoring (optional but recommended):**

  - Sentry (error tracking)
  - Datadog/New Relic (APM) hoặc self-hosted Prometheus/Grafana

### Development Tools

- Jest/Mocha for testing
- ESLint/Prettier for code quality
- Postman/Thunder for API testing
- GitHub Actions hoặc GitLab CI for CI/CD

---

## Next Steps

1. **Review kế hoạch với team:** Đảm bảo mọi người hiểu roadmap và phân công
2. **Setup environments:** Dev, Staging, Production với configs riêng
3. **Create tracking board:** Jira/Trello/GitHub Projects với tasks từ kế hoạch này
4. **Start Phase 1:** Bắt đầu với Adapters (xem PHASE_1_ADAPTERS.md)

---

## Tài liệu tham khảo

- [SRS - Đặc tả yêu cầu](./SRS%20for%20Learinal.md)
- [SDD - Thiết kế hệ thống](./SDD_Learinal.md)
- [OpenAPI Specification](./api/learinal-openapi.yaml)
- [MongoDB Schema](./mongodb-schema.md)
- [Current README](../README.md)

---

**Lưu ý quan trọng:**

1. Kế hoạch này là living document - cần cập nhật khi có thay đổi
2. Mỗi giai đoạn kết thúc phải có demo/review với stakeholders
3. Không skip testing - quality over speed
4. Document as you go - đừng để tới cuối
5. Communicate blockers sớm - đừng đợi tới daily standup

---

*Để xem chi tiết từng giai đoạn, tham khảo các file PHASE_*.md tương ứng.*
