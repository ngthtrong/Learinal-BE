# Kế hoạch triển khai Backend – Learinal (Full scope theo SRS/SDD)

Cập nhật: 2025-10-28 • Phạm vi: Hoàn thiện toàn bộ API backend bám SRS/SDD và OpenAPI 3.1

Tài liệu tham chiếu:
- SRS: `docs/SRS for Learinal.md`
- SDD: `docs/SDD_Learinal.md`
- OpenAPI: `docs/api/learinal-openapi.yaml` (tóm tắt: `docs/api/learinal-openapi-overview.md`)
- Quy tắc triển khai backend: `.github/instructions/instruction_learinal_backend.instructions.md`

Môi trường & tech đã xác nhận (theo instruction): Node.js LTS (>=18), Express, MongoDB + Mongoose 8, JWT/RBAC, Queue (Redis/RabbitMQ – tùy môi trường), LLM (Gemini), Email (SendGrid/SES), Storage (S3/Cloudinary), Stripe (TBC).

---

## 1) Mục tiêu & Kết quả mong đợi

- Hoàn thiện toàn bộ bề mặt API theo OpenAPI (Health, Auth, Users, Subjects, Documents, QuestionSets, QuizAttempts, Validation, Notifications, Subscriptions, Admin, Webhooks).
- Đảm bảo chuẩn chung: lỗi `{ code, message, details }`, phân trang `{ items, meta }`, JWT + RBAC, Rate limit, ETag/If-None-Match, Idempotency-Key.
- Kiến trúc lớp Controller → Service → Repository/Adapter; Schema Mongoose có validators/enums/indexes, timestamps & versioning (`__v`).
- Tách tác vụ nặng/LLM vào hàng đợi (worker) và hỗ trợ `stub|real` để phát triển song song.
- NFR: bảo mật tối thiểu (HTTPS, JWT/role, validate input), hiệu năng cơ bản (queue/async), quan sát/logs, và bộ test đạt ngưỡng.

Kết quả bàn giao:
- API chạy end-to-end theo hợp đồng OpenAPI.
- Bộ test (unit + integration tối thiểu) xanh trên CI, coverage đạt ngưỡng từng module.
- Tài liệu vận hành/quick start, Postman/collection sẵn có.

---

## 2) Chiến lược triển khai theo track song song (không phụ thuộc)

Áp dụng chế độ `stub|real` theo biến môi trường để mỗi track có thể hoàn thành độc lập, sau đó tích hợp:
- `AUTH_MODE=stub|real`
- `LLM_MODE=stub|real`
- `QUEUE_MODE=stub|real`
- `STORAGE_MODE=local|s3`
- `PAYMENT_MODE=stub|real`
- `DB_MODE=memory|mongo`

Ba track chính (mở rộng hơn bản MVP):

1) BE1 – Nền tảng + Auth + Users + Admin (độc lập)
   - Endpoints: `/health`, `/auth/*`, `/users/me`, `/admin/users`
   - Infra: JWT bearer (stub/real), RBAC theo role, error shape chuẩn, rate-limit headers, ETag/Idempotency.
   - Dữ liệu: users.

2) BE2 – Subjects + Documents + Ingestion/Summary (độc lập)
   - Endpoints: `/subjects*`, `/documents*`, `/documents/{id}/summary`
   - Adapters: Storage (local/S3), LLM (Gemini), Queue (in-process/Redis), Worker (extract/summary).
   - Dữ liệu: subjects, documents.

3) BE3 – QuestionSets + QuizAttempts + Validation + Notifications + Subscriptions + Commission (mở rộng)
   - Endpoints: `/question-sets*`, `/quiz-attempts*`, `/question-sets/{id}/review`, `/validation-requests*`, `/notifications*`, `/subscription-plans`, `/user-subscriptions/me`, `/subscriptions`, `/webhooks/stripe`.
   - Dữ liệu: questionSets, quizAttempts, validationRequests, notifications, subscriptionPlans, userSubscriptions, commissionRecords.
   - Logic: generate/questions (LLM), scoring theo trọng số độ khó, validation workflow, notifications cơ bản, subscriptions (đọc/ghi), commission cho Expert (TBC công thức).

---

## 3) Lộ trình theo giai đoạn (10 tuần theo SRS) – đề xuất

