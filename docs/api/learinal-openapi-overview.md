# Learinal API – Tóm tắt OpenAPI (vi)

Tài liệu này tóm tắt nhanh hợp đồng API từ file nguồn `docs/api/learinal-openapi.yaml` (OpenAPI 3.1). Dùng khi bạn cần đọc nhanh phạm vi tính năng, bảo mật, quy ước, mô hình dữ liệu và danh mục endpoint theo module.

Xem hướng dẫn “chạy” OpenAPI (Swagger UI, ReDoc, mock Prism, lint, generate client) trong `docs/api/README.md`.

## Thông tin chung
- Tên: Learinal API
- Phiên bản: 0.1.0
- Chuẩn: OpenAPI 3.1.0
- Base path: `/api/v1` (chọn ở mục Servers)

### Servers (môi trường)
- Prod: `https://api.learinal.example.com/api/v1`
- Staging: `https://staging.api.learinal.example.com/api/v1`
- Local: `http://localhost:8080/api/v1`

### Bảo mật
- Toàn cục: Bearer JWT (`Authorization: Bearer <token>`) – `components.securitySchemes.bearerAuth`.
- Vai trò: `Learner`, `Expert`, `Admin`. Một số endpoint admin/validation yêu cầu quyền phù hợp.

### Quy ước (conventions)
- Phân trang: query `page`, `pageSize`; response trả `{ items: [], meta: { page, pageSize, total, totalPages } }`.
- Sắp xếp: `sort` (ví dụ `-createdAt`).
- ETag/Optimistic Lock: với `GET /users/me` trả header `ETag`; update dùng `If-None-Match`/`If-Match` tùy ngữ cảnh.
- Idempotency: header `Idempotency-Key` cho POST/PUT quan trọng (ví dụ: generate question set, tạo subscription) để retry an toàn.
- Rate limit: mặc định 60 rpm/IP; header: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `Retry-After`.
- Upload file: tối đa 20MB; định dạng: `.pdf`, `.docx`, `.txt`.

## Mô hình dữ liệu (schemas – tóm tắt)
- Error: `{ code, message, details }`.
- PaginationMeta: `{ page, pageSize, total, totalPages }`.
- User: thông tin người dùng, vai trò, trạng thái, thông tin gói đăng ký, `createdAt`, `updatedAt`.
- Subject: môn/chủ đề học có `subjectName`, `description`, `tableOfContents`, `summary`.
- Document: tệp người dùng tải lên thuộc `subjectId`, metadata file, text trích xuất, tóm tắt ngắn/đầy đủ, trạng thái xử lý.
- Question: câu hỏi trắc nghiệm với `options`, `correctAnswerIndex`, `difficultyLevel` ("Biết","Hiểu","Vận dụng","Vận dụng cao").
- QuestionSet: tập câu hỏi với `questions[]`, `status` (Draft/Public/PendingReview/Validated/Rejected/Published), `isShared`, `shareLink`.
- QuizAttempt: lần làm bài gồm điểm, số câu đúng, chi tiết trả lời.
- ValidationRequest: yêu cầu thẩm định cho QuestionSet (queued/in-progress/completed/rejected).
- Notification: thông báo người dùng (`info/success/warning/error`), `isRead`.
- SubscriptionPlan: gói đăng ký (Monthly/Yearly), giá, entitlement.
- UserSubscription: lịch sử đăng ký người dùng, `status` (Active/Expired/Cancelled/PendingPayment).

## Danh mục endpoint theo module

### Health
- GET `/health` – Kiểm tra liveness/readiness.

### Auth
- POST `/auth/exchange` – Đổi OAuth authorization code sang cặp JWT (access/refresh).
- POST `/auth/refresh` – Lấy access token mới từ refresh token.

### Users
- GET `/users/me` – Lấy hồ sơ người dùng hiện tại (trả `ETag`).
- PATCH `/users/me` – Cập nhật họ tên; dùng `If-None-Match` để tránh ghi đè.

