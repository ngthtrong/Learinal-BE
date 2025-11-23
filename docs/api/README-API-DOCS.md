# Learinal API - OpenAPI Documentation

## 📚 Tổng quan

Đây là bộ tài liệu OpenAPI 3.1 chi tiết cho hệ thống Learinal Backend API. Tài liệu được chia thành nhiều file để dễ quản lý và bảo trì.

## 📁 Cấu trúc Files

```
docs/api/
├── openapi-learinal-complete.yaml              # File chính: Components & Schemas
├── openapi-paths-auth-users.yaml               # Endpoints: Auth & Users
├── openapi-paths-subjects-docs-questions.yaml  # Endpoints: Subjects, Documents, Questions
├── openapi-paths-quiz-validation-notifications.yaml  # Endpoints: Quiz, Validation, Notifications
├── openapi-paths-admin-payments-misc.yaml      # Endpoints: Admin, Payments, Export/Import, etc.
└── README-API-DOCS.md                          # File này
```

## 🔗 Liên kết các file

Để xem tài liệu đầy đủ, bạn cần merge tất cả các file YAML lại với nhau. Các file được tổ chức theo module:

1. **openapi-learinal-complete.yaml**: 
   - OpenAPI metadata
   - Security schemes
   - Common parameters
   - Common responses
   - Tất cả schemas (User, Subject, Document, QuestionSet, v.v.)

2. **openapi-paths-auth-users.yaml**:
   - `/auth/*` - Authentication endpoints
   - `/users/*` - User management endpoints

3. **openapi-paths-subjects-docs-questions.yaml**:
   - `/subjects/*` - Subject management
   - `/documents/*` - Document upload & management
   - `/question-sets/*` - Question set generation & management

4. **openapi-paths-quiz-validation-notifications.yaml**:
   - `/quiz-attempts/*` - Quiz taking & submission
   - `/validation-requests/*` - Validation workflow
   - `/notifications/*` - Notifications & WebSocket
   - `/subscription-plans/*` - Subscription plans
   - `/user-subscriptions/*` - User subscriptions

5. **openapi-paths-admin-payments-misc.yaml**:
   - `/commission-records/*` - Commission management
   - `/payments/*` - Payment processing (Sepay)
   - `/admin/*` - Admin operations
   - `/moderation/*` - Content moderation
   - `/search/*` - Search functionality
   - `/export/*` & `/import/*` - Export/Import features
   - `/batch/*` - Batch operations
   - `/webhooks/*` - Webhook endpoints
   - `/health*` & `/metrics` - Health checks

## 🚀 Cách sử dụng

### 1. Merge các file (Cách thủ công)

Sao chép nội dung `paths:` từ các file paths vào file chính `openapi-learinal-complete.yaml`:

```yaml
# openapi-learinal-complete.yaml
openapi: 3.1.0
info: ...
components: ...

# Thêm vào cuối file:
paths:
  # Copy từ openapi-paths-auth-users.yaml
  /auth/register: ...
  /auth/login: ...
  
  # Copy từ openapi-paths-subjects-docs-questions.yaml
  /subjects: ...
  /documents: ...
  
  # Copy từ openapi-paths-quiz-validation-notifications.yaml
  /quiz-attempts: ...
  
  # Copy từ openapi-paths-admin-payments-misc.yaml
  /admin/users: ...
```

### 2. Sử dụng với Swagger UI

#### Option A: Local Swagger UI

1. Cài đặt Swagger UI:
```bash
npm install -g swagger-ui-watcher
```

2. Chạy Swagger UI:
```bash
swagger-ui-watcher docs/api/openapi-learinal-complete.yaml
```

#### Option B: Online Swagger Editor

1. Truy cập: https://editor.swagger.io/
2. Copy-paste nội dung file đã merge vào editor
3. Xem preview và test API

### 3. Generate Client Code

Sử dụng OpenAPI Generator để tạo client code:

```bash
# TypeScript/JavaScript
openapi-generator-cli generate -i openapi-learinal-complete.yaml -g typescript-axios -o ./client

# Python
openapi-generator-cli generate -i openapi-learinal-complete.yaml -g python -o ./client-python

# Java
openapi-generator-cli generate -i openapi-learinal-complete.yaml -g java -o ./client-java
```

### 4. Validation

Validate OpenAPI spec:

```bash
# Sử dụng swagger-cli
npm install -g @apidevtools/swagger-cli
swagger-cli validate docs/api/openapi-learinal-complete.yaml
```