Giai đoạn 0 (Tuần 1): Foundation & Bootstrap
- Khởi tạo hạ tầng: app/server, router, error handler, rate limit headers, request-id, logger, config env.
- Mongoose connection + models skeleton có `timestamps`, `toJSON` transform, indexes chính (users, subjects, documents, questionSets, quizAttempts, validationRequests, notifications, subscriptionPlans, userSubscriptions, commissionRecords).
- Chế độ stub: AUTH/LLM/QUEUE/STORAGE/PAYMENT/DB.
- Health endpoint + CI lint/test scaffold.

Giai đoạn 1 (Tuần 2–3): BE1 – Auth/Users/Admin (stub→real)
- `/auth/exchange`, `/auth/refresh` (stub); `/users/me` GET/PATCH (ETag); `/admin/users` GET.
- Middleware `authenticateJWT`, `authorizeRole`, pagination helpers; chuẩn error/headers.
- Chuyển `AUTH_MODE=real` (Google OIDC) sau khi stub ổn định; không đổi hợp đồng API.
- Tests: ≥ 90% controller/service; 1–2 integration happy path.

Giai đoạn 2 (Tuần 3–5): BE2 – Subjects/Documents/Worker (stub→real)
- CRUD `/subjects*`.
- Upload `/documents` (size ≤ 20MB; `.pdf/.docx/.txt`), GET metadata, GET summary.
- Worker: `document.ingestion` + `content.summary` (retry/backoff, state Uploading→Processing→Completed/Error).
- Adapters: Storage (local→S3), LLM (stub→real), Queue (in-process→Redis).
- Tests: ≥ 85% + integration cho worker (happy/error/timeout).

Giai đoạn 3 (Tuần 5–8): BE3 – QuestionSets/Quiz/Validation/Notifications (stub→real)
- `/question-sets` list/get/patch/share; `/question-sets/generate` (201 sync stub, 202 async real theo config, Idempotency-Key).
- `/quiz-attempts` start/get/submit: chấm điểm theo trọng số độ khó (xem mục 6.1); lưu `userAnswers`, `score`.
- `/question-sets/{id}/review` + `/validation-requests*`: workflow expert/admin; tạo notifications cơ bản.
- Tests: ≥ 85%; property-based test cho scoring (tùy chọn).

Giai đoạn 4 (Tuần 8–10): Subscriptions + Webhooks + Commission + Hardening
- `/subscription-plans`, `/user-subscriptions/me`, `/subscriptions` (bắt đầu/checkout; có thể trả `checkoutUrl`).
- `/webhooks/stripe`: xác minh chữ ký; cập nhật `userSubscriptions` và entitlement.
- Commission: tính/ghi `commissionRecords` khi Expert hoàn thành review hoặc theo doanh thu gói premium (TBC chi tiết); endpoint báo cáo tối thiểu (nếu cần nội bộ/admin).
- Bảo mật/hiệu năng/observability hardening; rà soát indexes; chạy performance smoke.

Mốc demo tích hợp: cuối mỗi giai đoạn; mốc cuối tuần 10 chạy E2E full flow.

---

## 4) Danh mục công việc chi tiết theo module

Dưới đây là checklist bám `docs/api/learinal-openapi.yaml`. Không bổ sung endpoint ngoài spec.

Health
- [ ] GET `/health`

Auth
- [ ] POST `/auth/exchange` (stub→real)
- [ ] POST `/auth/refresh`

Users
- [ ] GET `/users/me` (trả ETag)
- [ ] PATCH `/users/me` (If-None-Match, 412 khi mismatch)

Subjects
- [ ] GET `/subjects` (pagination, sort)
- [ ] POST `/subjects`
- [ ] GET `/subjects/{id}`
- [ ] PATCH `/subjects/{id}`
- [ ] DELETE `/subjects/{id}` (204)

Documents
- [ ] POST `/documents` (multipart; validate size/type; status Uploading→Processing)
- [ ] GET `/documents/{id}`
- [ ] GET `/documents/{id}/summary` (short/full)

QuestionSets
- [ ] GET `/question-sets` (pagination, filter status)
- [ ] POST `/question-sets/generate` (Idempotency-Key; 201/202)
- [ ] GET `/question-sets/{id}`
- [ ] PATCH `/question-sets/{id}` (metadata/questions)
- [ ] POST `/question-sets/{id}/share` (tạo/rotate link; unique index)

QuizAttempts
- [ ] POST `/quiz-attempts` (start)
- [ ] GET `/quiz-attempts/{id}`
- [ ] POST `/quiz-attempts/{id}/submit` (tính điểm; lưu results)

