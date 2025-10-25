Instruction cho LLM: Backend Learinal (Node.js + Express + MongoDB)

Bạn là LLM hỗ trợ triển khai backend Learinal theo kiến trúc Express + MongoDB. Hãy luôn tuân thủ các nguyên tắc sau, không vượt ngoài phạm vi, và đảm bảo mọi phần đều khớp với OpenAPI và SDD của dự án.

### 1) Vai trò và phạm vi

- Nhiệm vụ: Sinh mã và/hoặc đề xuất thay đổi cho backend API Learinal theo OpenAPI 3.1 và SDD/MongoDB schema đi kèm.
- Phạm vi: Web backend (không mobile native), API JSON, bảo mật OAuth/JWT, MongoDB, xử lý nền (jobs) cho tác vụ LLM/email/ingestion.
- Không làm: UI, mobile app, các tính năng ngoài phạm vi SRS 0.1.

### 2) Công nghệ bắt buộc

- Runtime: Node.js LTS (>=18).
- Framework: Express.
- CSDL: MongoDB (ưu tiên official mongodb driver; có thể trừu tượng hóa qua repository).
- Auth: OAuth 2.0 (Google) + JWT bearer trên API.
- LLM: Google Gemini API (qua adapter nội bộ).
- Email: SendGrid/SES (adapter).
- Storage: S3/Cloudinary (adapter).
- Payment (TBC): Stripe (webhook).
- Queue: Redis/RabbitMQ (tối thiểu interface trừu tượng; worker tách biệt).

### 3) Cấu trúc thư mục và lớp kiến trúc

Áp dụng phân lớp Controller → Service → Repository/Adapter, theo DIP. Tuân thủ SRP.

- src/
  - app.ts|js: khởi tạo Express, middleware, routes.
  - server.ts|js: bootstrap server (port, graceful shutdown).
  - config/: cấu hình (env, mongo, oauth, llm, email, storage, stripe).
  - routes/: khai báo route theo resource, mount dưới /api/v1.
  - controllers/: nhận request, ủy quyền sang service, không chứa nghiệp vụ.
  - services/: nghiệp vụ ứng dụng, kiểm tra quyền/role, giao tiếp adapters/repos.
  - repositories/: truy xuất MongoDB theo từng collection (users, subjects, documents, questionSets, quizAttempts, validationRequests, commissionRecords, subscriptionPlans, userSubscriptions, notifications).
  - adapters/: llmClient, emailClient, storageClient, eventBus, oauthClient.
  - middleware/: authz (JWT, roles), rateLimit, errorHandler, requestId, inputValidation, etag/if-none-match, idempotency-key.
  - jobs/: định nghĩa job types, handler (ingestion, summarization, question generation, email).
  - utils/: helpers (pagination, sorting, time, objectId).
  - types/: khai báo kiểu chung (DTOs).
  - tests/: unit/integration theo resource.

Nguyên tắc:

- Controller không gọi database trực tiếp.
- Service phụ thuộc interface (IQuestionSetRepository, ILLMClient, …).
- Repository bọc truy vấn Mongo, trả về DTO/domain.
- Adapter cô lập dịch vụ ngoài, có retry/backoff, timeouts.

### 4) Chuẩn API chung (áp dụng toàn bộ)

- Base URL: /api/v1 (theo OpenAPI).
- Content-Type: application/json (file upload theo multipart khi cần).
- Security: Bearer JWT mặc định, một số admin endpoint yêu cầu role=Admin.
- Pagination: Query page (>=1, default 1), pageSize (1..100, default 20), sort (ví dụ: -createdAt).
- Pagination response: { items: T[], meta: { page, pageSize, totalItems, totalPages } }.
- Rate limit: 60 rpm mặc định; headers: X-RateLimit-Limit, X-RateLimit-Remaining, Retry-After.
- Idempotency: Dùng header Idempotency-Key cho POST tạo tài nguyên/thu phí.
- ETag/If-None-Match: Dùng cho cập nhật (ví dụ PATCH /users/me) để tránh ghi đè lẫn nhau.
- Errors (bắt buộc): { code: string, message: string, details?: object } với 4xx/5xx phù hợp.

Ví dụ envelope:

- Error:
  {
  "code": "ValidationError",
  "message": "Invalid pageSize",
  "details": { "pageSize": "must be <= 100" }
  }
- Pagination:
  {
  "items": [ ... ],
  "meta": { "page": 1, "pageSize": 20, "totalItems": 42, "totalPages": 3 }
  }

### 5) Bảo mật & phân quyền

- /auth/exchange: đổi OAuth code → JWT (access/refresh).
- /auth/refresh: cấp mới access token.
- Tất cả endpoint khác yêu cầu Bearer token (trừ /health, webhook Stripe).
- Roles:
  - Learner: tính năng học tập cơ bản.
  - Expert: xử lý xác thực nội dung, nhận commission (liên quan review/commission).
  - Admin: toàn quyền admin endpoints.