### Subjects
- GET `/subjects` – Liệt kê subject của user (có phân trang).
- POST `/subjects` – Tạo subject (yêu cầu `subjectName`).
- GET `/subjects/{id}` – Lấy chi tiết một subject.
- PATCH `/subjects/{id}` – Cập nhật subject.
- DELETE `/subjects/{id}` – Xóa subject.

### Documents
- POST `/documents` – Upload tài liệu (multipart/form-data). Ràng buộc: 20MB; `.pdf/.docx/.txt`; cần `subjectId`.
- GET `/documents/{id}` – Lấy metadata tài liệu.
- GET `/documents/{id}/summary` – Lấy tóm tắt ngắn/đầy đủ của tài liệu.

### Question Sets
- GET `/question-sets` – Liệt kê các bộ câu hỏi của user (phân trang, lọc `status`).
- POST `/question-sets/generate` – Tạo bộ câu hỏi bằng LLM từ `documentId`; hỗ trợ `topics`, `difficulty`, `numQuestions` (1–100). Nên gửi `Idempotency-Key`.
- GET `/question-sets/{id}` – Lấy chi tiết bộ câu hỏi.
- PATCH `/question-sets/{id}` – Cập nhật tiêu đề/mô tả/danh sách câu hỏi/trạng thái.
- POST `/question-sets/{id}/review` – Yêu cầu chuyên gia thẩm định.
- POST `/question-sets/{id}/share` – Tạo/đổi link chia sẻ công khai.

### Quiz Attempts
- POST `/quiz-attempts` – Bắt đầu một lần làm bài từ `setId`.
- GET `/quiz-attempts/{id}` – Lấy thông tin lần làm bài.
- POST `/quiz-attempts/{id}/submit` – Nộp bài (mảng câu trả lời) và chấm điểm.

### Validation (chuyên gia / admin)
- GET `/validation-requests` – Danh sách yêu cầu thẩm định (phân trang, lọc `status`).
- GET `/validation-requests/{id}` – Chi tiết yêu cầu thẩm định.
- PATCH `/validation-requests/{id}` – Cập nhật `status` (InProgress/Completed/Rejected), lý do từ chối.

### Notifications
- GET `/notifications` – Danh sách thông báo của user (phân trang).
- PATCH `/notifications/{id}` – Đánh dấu đã đọc (`isRead`).

### Subscriptions
- GET `/subscription-plans` – Danh sách gói (public).
- GET `/user-subscriptions/me` – Lịch sử đăng ký của user hiện tại.
- POST `/subscriptions` – Bắt đầu/checkout đăng ký cho user (có thể trả `checkoutUrl` nếu cần thanh toán). Nên gửi `Idempotency-Key`.

### Admin
- GET `/admin/users` – Admin liệt kê người dùng (phân trang, lọc role).

### Webhooks
- POST `/webhooks/stripe` – Webhook Stripe (không cần auth; xác minh chữ ký bằng header của Stripe).

## Mã lỗi & phản hồi chung
- 401 Unauthorized – chưa xác thực/Token không hợp lệ.
- 403 Forbidden – không đủ quyền.
- Thống nhất `Error` shape: `{ code, message, details }` cho lỗi 4xx/5xx.

## Lưu ý triển khai & client
- Chọn đúng server trong viewer (Swagger UI/ReDoc) để Try-It-Out gửi về `http://localhost:8080/api/v1` khi chạy local.
- Với các POST tạo tài nguyên/dòng tiền (generate question set, subscriptions), client nên gửi `Idempotency-Key` để có thể retry an toàn.
- Upload: kiểm tra kích thước và phần mở rộng file từ phía client trước khi gửi.
- Phân trang: dựng helper đọc/trả `{ items, meta }` nhất quán giữa các list endpoint.

---
Tài liệu gốc chi tiết: `docs/api/learinal-openapi.yaml`. Hướng dẫn chạy và công cụ kèm theo: `docs/api/README.md`.

## Tham chiếu chi tiết theo OpenAPI

Tài liệu này phản ánh đầy đủ cấu trúc trong `learinal-openapi.yaml` để bạn có thể tra cứu nhanh mà không cần mở YAML.