## 📖 Tài liệu API theo Module

### Authentication & Authorization

- **POST** `/auth/register` - Đăng ký tài khoản
- **POST** `/auth/login` - Đăng nhập
- **GET** `/auth/state` - Lấy OAuth state
- **POST** `/auth/exchange` - Đổi OAuth code lấy JWT
- **POST** `/auth/refresh` - Làm mới token
- **POST** `/auth/logout` - Đăng xuất
- **POST** `/auth/forgot-password` - Quên mật khẩu
- **POST** `/auth/reset-password` - Reset mật khẩu
- **POST** `/auth/verify-email` - Xác thực email
- **GET** `/auth/sessions` - Danh sách phiên đăng nhập
- **GET** `/auth/config` - Cấu hình OAuth

### Users

- **GET** `/users/me` - Thông tin user hiện tại
- **PATCH** `/users/me` - Cập nhật profile

### Subjects (Môn học)

- **GET** `/subjects` - Danh sách môn học
- **POST** `/subjects` - Tạo môn học
- **GET** `/subjects/{id}` - Chi tiết môn học
- **PATCH** `/subjects/{id}` - Cập nhật môn học
- **DELETE** `/subjects/{id}` - Xóa môn học
- **GET** `/subjects/{id}/documents` - Tài liệu của môn
- **GET** `/subjects/{id}/question-sets` - Câu hỏi của môn

### Documents (Tài liệu)

- **POST** `/documents` - Upload tài liệu (multipart/form-data)
- **GET** `/documents/{id}` - Chi tiết tài liệu
- **GET** `/documents/{id}/summary` - Tóm tắt tài liệu
- **DELETE** `/documents/{id}` - Xóa tài liệu

### Question Sets (Bộ câu hỏi)

- **GET** `/question-sets` - Danh sách bộ câu hỏi
- **POST** `/question-sets/generate` - Sinh câu hỏi tự động (AI)
- **GET** `/question-sets/{id}` - Chi tiết bộ câu hỏi
- **PATCH** `/question-sets/{id}` - Cập nhật bộ câu hỏi
- **POST** `/question-sets/{id}/share` - Chia sẻ công khai
- **POST** `/question-sets/{id}/review` - Yêu cầu xác thực
- **GET** `/question-sets/{id}/quiz-attempts` - Lịch sử làm bài

### Quiz Attempts (Làm bài thi)

- **POST** `/quiz-attempts` - Bắt đầu làm bài
- **GET** `/quiz-attempts/{id}` - Chi tiết lượt làm bài
- **POST** `/quiz-attempts/{id}/submit` - Nộp bài

### Validation Requests (Xác thực)

- **GET** `/validation-requests` - Danh sách yêu cầu xác thực
- **GET** `/validation-requests/{id}` - Chi tiết yêu cầu
- **PATCH** `/validation-requests/{id}` - Cập nhật (gán Expert)
- **PATCH** `/validation-requests/{id}/complete` - Hoàn thành (Expert)

### Notifications (Thông báo)

- **GET** `/notifications` - Danh sách thông báo
- **PATCH** `/notifications/{id}` - Đánh dấu đã đọc
- **GET** `/notifications/status` - Trạng thái WebSocket

### Subscriptions (Đăng ký)

- **GET** `/subscription-plans` - Danh sách gói (Public)
- **GET** `/subscription-plans/{id}` - Chi tiết gói (Public)
- **POST** `/subscription-plans` - Tạo gói (Admin)
- **GET** `/user-subscriptions/me` - Đăng ký hiện tại
- **POST** `/user-subscriptions` - Đăng ký mới
- **DELETE** `/user-subscriptions/{id}` - Hủy đăng ký

### Payments (Thanh toán)

- **POST** `/payments/sepay/qr` - Tạo QR Sepay
- **GET** `/payments/sepay/transactions` - Danh sách giao dịch
- **POST** `/payments/sepay/scan` - Quét giao dịch

### Commission Records (Hoa hồng)

- **GET** `/commission-records` - Danh sách hoa hồng
- **GET** `/commission-records/summary` - Tổng hợp (Expert)
- **GET** `/commission-records/{id}` - Chi tiết
- **PATCH** `/commission-records/{id}/mark-paid` - Đánh dấu đã trả (Admin)

### Admin Operations

- **GET** `/admin/users` - Quản lý users
- **GET** `/admin/stats` - Thống kê hệ thống
- **GET** `/admin/revenue` - Báo cáo doanh thu
- **GET** `/admin/experts/performance` - Hiệu suất Expert