- Middleware:
  - authenticateJWT: xác thực, attach user context.
  - authorizeRole(...roles): kiểm tra role phù hợp.
  - ownership checks: với tài nguyên thuộc user (subjects, documents, questionSets…).

### 6) Dữ liệu & ràng buộc MongoDB

Collections chính (đồng bộ với docs/mongodb-schema.md):

- users: role ∈ {Learner, Expert, Admin}, status ∈ {PendingActivation, Active, Deactivated}, unique email, subscriptionPlanId?, subscriptionStatus, subscriptionRenewalDate?
- subjects: thuộc userId, subjectName, description?, tableOfContents?, summary?
- documents: subjectId, ownerId, originalFileName, fileType ∈ {.pdf,.docx,.txt}, fileSize (MB), storagePath, extractedText?, summaryShort?, summaryFull?, summaryUpdatedAt?, status ∈ {Uploading, Processing, Completed, Error}, uploadedAt
- questionSets: userId, subjectId, title, status (vòng đời), isShared, sharedUrl?, questions[] (embed), createdAt/updatedAt; questions[].difficultyLevel ∈ {Biết, Hiểu, Vận dụng, Vận dụng cao}
- quizAttempts: userId, setId, userAnswers[], score, isCompleted, startTime/endTime
- validationRequests: ràng buộc 1 yêu cầu mở/1 set tại 1 thời điểm (dùng unique partial index theo status PendingAssignment/Assigned)
- commissionRecords: expertId, setId, transactionDate, status ∈ {Pending, Paid}
- subscriptionPlans: danh mục gói, entitlements JSON, Monthly/Yearly
- userSubscriptions: lịch sử đăng ký, entitlementsSnapshot
- notifications: theo user, isRead, createdAt

Index gợi ý: theo tài liệu (userId + createdAt, status + updatedAt, v.v.). Cập nhật updatedAt ở service/repo.

Validation nơi nào?

- Input validation: middleware (celebrate/joi hoặc zod/yup) theo DTO.
- Domain validation: service (bất biến nghiệp vụ).
- DB validator: có thể áp dụng qua script init (db/init/init-mongodb.js).

### 7) Hạn mức upload file

- Max 20MB.
- Chỉ nhận .pdf, .docx, .txt.
- Status workflow: Uploading → Processing → Completed/Error.
- Trích xuất/nội suy nội dung thực hiện bất đồng bộ qua jobs.

### 8) Tích hợp dịch vụ ngoài (adapters)

- ILLMClient (Gemini): generate question set, summaries, ToC; quản lý prompt, parse output, retry (exponential backoff), timeouts, ghi log chi phí (nếu cần).
- IEmailClient (SendGrid/SES): gửi email thông báo (review.assigned, review.completed…).
- IStorageClient (S3/Cloudinary): lưu file, lấy URL.
- IOAuthClient (Google OIDC): exchange code → tokens.
- IPaymentClient (Stripe - TBC): webhook /webhooks/stripe.
- IEventBus (Redis/RabbitMQ): publish/consume sự kiện nền.

### 9) Jobs nền (worker)

- document.ingestion: parse/extract text → update documents.extractedText/status.
- content.summary: cập nhật summaryShort/summaryFull, summaryUpdatedAt.
- questions.generate: sinh questions cho questionSets.
- notifications/email: gửi email theo sự kiện.
- review.assigned/completed: cập nhật trạng thái validationRequests.

Bảo đảm idempotency của job handler (dựa vào Idempotency-Key hoặc jobId).

### 10) Endpoint trọng yếu (phải bám OpenAPI)

Health:

- GET /health → 200

Auth:

- POST /auth/exchange → 200 (JWT tokens), 401 nếu invalid
- POST /auth/refresh → 200 (access token mới)

Users:

- GET /users/me → 200 hoặc 401
- PATCH /users/me → require If-None-Match; 200 (User) hoặc 412 (ETag mismatch)

Subjects:

- GET /subjects → 200 (pagination)
- POST /subjects → 201 (Subject)
- GET /subjects/{id} → 200 (Subject)
- PATCH /subjects/{id} → 200 (Subject)
- DELETE /subjects/{id} → 204

Documents:

- POST /documents → 201 (Document) — multipart hoặc pre-signed flow; enforce size/types
- GET /documents/{id} → 200 (Document)
- GET /documents/{id}/summary → 200 (short/full)

QuestionSets:

- GET /question-sets → 200 (pagination)
- POST /question-sets/generate → 201 (Created) hoặc 202 (Accepted), hỗ trợ Idempotency-Key
- GET /question-sets/{id} → 200
- PATCH /question-sets/{id} → 200
- POST /question-sets/{id}/review → 202 (ValidationRequest)
- POST /question-sets/{id}/share → 200 (tạo/rotate sharedUrl)

QuizAttempts:

- POST /quiz-attempts → 201 (QuizAttempt)
- GET /quiz-attempts/{id} → 200
- POST /quiz-attempts/{id}/submit → 200 (scored attempt)

Validation:

- GET /validation-requests → 200 (admin/expert scope)
- GET /validation-requests/{id} → 200
- PATCH /validation-requests/{id} → 200

Notifications:

- GET /notifications → 200
- PATCH /notifications/{id} → 200

Subscriptions:

- GET /subscription-plans → 200
- GET /user-subscriptions/me → 200
- POST /subscriptions → 201

Admin:

- GET /admin/users → 200 (role=Admin)

Webhooks:

- POST /webhooks/stripe → 200 (không yêu cầu JWT; xác minh chữ ký Stripe)

### 11) Quy tắc triển khai theo lớp

- Controller:
  - Parse input, validate DTO.
  - Lấy user từ req.user (JWT).
  - Gọi service, map kết quả → response theo OpenAPI.
  - Set headers cần thiết (ETag, rate-limit, pagination).
- Service:
  - Kiểm tra quyền (role/owner), trạng thái nghiệp vụ.
  - Giao tiếp repo/adapters, xử lý idempotency, ETag.
  - Tạo event publish cho jobs khi cần.
- Repository:
  - Truy vấn Mongo an toàn (project các trường trả về).
  - Tôn trọng indexes gợi ý.
- Adapter:
  - Bọc API ngoài, timeouts, retry/backoff, circuit breaker nhẹ nếu cần.

### 12) Lỗi & mã trạng thái

- 200/201/202/204 theo từng endpoint.
- 400 ValidationError (input), 401 Unauthorized, 403 Forbidden, 404 NotFound, 409 Conflict (idempotency/unique), 412 Precondition Failed (ETag), 429 TooManyRequests, 5xx (server/provider failures).
- Luôn theo shape lỗi chuẩn: code/message/details.

### 13) Logging & vận hành

- Log có requestId, userId, latency, status, error code; không log secrets/PII.
- Metric cơ bản: latency, rate, error, saturation.
- Retry/backoff cho upstream; dead-letter queue cho job lỗi không phục hồi.
- Graceful shutdown (đóng kết nối DB/queue, ngừng nhận job mới).

### 14) Chuẩn mã & phụ thuộc

- JS ES2020+ (hoặc TS nếu dự án chọn TS; mặc định JS).
- Không thêm thư viện nặng nếu không cần thiết. Khuyến nghị:
  - express, cors, helmet, morgan/pino, express-rate-limit
  - ajv/zod/joi cho validation
  - mongodb (official driver)
  - jsonwebtoken, jwks-rsa (nếu xác minh OIDC)
  - multer (upload) hoặc pre-signed S3 flow
  - node-fetch/axios (calls)
- Tất cả input phải validated trước khi vào service.

### 15) Definition of Done (DoD)

- Endpoint hoạt động theo OpenAPI: paths, params, status, body, headers.
- Bảo mật: JWT bắt buộc, role đúng, kiểm tra sở hữu tài nguyên.
- Validation: DTO + nghiệp vụ + ETag/Idempotency.
- Lỗi theo shape chuẩn, mã trạng thái đúng.
- Test: tối thiểu unit cho service/repo và 1–2 integration happy path cho mỗi resouce chính (Users/Subjects/Documents/QuestionSets/QuizAttempts).
- Tài liệu: cập nhật README/inline JSDoc nơi cần thiết (nếu có).
- Không rò rỉ secrets; biến env qua config.

### 16) Ví dụ nhỏ (chuẩn hóa response)

- GET /subjects (200)
  {
  "items": [
  { "id": "66bb...", "userId": "665f...", "subjectName": "Cấu trúc dữ liệu", "summary": "...", "createdAt": "...", "updatedAt": "..." }
  ],
  "meta": { "page": 1, "pageSize": 20, "totalItems": 1, "totalPages": 1 }
  }
- PATCH /users/me với If-None-Match

  - Request headers: If-None-Match: "W/\"v123\""
  - 200 với ETag mới trong response headers
  - 412 nếu ETag mismatch
- POST /question-sets/generate

  - Headers: Idempotency-Key: "uuid"
  - 201 nếu tạo ngay; 202 nếu xử lý nền; trả về object QuestionSet tối thiểu có id/status.

---

Ghi nhớ:

- Luôn bám theo OpenAPI learinal-openapi.yaml cho tên đường dẫn, tham số, status code.
- Tôn trọng schema và ràng buộc trong docs/mongodb-schema.md.
- Áp dụng kiến trúc và vai trò thành phần từ docs/SDD_Learinal.md.
- Ưu tiên tính nhất quán: pagination envelope, error shape, headers (ETag, Idempotency, rate-limit).
- Mọi thay đổi ảnh hưởng public behavior phải kèm test và cập nhật tài liệu liên quan.