### Tags
- Auth
- Users
- Subjects
- Documents
- QuestionSets
- QuizAttempts
- Validation
- Notifications
- Subscriptions
- Admin
- Webhooks
- Health

### Security toàn cục
```yaml
security:
	- bearerAuth: []
```
- Mặc định tất cả endpoint yêu cầu Bearer JWT trừ khi override (ví dụ: `/webhooks/stripe` có `security: []`).

### Components

#### Security Schemes
- bearerAuth: `type: http`, `scheme: bearer`, `bearerFormat: JWT`.

#### Common Parameters
- `page` (query): integer ≥ 1, mặc định 1.
- `pageSize` (query): integer ≥ 1, ≤ 100, mặc định 20.
- `sort` (query): string, ví dụ `-createdAt`.
- `If-None-Match` (header): string – dùng với ETag để caching/optimistic locking.
- `Idempotency-Key` (header): string – dùng để retry an toàn các POST/PUT tạo-tác dụng phụ.

#### Common Responses
- `401 Unauthorized`: body `{ code, message, details }` theo schema `Error`.
- `403 Forbidden`: body `{ code, message, details }` theo schema `Error`.

#### Schemas (chi tiết thuộc tính)

- Error
	- code: string
	- message: string
	- details: object (tự do)

- PaginationMeta
	- page: integer
	- pageSize: integer
	- total: integer
	- totalPages: integer

- User
	- id: string (ObjectId)
	- fullName: string
	- email: string
	- role: string ∈ { Learner, Expert, Admin }
	- status: string ∈ { PendingActivation, Active, Deactivated }
	- subscriptionPlanId: string | null
	- subscriptionStatus: string ∈ { None, Active, Expired, Cancelled }
	- subscriptionRenewalDate: string (date-time) | null
	- createdAt: string (date-time)
	- updatedAt: string (date-time)

- Subject
	- id: string
	- userId: string
	- subjectName: string
	- description: string | null
	- tableOfContents: array<object>
	- summary: string | null
	- createdAt: string (date-time)
	- updatedAt: string (date-time)

- Document
	- id: string
	- subjectId: string
	- ownerId: string
	- originalFileName: string
	- fileType: string ∈ { .pdf, .docx, .txt }
	- fileSize: number
	- storagePath: string
	- extractedText: string | null
	- summaryShort: string | null
	- summaryFull: string | null
	- summaryUpdatedAt: string (date-time) | null
	- status: string ∈ { Uploading, Processing, Completed, Error }
	- uploadedAt: string (date-time)

- Question
	- questionId: string
	- questionText: string
	- options: string[]
	- correctAnswerIndex: integer
	- explanation: string | null
	- topicTags: string[]
	- difficultyLevel: string ∈ { "Biết","Hiểu","Vận dụng","Vận dụng cao" }

- QuestionSet
	- id: string
	- title: string
	- description: string | null
	- subjectId: string
	- creatorId: string
	- questions: Question[]
	- timeLimit: integer | null
	- status: string ∈ { Draft, Public, PendingReview, Validated, Rejected, Published }
	- shareLink: string | null
	- isShared: boolean
	- createdAt: string (date-time)
	- updatedAt: string (date-time)

- QuizAttempt
	- id: string
	- userId: string
	- setId: string
	- startedAt: string (date-time)
	- completedAt: string (date-time) | null
	- score: number
	- totalQuestions: integer
	- correctAnswers: integer
	- userAnswers: array<{ questionId: string, selectedOptionIndex: integer, isCorrect: boolean }>

- ValidationRequest
	- id: string
	- setId: string
	- requesterId: string
	- assignedAdminId: string | null
	- assignedExpertId: string | null
	- status: string ∈ { Queued, InProgress, Completed, Rejected }
	- rejectionReason: string | null
	- createdAt: string (date-time)
	- updatedAt: string (date-time)

- Notification
	- id: string
	- userId: string
	- title: string
	- message: string
	- type: string ∈ { info, success, warning, error }
	- isRead: boolean
	- relatedEntityType: string | null
	- relatedEntityId: string | null
	- createdAt: string (date-time)