Validation
- [ ] POST `/question-sets/{id}/review` (tạo ValidationRequest = queued)
- [ ] GET `/validation-requests` (expert/admin; pagination)
- [ ] GET `/validation-requests/{id}`
- [ ] PATCH `/validation-requests/{id}` (status: InProgress/Completed/Rejected; lý do từ chối)

Notifications
- [ ] GET `/notifications` (pagination)
- [ ] PATCH `/notifications/{id}` (mark as read)

Subscriptions
- [ ] GET `/subscription-plans`
- [ ] GET `/user-subscriptions/me`
- [ ] POST `/subscriptions` (Idempotency-Key; có thể trả `checkoutUrl`)

Admin
- [ ] GET `/admin/users` (role=Admin)

Webhooks
- [ ] POST `/webhooks/stripe` (unauthenticated; verify signature)

---

## 5) Kiến trúc & thực thi (ràng buộc bắt buộc)

- Lớp Controller → Service → Repository/Adapter; Controller không gọi DB trực tiếp.
- Mongoose:
  - `timestamps: true` cho mọi schema; giữ `versionKey: __v`.
  - Schema validators: enum, min/max, match; indexes (unique/partial) đúng theo domain.
  - ETag dựa trên `__v` (khuyến nghị: `W/"v<__v>"`); update có điều kiện theo `__v` → mismatch trả 412.
  - Đọc `.lean()` + projection; mapping `_id` → `id` và bỏ `__v` ở `toJSON`.
- Middleware bắt buộc: `authenticateJWT`, `authorizeRole`, `rateLimit`, `inputValidation`, `errorHandler`, `requestId`, `etag`, `idempotencyKey`.
- Adapters: `llmClient`, `emailClient`, `storageClient`, `oauthClient`, `eventBus`, `paymentClient` (TBC), có `stub|real`.
- Jobs/worker: `document.ingestion`, `content.summary`, `questions.generate`, `notifications.email`, `review.assigned/completed`; idempotent + retry/backoff; DLQ nếu không phục hồi.

---

## 6) Quy tắc nghiệp vụ trọng yếu (theo SRS/SDD)

6.1 Chấm điểm Quiz theo trọng số độ khó (SRS v0.2)
- Mức độ câu hỏi: `"Biết", "Hiểu", "Vận dụng", "Vận dụng cao"`.
- Đề xuất trọng số (TBC bởi PO):
  - Biết = 1.0; Hiểu = 1.2; Vận dụng = 1.5; Vận dụng cao = 2.0.
- Cách tính (gợi ý): `score = 100 * (tổng trọng số câu đúng) / (tổng trọng số tất cả câu)`; làm tròn 2 chữ số thập phân.
- Tách utility `scoring.ts|js` + tests: tất cả đúng, tất cả sai, pha trộn độ khó, biên `numQuestions`.

6.2 Sinh question set bằng LLM
- Idempotency-Key cho yêu cầu generate; có thể xử lý async (202) với job `questions.generate`.
- Kiểm soát chi phí: batch tokens, hạn mức rate; lưu log cơ bản nếu cần.
- Chuẩn hóa kết quả: shape Question, khó/đáp án/explanation hợp lệ.

6.3 Quy trình Validation (Expert/Admin)
- Tạo `ValidationRequest` trạng thái `queued` → `in-progress` → `completed/rejected`.
- Partial unique index bảo đảm không có 2 yêu cầu mở cho cùng 1 set (Pending/InProgress).
- Gửi notification khi assign/completed.

6.4 Chia sẻ bộ đề (share link)
- Tạo/rotate `shareLink` unique (index), TTL (tùy chọn), ẩn thông tin nhạy cảm.

6.5 Subscriptions & Commission (TBC chi tiết)
- Subscriptions: nhiều gói (Monthly/Yearly), entitlements snapshot khi mua.
- Webhook Stripe: xác minh chữ ký; cập nhật `userSubscriptions` (Active/Expired/Cancelled/PendingPayment).
- Commission cho Expert:
  - Gợi ý 1: Hoa hồng cố định/đơn review thành công.
  - Gợi ý 2: Hoa hồng theo lượt sử dụng bộ đề đã được thẩm định (tỷ lệ doanh thu).
  - Quy định cuối cùng do PO duyệt; tách `commission.service` để thay đổi công thức dễ dàng.

---

## 7) Chất lượng & vận hành

