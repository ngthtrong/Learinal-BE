# Backend Delivery Plan – Learinal (MVP v0.1)

Cập nhật: 2025-10-25 • Phạm vi: API cho MVP v0.1 theo SRS/SDD

Tham chiếu:
- SRS: `docs/SRS for Learinal.md`
- SDD: `docs/SDD_Learinal.md`
- OpenAPI: `docs/api/learinal-openapi.yaml` (tóm tắt: `docs/api/learinal-openapi-overview.md`)

---

## 1) Nguyên tắc & Mục tiêu

- Ưu tiên đường găng để có luồng end-to-end: Đăng nhập → tạo Subject → upload Document → sinh QuestionSet → làm bài Quiz → yêu cầu Validation.
- Bám hợp đồng OpenAPI 3.1, chuẩn hóa error `{ code, message, details }`, JWT + RBAC, phân trang `{ items, meta }`.
- Tách nền tảng (auth/RBAC/error/rate-limit) và xử lý LLM (ingestion/summarize/generate) qua hàng đợi (worker) để đảm bảo hiệu năng.

---

## 2) Thứ tự ưu tiên hoàn thiện API (theo module)

1. Health + Nền tảng bảo mật
   - GET `/health`
   - Middleware: JWT bearer, RBAC (Learner/Expert/Admin), error handler, rate-limit headers, Idempotency-Key, ETag infra

2. Auth + Users [đường găng]
   - POST `/auth/exchange`, POST `/auth/refresh`
   - GET `/users/me`, PATCH `/users/me`

3. Subjects [cốt lõi]
   - GET/POST `/subjects`, GET/PATCH/DELETE `/subjects/{id}`

4. Documents (upload + summary) [đường găng LLM]
   - POST `/documents`, GET `/documents/{id}`, GET `/documents/{id}/summary`
   - Worker: extract text + summarize (async), status: Uploading → Processing → Completed/Error

5. Question Sets (LLM generate + CRUD) [đường găng]
   - GET `/question-sets`, POST `/question-sets/generate`, GET/PATCH `/question-sets/{id}`, POST `/question-sets/{id}/share`

6. Quiz Attempts (start/submit/score) [đường găng]
   - POST `/quiz-attempts`, GET `/quiz-attempts/{id}`, POST `/quiz-attempts/{id}/submit`

7. Validation (chuyên gia) [sau khi có QuestionSets]
   - POST `/question-sets/{id}/review`, GET `/validation-requests`, GET/PATCH `/validation-requests/{id}`

8. Notifications (hỗ trợ)
   - GET `/notifications`, PATCH `/notifications/{id}`

9. Subscriptions (TBC thanh toán trong MVP)
   - GET `/subscription-plans`, GET `/user-subscriptions/me`, POST `/subscriptions`

10. Admin
   - GET `/admin/users`

11. Webhooks (Stripe) [để sau]
   - POST `/webhooks/stripe`

Đường găng MVP: 2 → 3 → 4 → 5 → 6 → 7 → 8 (9/10/11 bật sau nếu cần).

---

## 3) Phân công cho team backend (3 thành viên)

Mỗi người own theo domain + service, chịu trách nhiệm controller/service/repo/tests/docs.

### BE1 – Auth & Users & Nền tảng (RBAC/ETag/Errors)
- Endpoints: `/health`, `/auth/*`, `/users/me`, `/admin/users`
- Infra: JWT verify, role guard, error formatter, rate-limit headers, pagination helpers, ETag/If-None-Match
- Data: `users` (unique email, indexes theo SRS/DB schema)
- Acceptance
  - Đổi code → token, refresh token OK; 401/403 theo Error schema
  - GET/PATCH `/users/me` có ETag; PATCH trả 412 khi ETag mismatch
  - RBAC theo vai trò; rate-limit headers có mặt; logs có request-id
  - Tests ≥ 90% controller/service; contract khớp OpenAPI

### BE2 – Subjects & Documents & Ingestion/LLM Worker
- Endpoints: `/subjects*`, `/documents*`, `/documents/{id}/summary`
- Adapters: StorageAdapter (local/S3), LLMAdapter (Gemini), Queue (Redis→RabbitMQ TBC)
- Jobs: extract text + summarize async với retry/backoff; DLQ khi lỗi không phục hồi
- Acceptance
  - Upload `.pdf/.docx/.txt` ≤20MB: 415 nếu sai loại, 413 nếu quá dung lượng
  - Tài liệu chuyển trạng thái; summary xuất hiện khi job Completed; GET summary hợp lệ
  - Retry policy LLM, metrics cơ bản; indexes Mongo theo `mongodb-schema.md`
  - Tests ≥ 85% (+ integration cho worker happy/error/timeout)

