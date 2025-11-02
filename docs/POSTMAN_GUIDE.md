# Hướng Dẫn Sử Dụng Postman Collection - Learinal API

## 📋 Tổng Quan

File `Learinal-Complete.postman_collection.json` là bộ collection hoàn chỉnh cho toàn bộ API của Learinal Backend, bao gồm:

- ✅ **Email/Password Authentication** - Đăng ký, đăng nhập, xác thực email, quên mật khẩu
- ✅ **Google OAuth 2.0 Flow** - Đăng nhập qua Google với flow đầy đủ
- ✅ **20+ API Modules** - Tất cả endpoints của hệ thống
- ✅ **Auto-capture Variables** - Tự động lưu token, ID để sử dụng cho các request tiếp theo
- ✅ **Test Scripts** - Scripts tự động test và capture data

## 🚀 Bắt Đầu

### 1. Import Collection vào Postman

```bash
# Cách 1: Import từ file
1. Mở Postman
2. Click "Import" ở góc trên bên trái
3. Chọn file "Learinal-Complete.postman_collection.json"
4. Click "Import"

# Cách 2: Kéo thả
- Kéo file .json vào cửa sổ Postman
```

### 2. Cấu Hình Base URL

Collection đã được cấu hình sẵn với:
- **Base URL**: `http://localhost:3001/api/v1`

Nếu server chạy ở port khác, cập nhật biến `baseUrl`:
1. Click vào Collection "Learinal API - Complete Collection"
2. Tab "Variables"
3. Thay đổi giá trị của `baseUrl`

## 🔐 Authentication Flow

### Phương Án 1: Email/Password Authentication

#### Bước 1: Đăng Ký Tài Khoản
```
📁 Authentication > 📧 Email/Password Auth > POST /auth/register
```
- Nhập thông tin: `fullName`, `email`, `password`
- Response sẽ tự động lưu `accessToken`, `refreshToken`, `userId`

#### Bước 2: Đăng Nhập
```
📁 Authentication > 📧 Email/Password Auth > POST /auth/login
```
- Nhập: `email`, `password`
- Token sẽ được tự động lưu vào collection variables

#### Bước 3: Xác Thực Email (Optional)
```
📁 Authentication > 📧 Email/Password Auth > POST /auth/verify-email
```
- Lấy token từ email và paste vào body

### Phương Án 2: Google OAuth 2.0 Flow

#### Bước 1: Lấy OAuth Config
```
📁 Authentication > 🔵 Google OAuth Flow > GET /auth/config
```
- Xem client ID, redirect URI, và các config cần thiết

#### Bước 2: Generate OAuth State
```
📁 Authentication > 🔵 Google OAuth Flow > GET /auth/state
```
- Response trả về `state` token (tự động lưu vào biến `oauthState`)
- Console sẽ hiển thị URL để visit Google OAuth

#### Bước 3: Lấy OAuth Code từ Google
1. Copy URL từ console (hoặc tự build):
   ```
   https://accounts.google.com/o/oauth2/v2/auth?
     client_id=YOUR_CLIENT_ID&
     redirect_uri=YOUR_REDIRECT_URI&
     response_type=code&
     scope=openid%20email%20profile&
     state={{oauthState}}
   ```
2. Mở URL trong browser
3. Đăng nhập Google
4. Copy `code` từ URL callback

#### Bước 4: Exchange Code cho JWT Token
```
📁 Authentication > 🔵 Google OAuth Flow > POST /auth/exchange
```
- Paste `code` từ Google vào body
- Response sẽ tự động lưu `accessToken`, `refreshToken`, `userId`

### Refresh Token
```
📁 Authentication > POST /auth/refresh
```
- Sử dụng khi access token hết hạn
- Automatically uses `{{refreshToken}}` variable

### Logout
```
📁 Authentication > POST /auth/logout
```
- Revoke refresh token và xóa session

## 📚 Sử Dụng Các API Endpoints

Sau khi đã authenticate, tất cả các request sẽ tự động sử dụng `Bearer {{accessToken}}` từ collection auth.

### Collection Structure

```
📁 Learinal API - Complete Collection
├── 🏥 Health Check
├── 🔐 Authentication
│   ├── 📧 Email/Password Auth (7 endpoints)
│   ├── 🔵 Google OAuth Flow (3 endpoints)
│   └── Token Management (2 endpoints)
├── 👤 Users (3 endpoints)
├── 📚 Subjects (5 endpoints)
├── 📄 Documents (4 endpoints)
├── ❓ Question Sets (7 endpoints)
├── 🎯 Quiz Attempts (3 endpoints)
├── ✅ Validation Requests (4 endpoints)
├── 💰 Commission Records (4 endpoints)
├── 📦 Subscription Plans (5 endpoints)
├── 🔑 User Subscriptions (3 endpoints)
├── 🔔 Notifications (2 endpoints)
├── 🛡️ Moderation (4 endpoints)
├── 🔍 Search (2 endpoints)
├── 📦 Batch Operations (5 endpoints)
├── 📤 Export (4 endpoints)
├── 📥 Import (3 endpoints)
├── 💳 Payments (Sepay) (3 endpoints)
├── 🔗 Webhooks (1 endpoint)
└── 👑 Admin (1 endpoint)
```

## 🔄 Auto-Capture Variables

Collection tự động capture và lưu các ID sau khi tạo resources:

| Variable | Captured From | Used In |
|----------|--------------|---------|
| `accessToken` | Login/Register/OAuth | All authenticated requests |
| `refreshToken` | Login/Register/OAuth | Refresh token endpoint |
| `userId` | Login/Register | User-related requests |
| `subjectId` | POST /subjects | Subject endpoints, Document creation |
| `documentId` | POST /documents | Document endpoints |
| `questionSetId` | POST /question-sets/generate | Question set operations |
| `quizAttemptId` | POST /quiz-attempts | Quiz submission |
| `validationRequestId` | Validation endpoints | Validation operations |
| `subscriptionPlanId` | POST /subscription-plans | Subscription creation |
| `userSubscriptionId` | POST /user-subscriptions | Subscription management |
| `etag_me` | GET /users/me | PATCH /users/me (concurrency control) |

## 📝 Workflow Ví Dụ

### Workflow 1: Tạo và Làm Bài Quiz

1. **Authenticate** (chọn 1 trong 2):
   - Email/Password: `POST /auth/register` → `POST /auth/login`
   - Google OAuth: `GET /auth/state` → Visit Google → `POST /auth/exchange`

2. **Tạo Subject**:
   ```
   POST /subjects
   Body: { "subjectName": "Mathematics", "description": "..." }
   → Auto-captures subjectId
   ```

3. **Upload Document** (optional):
   ```
   POST /documents
   FormData: { "subjectId": "{{subjectId}}", "file": <select file> }
   → Auto-captures documentId
   ```

4. **Generate Questions**:
   ```
   POST /question-sets/generate
   Body: {
     "subjectId": "{{subjectId}}",
     "title": "Algebra Practice",
     "numQuestions": 10,
     "difficulty": "Hiểu"
   }
   → Auto-captures questionSetId
   ```

5. **Start Quiz Attempt**:
   ```
   POST /quiz-attempts
   Body: { "setId": "{{questionSetId}}" }
   → Auto-captures quizAttemptId
   ```

6. **Submit Answers**:
   ```
   POST /quiz-attempts/{{quizAttemptId}}/submit
   Body: {
     "answers": [
       { "questionId": "q1", "selectedOptionIndex": 1 },
       { "questionId": "q2", "selectedOptionIndex": 0 }
     ]
   }
   ```

### Workflow 2: Subscription & Payment

1. **Get Available Plans**:
   ```
   GET /subscription-plans (no auth required)
   ```

2. **Create Subscription**:
   ```
   POST /user-subscriptions
   Body: {
     "planId": "{{subscriptionPlanId}}",
     "paymentReference": "PAYMENT_REF_12345"
   }
   → Auto-captures userSubscriptionId
   ```

3. **Generate Payment QR** (Sepay):
   ```
   POST /payments/sepay/qr
   Body: {
     "amount": 99000,
     "description": "Premium subscription"
   }
   ```

4. **Check Subscription Status**:
   ```
   GET /user-subscriptions/me
   ```

### Workflow 3: Expert Validation Flow

1. **Login as Learner** → Create Question Set

2. **Request Validation**:
   ```
   POST /question-sets/{{questionSetId}}/review
   → Creates a validation request
   ```

3. **Login as Expert**

4. **List Pending Validations**:
   ```
   GET /validation-requests?status=Pending
   → Get validationRequestId
   ```

5. **Assign to Self**:
   ```
   PATCH /validation-requests/{{validationRequestId}}
   Body: {
     "status": "Assigned",
     "expertId": "{{userId}}"
   }
   ```

6. **Complete Validation**:
   ```
   PATCH /validation-requests/{{validationRequestId}}/complete
   Body: {
     "decision": "Approved",
     "feedback": "Great work!",
     "correctedQuestions": []
   }
   ```

7. **Check Commission**:
   ```
   GET /commission-records/summary
   ```

## 🛠️ Advanced Features

### Using ETag for Optimistic Concurrency

```
# Step 1: Get current user (captures ETag)
GET /users/me
→ ETag automatically saved to {{etag_me}}

# Step 2: Update with ETag
PATCH /users/me
Headers: { "If-None-Match": "{{etag_me}}" }
Body: { "fullName": "New Name" }
```

### Idempotency for Question Generation

```
POST /question-sets/generate
→ Pre-request script automatically adds Idempotency-Key header
→ Safe to retry without creating duplicates
```

### Pagination

Most list endpoints support:
```
?page=1&pageSize=20&sort=-createdAt
```

### Filtering

Example:
```
GET /search/question-sets?difficulty=Hiểu&subjectId={{subjectId}}
```

## 🔧 Troubleshooting

### Token Expired
- Run `POST /auth/refresh` với `{{refreshToken}}`
- Hoặc login lại

### Missing Variables
- Check Collection Variables tab
- Ensure test scripts ran successfully after creation requests
- Manually set variables if needed

### OAuth Flow Issues
1. Verify `GET /auth/config` returns correct config
2. Check `oauth_state` cookie is set after `/auth/state`
3. Use correct redirect URI
4. Code must be used within 5 minutes

## 📌 Environment Variables (Optional)

Để test trên nhiều môi trường (dev, staging, prod), tạo Postman Environments:

```json
{
  "name": "Development",
  "values": [
    { "key": "baseUrl", "value": "http://localhost:3001/api/v1" }
  ]
}
```

```json
{
  "name": "Production",
  "values": [
    { "key": "baseUrl", "value": "https://api.learinal.com/api/v1" }
  ]
}
```

## 🤝 Contributing

Để thêm endpoints mới vào collection:

1. Edit file `scripts/generate-postman-collection.js`
2. Add new items to appropriate folder
3. Run: `node scripts/generate-postman-collection.js`
4. Re-import vào Postman

## 📞 Support

- API Documentation: `/docs/api/learinal-openapi.yaml`
- Backend Issues: Contact dev team
- Postman Issues: Check Postman Console for detailed request/response

---

**Happy Testing! 🚀**