- SubscriptionPlan
	- id: string
	- planName: string
	- description: string | null
	- billingCycle: string ∈ { Monthly, Yearly }
	- price: number
	- entitlements: object
	- status: string ∈ { Active, Archived }
	- createdAt: string (date-time)
	- updatedAt: string (date-time)

- UserSubscription
	- id: string
	- userId: string
	- planId: string
	- startDate: string (date-time)
	- endDate: string (date-time) | null
	- renewalDate: string (date-time) | null
	- status: string ∈ { Active, Expired, Cancelled, PendingPayment }
	- entitlementsSnapshot: object

---

## Paths (chi tiết request/response)

Mỗi endpoint dưới đây liệt kê: phương thức, mô tả, parameters, requestBody (nếu có), và responses.

### /health
- GET
	- Summary: Liveness/Readiness probe
	- Responses:
		- 200: `{ status: string ("OK"), version: string }`

### /auth/exchange
- POST
	- Summary: Exchange OAuth authorization code for JWT tokens
	- Request Body (application/json):
		- code: string
		- redirectUri: string
	- Responses:
		- 200: `{ accessToken: string, refreshToken: string }`
		- 401: Unauthorized (Error)

### /auth/refresh
- POST
	- Summary: Refresh access token
	- Request Body (application/json):
		- refreshToken: string
	- Responses:
		- 200: `{ accessToken: string, refreshToken: string }`

### /users/me
- GET
	- Summary: Get current user
	- Headers (response): `ETag: string`
	- Responses:
		- 200: `User`
		- 401: Unauthorized (Error)
- PATCH
	- Summary: Update current user profile
	- Headers (request): `If-None-Match: string` (theo conventions trong spec)
	- Request Body (application/json):
		- fullName: string
	- Responses:
		- 200: `User`
		- 412: Precondition Failed (ETag mismatch)

### /subjects
- GET
	- Summary: List subjects of current user
	- Query: `page`, `pageSize`
	- Responses:
		- 200: `{ items: Subject[], meta: PaginationMeta }`
- POST
	- Summary: Create subject
	- Request Body (application/json):
		- subjectName: string (required)
		- description: string (optional)
	- Responses:
		- 201: `Subject`

### /subjects/{id}
- GET
	- Summary: Get subject by id
	- Path: `id: string`
	- Responses: 200: `Subject`
- PATCH
	- Summary: Update subject
	- Path: `id: string`
	- Request Body (application/json): { subjectName?: string, description?: string }
	- Responses: 200: `Subject`
- DELETE
	- Summary: Delete subject
	- Path: `id: string`
	- Responses: 204 (no content)

### /documents
- POST
	- Summary: Upload a document
	- Description: Max size 20MB. Only .pdf, .docx, .txt.
	- Request Body (multipart/form-data):
		- file: binary (required)
		- subjectId: string (required)
	- Responses:
		- 201: `Document`

### /documents/{id}
- GET
	- Summary: Get a document
	- Path: `id: string`
	- Responses: 200: `Document`

### /documents/{id}/summary
- GET
	- Summary: Get document summaries (short/full)
	- Path: `id: string`
	- Responses:
		- 200: `{ summaryShort: string, summaryFull: string }`

### /question-sets
- GET
	- Summary: List question sets of current user
	- Query: `page`, `pageSize`, `status?: string`
	- Responses:
		- 200: `{ items: QuestionSet[], meta: PaginationMeta }`

### /question-sets/generate
- POST
	- Summary: Generate question set via LLM
	- Headers (optional): `Idempotency-Key: string`
	- Request Body (application/json):
		- documentId: string (required)
		- topics: string[] (optional)
		- difficulty: string ∈ { "Biết","Hiểu","Vận dụng","Vận dụng cao" } (optional)
		- numQuestions: integer [1..100] (required)
	- Responses:
		- 201: `QuestionSet`
		- 202: Accepted (xử lý async có thể tiếp tục)

### /question-sets/{id}
- GET
	- Summary: Get question set by id
	- Path: `id: string`
	- Responses: 200: `QuestionSet`