### Search (Tìm kiếm)

- **GET** `/search` - Tìm kiếm toàn cục
- **GET** `/search/question-sets` - Lọc bộ câu hỏi nâng cao

### Export/Import

- **GET** `/export/question-sets/{id}/json` - Xuất JSON
- **GET** `/export/question-sets/{id}/csv` - Xuất CSV
- **GET** `/export/question-sets/{id}/pdf` - Xuất PDF
- **POST** `/export/question-sets/batch` - Xuất batch
- **POST** `/import/question-sets/json` - Nhập JSON
- **POST** `/import/question-sets/csv` - Nhập CSV

### Batch Operations

- **POST** `/batch/question-sets/delete` - Xóa nhiều
- **POST** `/batch/question-sets/publish` - Publish nhiều
- **POST** `/batch/documents/delete` - Xóa nhiều tài liệu

### Health & Monitoring

- **GET** `/health` - Health check (Legacy)
- **GET** `/healthz` - Basic health
- **GET** `/readyz` - Readiness probe (K8s)
- **GET** `/livez` - Liveness probe (K8s)
- **GET** `/health/deep` - Deep health check
- **GET** `/metrics` - Prometheus metrics

## 🔐 Authentication

Hầu hết endpoints yêu cầu JWT authentication:

```
Authorization: Bearer <your-jwt-token>
```

Lấy token từ:
- `/auth/login` - Local login
- `/auth/exchange` - OAuth login
- `/auth/refresh` - Refresh token

## 👥 Role-based Access Control (RBAC)

Hệ thống có 3 roles:

1. **Learner** (Người học):
   - Tạo môn học, upload tài liệu
   - Sinh câu hỏi, làm bài thi
   - Yêu cầu xác thực

2. **Expert** (Chuyên gia):
   - Tất cả quyền của Learner
   - Xác thực câu hỏi
   - Nhận hoa hồng

3. **Admin** (Quản trị viên):
   - Toàn quyền quản lý hệ thống
   - Quản lý users, subscription plans
   - Xem thống kê, báo cáo

## 📊 Rate Limiting

- **Auth endpoints**: 5 requests/15 minutes
- **Standard endpoints**: 60 requests/minute
- **Upload endpoints**: 10 requests/hour
- **Expensive operations** (AI generation): 5 requests/hour

## 💡 Best Practices

### 1. Sử dụng Idempotency Key

Với các operations quan trọng (generate questions, payments):

```
POST /question-sets/generate
Idempotency-Key: 550e8400-e29b-41d4-a716-446655440000
```

### 2. Sử dụng ETags cho Caching

```
GET /users/me
If-None-Match: "abc123"

Response: 304 Not Modified (nếu không thay đổi)
```

### 3. Pagination

Tất cả list endpoints hỗ trợ pagination:

```
GET /subjects?page=2&pageSize=20&sort=-createdAt
```

### 4. Error Handling

Tất cả errors theo format chuẩn:

```json
{
  "code": "ValidationError",
  "message": "Invalid input data",
  "details": {
    "field": "email",
    "issue": "Email format is invalid"
  }
}
```

## 🔧 Development

### Test API với curl

```bash
# Login
curl -X POST http://localhost:8080/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123"}'

# Get profile (with token)
curl -X GET http://localhost:8080/api/v1/users/me \
  -H "Authorization: Bearer <token>"
```

### Test với Postman

Import file: `Learinal-Complete.postman_collection.json`

## 📝 Changelog

### Version 1.0.0 (2025-11-05)

- ✅ Tài liệu OpenAPI 3.1 đầy đủ
- ✅ Tất cả endpoints được document chi tiết
- ✅ Examples và descriptions đầy đủ
- ✅ Schemas cho tất cả models
- ✅ Error responses chuẩn
- ✅ RBAC documentation
- ✅ Rate limiting information

## 🤝 Contributing

Khi thêm endpoint mới:

1. Thêm path vào file YAML tương ứng
2. Define schema nếu cần trong `openapi-learinal-complete.yaml`
3. Thêm examples và descriptions chi tiết
4. Update README này

## 📞 Support

- Email: dev@learinal.com
- GitHub Issues: [Learinal-BE/issues]
- Documentation: [https://docs.learinal.com]

## 📄 License

Proprietary - Learinal Development Team

---

**Note**: Tài liệu này được tạo tự động và cập nhật thường xuyên. Luôn kiểm tra version mới nhất trước khi sử dụng.