- Quality Gates (CI):
  - Build: PASS
  - Lint: PASS (ESLint – đã có `eslint.config.mjs`)
  - Tests: PASS (BE1 ≥ 90%, BE2/BE3 ≥ 85%)
  - Security basic: PASS (JWT verify, role guard, input validation, upload type/size)
  - Observability: request-id, structured logs, rate-limit headers
- DoD (mỗi module):
  - Hợp đồng khớp OpenAPI; lỗi chuẩn; headers đúng (ETag/Idempotency/Rate limit)
  - RBAC/ownership checks; indexes hợp lý
  - Tests xanh; tài liệu cập nhật

---

## 8) Rủi ro & phương án

- OAuth Google (clientId/secret, redirectUri): bắt đầu stub, chuyển real khi sẵn.
- LLM chi phí/hạn mức: throttle + queue; `LLM_MODE=stub` cho test.
- Upload: validate MIME/extension/size; tách storage local→S3; cân nhắc scan cơ bản.
- Queue: Redis dev; có thể nâng lên RabbitMQ khi routing phức tạp.
- Công thức điểm/hoa hồng: bọc trong service để đổi hot-swap, kèm test.
- Tải lớn: pagination/indexes; `.lean()`; tối ưu projection.

---

## 9) Phân công & timeline gợi ý

- BE1 (1 dev): Auth/Users/Admin/Infra; tuần 1–3.
- BE2 (1–2 dev): Subjects/Documents/Worker; tuần 2–5.
- BE3 (1–2 dev): QuestionSets/Quiz/Validation/Notifications/Subscriptions/Commission; tuần 5–10.
- Tích hợp E2E: tuần 8–10.

---

## 10) Thử nhanh (stub mode – Windows PowerShell)

1) Đặt biến môi trường (ví dụ chỉ cho BE1):

```powershell
$env:AUTH_MODE="stub"; $env:DB_MODE="memory"; npm run start
```

2) Gọi endpoint (ví dụ):
- Health: GET http://localhost:3000/api/v1/health
- Exchange (stub): POST http://localhost:3000/api/v1/auth/exchange
  - Headers: `X-Dev-User-Id: demo-user-1`, `X-Dev-User-Role: Admin`
- Me: GET http://localhost:3000/api/v1/users/me
  - Headers: `X-Dev-User-Id: demo-user-1`
- Patch me (ETag):
  - GET /users/me → lấy header `ETag`
  - PATCH /users/me với header `If-None-Match: <etag>` và body `{ "fullName": "New Name" }`

---

## 11) Theo dõi & Deliverables

- Mốc demo cuối mỗi giai đoạn; đính kèm log/kịch bản test.
- Artefacts: OpenAPI cập nhật; bộ test HTTP (Postman/Thunder); checklist DoD đã tick.
- Báo cáo tiến độ hằng tuần: đường găng, blocked, rủi ro mới, quyết định trọng yếu (scoring/commission công thức).

---

## 12) Phụ lục – Mapping schema Mongo (tóm tắt)

- User: role ∈ {Learner, Expert, Admin}; status ∈ {PendingActivation, Active, Deactivated}; unique email; subscription fields.
- Subject: userId, subjectName, description?, tableOfContents?, summary?; indexes (userId+createdAt).
- Document: subjectId, ownerId, originalFileName, fileType (.pdf/.docx/.txt), fileSize, storagePath, extractedText?, summaryShort?, summaryFull?, summaryUpdatedAt?, status, uploadedAt.
- QuestionSet: title, description?, subjectId, creatorId, questions[], timeLimit?, status ∈ {Draft, Public, PendingReview, Validated, Rejected, Published}, shareLink?, isShared, createdAt/updatedAt; unique index shareLink; questions[].difficultyLevel theo enum SRS.
- QuizAttempt: userId, setId, startedAt, completedAt?, score, totalQuestions, correctAnswers, userAnswers[].
- ValidationRequest: setId, requesterId, assignedAdminId?, status, createdAt/updatedAt; partial unique cho yêu cầu mở.
- Notification: userId, type, message, isRead, createdAt.
- SubscriptionPlan: id/name/cycle/price/entitlements, updatedAt.
- UserSubscription: userId, planId, status (Active/Expired/Cancelled/PendingPayment), entitlementsSnapshot.
- CommissionRecord: expertId, setId, transactionDate, status ∈ {Pending, Paid}; (công thức TBC).

Định nghĩa chi tiết xem `docs/mongodb-schema.md` và cập nhật index ngay trên Schema.