### BE3 – QuestionSets, QuizAttempts, Validation, Notifications
- Endpoints: `/question-sets*`, `/quiz-attempts*`, `/question-sets/{id}/review`, `/validation-requests*`, `/notifications*`
- Domain:
  - Generate đề: enforce `difficultyLevel ∈ {Biết, Hiểu, Vận dụng, Vận dụng cao}`, `numQuestions ∈ [1..100]`, `Idempotency-Key`
  - Quiz scoring: tính điểm theo trọng số độ khó (SRS/`mongodb-schema.md`), lưu `score`, `userAnswers`
  - Validation: tạo `ValidationRequest` (Queued), list/patch theo vai trò Expert/Admin
  - Share link: tạo/rotate, unique index
- Acceptance
  - POST `/question-sets/generate` trả 201 hoặc 202 (async) theo config; schema chuẩn
  - Submit quiz chấm điểm đúng; test các biên: 0 đúng, tất cả đúng, trộn độ khó
  - Validation chuyển trạng thái và timestamps; Notifications tạo theo sự kiện (tối thiểu)
  - Tests ≥ 85% (+ property-based test cho scoring – tùy chọn)

---

## 4) Lộ trình 2 sprint (khuyến nghị)

### Sprint 1 (2 tuần): Nền tảng + đến “tạo đề”
- BE1: `/health`, `/auth/*`, `/users/me`, RBAC, errors, pagination helpers, ETag infra
- BE2: `/subjects*`, `/documents` upload/GET, worker nền (extract), trạng thái Uploading→Processing→Completed/Error
- BE3: `/question-sets` (GET), `/question-sets/generate` (201 sync trước, 202 async sau), `/question-sets/{id}` GET/PATCH, `/question-sets/{id}/share`
- Mốc demo: Login → tạo Subject → upload Document → generate QuestionSet → xem/biên tập đề

### Sprint 2 (2 tuần): Làm bài + Thẩm định + Thông báo + Harden
- BE3: `/quiz-attempts` start/submit/score, `/question-sets/{id}/review`, `/validation-requests*`
- BE2: `/documents/{id}/summary` hoàn thiện + resilience (retry/backoff, DLQ), tối ưu indexes
- BE1: `/admin/users`, harden rate-limit headers, logs/observability (request-id, user-id)
- Nice-to-have: `/notifications*`, `/subscription-plans`, `/user-subscriptions/me`, `/subscriptions` (PendingPayment)
- Mốc demo: Làm bài từ đề đã sinh, chấm điểm, gửi yêu cầu thẩm định, Expert cập nhật, User nhận thông báo

> Sprint 3 (tùy chọn): Subscriptions đầy đủ, Webhook Stripe, performance pass, security hardening.

---

## 5) Phụ thuộc & Rủi ro

- OAuth Google: cần clientId/secret (dev dùng mock hoặc OAuth playground); bảo vệ redirectUri
- LLM chi phí/hạn mức: throttle phía app, queue tách tải, stub LLM cho test
- Upload an toàn: kiểm MIME/extension, scan cơ bản (tối thiểu validate), local storage trước S3/CDN
- Queue: Redis cho dev, nâng cấp RabbitMQ khi cần routing phức tạp
- Công thức điểm/hoa hồng: bọc trong service/utility để thay đổi dễ dàng

---

## 6) Definition of Done (DoD) – mỗi endpoint/module

- Hợp đồng khớp OpenAPI (`request`, `response`, mã lỗi, headers chuẩn)
- Unit + integration tests đạt ngưỡng; CI xanh
- RBAC, rate-limit, Idempotency-Key/ETag (nếu áp dụng) có test
- Logging/metrics cơ bản; error shape thống nhất; trace id
- Indexes Mongo phù hợp: user-scoped, status, createdAt; `shareLink` unique nếu dùng
- Docs: README module + test collection (Postman/Thunder) hoặc kịch bản thử nhanh

---

## 7) Quality Gates (CI/CD)

- Build: PASS (cấu hình CI chạy build/test)
- Lint/Typecheck: PASS (ESLint + TS nếu dùng TypeScript)
- Tests: PASS (BE1 ≥90%, BE2/BE3 ≥85%)
- Security basic: PASS (JWT verify, role guard, kiểm input, upload file size/type)
- Observability: tối thiểu request-id, structured logs; rate-limit headers

---

## 8) Theo dõi & Deliverables

- Mốc demo Sprint 1, Sprint 2 như trên
- Artefacts: OpenAPI cập nhật; bộ test HTTP; logs demo; checklist DoD đã tick
- Liên kết: `docs/api/learinal-openapi.yaml`, `docs/mongodb-schema.md`, `docs/SDD_Learinal.md`

---

## 9) Checklist thực thi nhanh (gợi ý)

- [ ] JWT/RBAC/Errors/rate-limit/ETag nền tảng
- [ ] Subjects CRUD
- [ ] Documents upload + status + summary (worker)
- [ ] QuestionSets list/generate/get/patch/share
- [ ] QuizAttempts start/get/submit (scoring theo độ khó)
- [ ] Validation request/list/patch
- [ ] Notifications list/mark-read (tối thiểu)
- [ ] Admin users list (tối thiểu)
- [ ] Subscriptions (read-only + tạo đơn, TBC thanh toán)
- [ ] Webhooks Stripe (sau)
