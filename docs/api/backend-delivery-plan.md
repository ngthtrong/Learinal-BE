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

## 2) Kế hoạch không phụ thuộc giữa BE1/BE2/BE3 (phát triển song song)

Mục tiêu: Mỗi track (BE1/BE2/BE3) có thể phát triển và kiểm thử độc lập mà không chờ module khác, nhờ cơ chế mock/stub và feature flags. Lịch tích hợp end-to-end được tách ở cuối mục.

Chế độ chung cho “không phụ thuộc” (áp dụng cho mọi track):
- Cho phép bật STUB/REAL qua biến môi trường: `AUTH_MODE=stub|real`, `LLM_MODE=stub|real`, `QUEUE_MODE=stub|real`, `STORAGE_MODE=local|s3`, `PAYMENT_MODE=stub|real`.
- Chuẩn test dev: chấp nhận header `X-Dev-User-Id` và `X-Dev-User-Role` khi `AUTH_MODE=stub` để giả lập danh tính/role.
- Cung cấp fixtures và in-memory repo để chạy tích hợp tối thiểu không cần Mongo (tùy chọn); khi `DB_MODE=memory|mongo`.
- Cho phép tạo dữ liệu seed bằng script riêng cho từng track (fixtures JSON).

Song song theo track:

1. BE1 – Health + Auth + Users + Nền tảng (ĐỘC LẬP)
   - Endpoints triển khai ngay ở `AUTH_MODE=stub` (không chờ Google OIDC), sau đó chuyển `real`:
     - GET `/health`
     - POST `/auth/exchange` (stub: trả JWT giả hợp lệ), POST `/auth/refresh`
     - GET `/users/me`, PATCH `/users/me` (ETag/If-None-Match sẵn có)
     - GET `/admin/users`
   - Middleware hạ tầng (dùng được cho cả BE2/BE3 nhưng không bắt buộc trong chế độ stub):
     - JWT bearer (stub hoặc verify real), RBAC (dựa trên `X-Dev-User-Role` khi stub)
     - Error handler chuẩn hóa `{code,message,details}`
     - Rate-limit headers, pagination helpers
     - Idempotency-Key và ETag infra

2. BE2 – Subjects + Documents + Ingestion/Summary (ĐỘC LẬP)
   - Khi `AUTH_MODE=stub`, nhận `X-Dev-User-Id/Role` để xác định ownership, không cần BE1 hoàn tất.
   - Endpoints:
     - GET/POST `/subjects`, GET/PATCH/DELETE `/subjects/{id}`
     - POST `/documents`, GET `/documents/{id}`, GET `/documents/{id}/summary`
   - Adapters có thể chạy ở stub mode:
     - StorageAdapter: `STORAGE_MODE=local` (lưu thư mục tạm), validate `.pdf/.docx/.txt` ≤ 20MB.
     - LLMAdapter: `LLM_MODE=stub` trả về summary giả, chuyển `real` sau.
     - Queue: `QUEUE_MODE=stub` (run in-process) trước khi dùng Redis/RabbitMQ.
   - Worker: extract text + summarize (retry/backoff) hoạt động nội bộ trong stub mode.

3. BE3 – QuestionSets + QuizAttempts + Validation + Notifications (ĐỘC LẬP)
   - Chạy với `AUTH_MODE=stub` và data fixtures nếu BE2 chưa có:
     - Cho phép tạo QuestionSet từ payload custom khi `LLM_MODE=stub` (không phụ thuộc Documents thực tế).
   - Endpoints:
     - GET `/question-sets`, POST `/question-sets/generate`, GET/PATCH `/question-sets/{id}`, POST `/question-sets/{id}/share`
     - POST `/quiz-attempts`, GET `/quiz-attempts/{id}`, POST `/quiz-attempts/{id}/submit`
     - POST `/question-sets/{id}/review`, GET `/validation-requests`, GET/PATCH `/validation-requests/{id}`
     - GET `/notifications`, PATCH `/notifications/{id}`
   - Logic:
     - Enforce `difficultyLevel ∈ {Biết, Hiểu, Vận dụng, Vận dụng cao}`, `numQuestions ∈ [1..100]`, Idempotency-Key cho generate
     - Scoring utility tách riêng, test độc lập
     - Validation workflow có thể chạy với in-memory repo trước khi nối Mongo và MQ thực