- PATCH
	- Summary: Update a question set (metadata/questions)
	- Path: `id: string`
	- Request Body (application/json): { title?: string, description?: string, questions?: Question[], status?: string }
	- Responses: 200: `QuestionSet`

### /question-sets/{id}/review
- POST
	- Summary: Request expert validation for a question set
	- Path: `id: string`
	- Responses: 202: `ValidationRequest` (queued)

### /question-sets/{id}/share
- POST
	- Summary: Create or rotate a public share link
	- Path: `id: string`
	- Responses: 200: `{ shareLink: string }`

### /quiz-attempts
- POST
	- Summary: Start a quiz attempt
	- Request Body (application/json): { setId: string }
	- Responses: 201: `QuizAttempt`

### /quiz-attempts/{id}
- GET
	- Summary: Get attempt info
	- Path: `id: string`
	- Responses: 200: `QuizAttempt`

### /quiz-attempts/{id}/submit
- POST
	- Summary: Submit answers
	- Path: `id: string`
	- Request Body (application/json): { answers: { questionId: string, selectedOptionIndex: integer }[] }
	- Responses: 200: `QuizAttempt` (đã chấm điểm)

### /validation-requests
- GET
	- Summary: List validation requests (admin/expert)
	- Query: `page`, `pageSize`, `status?: string`
	- Responses: 200: `{ items: ValidationRequest[], meta: PaginationMeta }`

### /validation-requests/{id}
- GET
	- Summary: Get validation request
	- Path: `id: string`
	- Responses: 200: `ValidationRequest`
- PATCH
	- Summary: Update status (expert/admin)
	- Path: `id: string`
	- Request Body (application/json): { status?: InProgress|Completed|Rejected, rejectionReason?: string }
	- Responses: 200: `ValidationRequest`

### /notifications
- GET
	- Summary: List notifications for current user
	- Query: `page`, `pageSize`
	- Responses: 200: `{ items: Notification[], meta: PaginationMeta }`

### /notifications/{id}
- PATCH
	- Summary: Mark as read
	- Path: `id: string`
	- Request Body (application/json): { isRead: boolean }
	- Responses: 200: `Notification`

### /subscription-plans
- GET
	- Summary: Public list of subscription plans
	- Responses: 200: `SubscriptionPlan[]`

### /user-subscriptions/me
- GET
	- Summary: Get current user subscription history
	- Responses: 200: `UserSubscription[]`

### /subscriptions
- POST
	- Summary: Start/checkout a subscription for current user
	- Request Body (application/json): { planId: string }
	- Responses:
		- 201: `{ status: string (ví dụ PendingPayment), checkoutUrl?: string }`

### /admin/users
- GET
	- Summary: Admin list users
	- Query: `page`, `pageSize`, `role?: string`
	- Responses: 200: `{ items: User[], meta: PaginationMeta }`

### /webhooks/stripe
- POST
	- Summary: Stripe webhook endpoint (unauthenticated, verified by signature)
	- Security: `[]` (không yêu cầu Bearer)
	- Request Body: `application/json` (object tùy Stripe event)
	- Responses: 200: Received

---

## x-conventions (từ spec)
- pagination: dùng `page/pageSize`, response `{ items[], meta }`.
- rateLimits: mặc định 60 rpm/IP; headers: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `Retry-After`.
- idempotency: dùng `Idempotency-Key` cho POST tạo/chứa tác dụng phụ (ví dụ thanh toán, sinh nội dung).
- errors: shape `{ code, message, details }`; 4xx cho lỗi client, 5xx cho lỗi server/nhà cung cấp LLM.
- security roles:
	- Learner: tính năng học cơ bản
	- Expert: xử lý nhiệm vụ thẩm định
	- Admin: toàn quyền admin endpoints
- fileUpload: `maxSizeMB: 20`, `types: ['.pdf','.docx','.txt']`.
- services: LLM (Google Gemini), Email (SendGrid/SES), Storage (S3/Cloudinary), OAuth (Google OIDC), Payment (Stripe, TBC).