Lịch tích hợp end-to-end (không ảnh hưởng phát triển song song):
- Bước 1: Bật `AUTH_MODE=real` (Google OIDC) ở BE1, còn lại giữ stub → kiểm thử Auth/Users.
- Bước 2: BE2 chuyển `DB_MODE=mongo`, `STORAGE_MODE=s3` (hoặc giữ local), `LLM_MODE=real` riêng lẻ → kiểm thử Documents/summary.
- Bước 3: BE3 nối với dữ liệu thực của BE2 (QuestionSets generate dùng document thực), `QUEUE_MODE=real` → chạy full flow.

Đường găng demo E2E gợi ý (chỉ cho stage tích hợp): 2 → 3 → 4 → 5 → 6 → 7 → 8 (Subscriptions/Admin/Webhooks bật sau). Track dev nội bộ vẫn không phụ thuộc như trên.

---

## 3) Phân công cho team backend (3 thành viên)

Mỗi người own theo domain + service, chịu trách nhiệm controller/service/repo/tests/docs.

### BE1 – Auth & Users & Nền tảng (RBAC/ETag/Errors)
- Endpoints: `/health`, `/auth/*`, `/users/me`, `/admin/users`
- Infra: JWT verify (stub/real), role guard (stub/real), error formatter, rate-limit headers, pagination helpers, ETag/If-None-Match, Idempotency-Key
- Data: `users` (unique email, indexes theo SRS/DB schema)
- Acceptance (không phụ thuộc):
   - Chạy được hoàn toàn với `AUTH_MODE=stub` (JWT giả lập hợp lệ) và chuyển sang `real` không đổi hợp đồng API
   - Đổi code → token (stub/real), refresh token OK; 401/403 theo Error schema
   - GET/PATCH `/users/me` có ETag; PATCH trả 412 khi ETag mismatch
   - RBAC theo role (stub dựa `X-Dev-User-Role`); rate-limit headers; logs có request-id
   - Tests ≥ 90% controller/service; contract khớp OpenAPI

### BE2 – Subjects & Documents & Ingestion/LLM Worker
- Endpoints: `/subjects*`, `/documents*`, `/documents/{id}/summary`
- Adapters: StorageAdapter (local/S3), LLMAdapter (Gemini), Queue (Redis→RabbitMQ TBC) – tất cả đều có chế độ stub
- Jobs: extract text + summarize async với retry/backoff; DLQ khi lỗi không phục hồi
- Acceptance (không phụ thuộc):
   - Hoạt động full với `AUTH_MODE=stub` (dựa `X-Dev-User-Id`), `DB_MODE=memory|mongo`, `STORAGE_MODE=local`, `LLM_MODE=stub`
   - Upload `.pdf/.docx/.txt` ≤20MB: 415 nếu sai loại, 413 nếu quá dung lượng
   - Tài liệu chuyển trạng thái; summary hiển thị khi job Completed; GET summary hợp lệ
   - Retry/backoff cho LLM (stub/real), metrics cơ bản; indexes Mongo theo `mongodb-schema.md`
   - Tests ≥ 85% (+ integration cho worker happy/error/timeout)

### BE3 – QuestionSets, QuizAttempts, Validation, Notifications
- Endpoints: `/question-sets*`, `/quiz-attempts*`, `/question-sets/{id}/review`, `/validation-requests*`, `/notifications*`
- Domain:
  - Generate đề: enforce `difficultyLevel ∈ {Biết, Hiểu, Vận dụng, Vận dụng cao}`, `numQuestions ∈ [1..100]`, `Idempotency-Key`
  - Quiz scoring: tính điểm theo trọng số độ khó (SRS/`mongodb-schema.md`), lưu `score`, `userAnswers`
  - Validation: tạo `ValidationRequest` (Queued), list/patch theo vai trò Expert/Admin
  - Share link: tạo/rotate, unique index
- Acceptance (không phụ thuộc):
   - Chạy full với `AUTH_MODE=stub`, `LLM_MODE=stub`, `DB_MODE=memory|mongo` mà không cần Documents thật
   - POST `/question-sets/generate` trả 201 (sync stub) hoặc 202 (async) theo config; schema chuẩn; hỗ trợ Idempotency-Key
   - Submit quiz: chấm điểm đúng; test biên: 0 đúng, tất cả đúng, độ khó pha trộn
   - Validation: chuyển trạng thái, timestamps; Notifications: tạo tối thiểu theo sự kiện nội bộ (stub)
   - Tests ≥ 85% (+ property-based test cho scoring – tùy chọn)

---

## 4) Lộ trình 2 sprint (khuyến nghị)

### Sprint 1 (2 tuần): Phát triển song song ở chế độ stub (không phụ thuộc)
- BE1: `/health`, `/auth/*` (stub), `/users/me`, RBAC (stub), errors, pagination helpers, ETag/Idempotency infra
- BE2: `/subjects*`, `/documents` upload/GET, worker (extract) chạy `QUEUE_MODE=stub`, trạng thái Uploading→Processing→Completed/Error
- BE3: `/question-sets` (GET), `/question-sets/generate` (201 sync stub, 202 async stub), `/question-sets/{id}` GET/PATCH, `/question-sets/{id}/share`
- Mốc demo nội bộ: Từng track demo độc lập bằng stub auth/llm/queue/storage

### Sprint 2 (2 tuần): Tích hợp dần REAL, mở rộng tính năng
- BE3: `/quiz-attempts` start/submit/score, `/question-sets/{id}/review`, `/validation-requests*`
- BE2: `/documents/{id}/summary` hoàn thiện + resilience (retry/backoff, DLQ), tối ưu indexes, có thể bật `LLM_MODE=real`
- BE1: `/admin/users`, harden rate-limit headers, logs/observability (request-id, user-id), có thể bật `AUTH_MODE=real`
- Nice-to-have: `/notifications*`, `/subscription-plans`, `/user-subscriptions/me`, `/subscriptions` (PendingPayment)
- Mốc demo tích hợp: Làm bài từ đề sinh ra (có/không LLM real), gửi yêu cầu thẩm định, nhận thông báo

> Sprint 3 (tùy chọn): Subscriptions đầy đủ, Webhook Stripe, performance pass, security hardening.

---

## 2b) Danh sách toàn bộ endpoints (đối chiếu OpenAPI)

Health
- [ ] GET `/health`

Auth
- [ ] POST `/auth/exchange`
- [ ] POST `/auth/refresh`

Users
- [ ] GET `/users/me`
- [ ] PATCH `/users/me`

Subjects
- [ ] GET `/subjects`
- [ ] POST `/subjects`
- [ ] GET `/subjects/{id}`
- [ ] PATCH `/subjects/{id}`
- [ ] DELETE `/subjects/{id}`

Documents
- [ ] POST `/documents`
- [ ] GET `/documents/{id}`
- [ ] GET `/documents/{id}/summary`

QuestionSets
- [ ] GET `/question-sets`
- [ ] POST `/question-sets/generate`
- [ ] GET `/question-sets/{id}`
- [ ] PATCH `/question-sets/{id}`
- [ ] POST `/question-sets/{id}/share`

QuizAttempts
- [ ] POST `/quiz-attempts`
- [ ] GET `/quiz-attempts/{id}`
- [ ] POST `/quiz-attempts/{id}/submit`

Validation
- [ ] POST `/question-sets/{id}/review`
- [ ] GET `/validation-requests`
- [ ] GET `/validation-requests/{id}`
- [ ] PATCH `/validation-requests/{id}`

Notifications
- [ ] GET `/notifications`
- [ ] PATCH `/notifications/{id}`

Subscriptions
- [ ] GET `/subscription-plans`
- [ ] GET `/user-subscriptions/me`
- [ ] POST `/subscriptions`

Admin
- [ ] GET `/admin/users`

Webhooks
- [ ] POST `/webhooks/stripe`

Ghi chú: Danh sách trên phản ánh toàn bộ bề mặt API trong `docs/api/learinal-openapi.yaml`. Không bổ sung endpoint mới ngoài phạm vi OpenAPI.

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
