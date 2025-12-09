# Learinal – Thiết kế Cơ sở Dữ liệu MongoDB

Tài liệu này mô tả chi tiết thiết kế CSDL MongoDB cho dự án Learinal, bao gồm danh sách collection, cấu trúc tài liệu (document schema), quy tắc xác thực (validator), chỉ mục (indexes), chiến lược nhúng/tham chiếu (embed/reference), và gợi ý sharding. Tài liệu nhằm phục vụ nhóm backend triển khai nhất quán và hiệu quả.

## Nguyên tắc chung

- Tên collection dạng số nhiều, lowerCamelCase: `users`, `subjects`, `documents`, `questionSets`, `quizAttempts`, `validationRequests`, `commissionRecords`, `subscriptionPlans`, `userSubscriptions`, `notifications`, `emailTemplates`, `contentFlags`, `systemSettings`, `usageTracking`.
- Tên collection với snake_case: `refresh_tokens`, `password_reset_tokens`.
- Mỗi document có `createdAt`, `updatedAt` (Date). Cập nhật `updatedAt` ở tầng ứng dụng (Mongoose timestamps: true).
- ID: MongoDB ObjectId mặc định cho _id. Với subdocument trong mảng (ví dụ: `questionSets.questions`), dùng `questionId` kiểu UUID string.
- Lựa chọn nhúng vs tham chiếu:
  - Nhúng (embed): `questions` trong `questionSets` để đọc đề nhanh, nguyên tử theo bộ đề.
  - Tham chiếu (reference): quan hệ giữa user–subject–document–questionSet–quizAttempt; tránh nhân bản dữ liệu.
- Giới hạn kích thước: tuân thủ 16MB/document của MongoDB. Tránh nhúng quá lớn; phân trang câu hỏi nếu cần.
- Quốc tế hóa: chuỗi UTF-8, không hard-code locale trong dữ liệu.

## Tổng quan collections

| Collection | Mục đích | Ghi chú quan trọng |
|---|---|---|
| users | Tài khoản người dùng, vai trò, trạng thái, gói đăng ký hiện tại | Tham chiếu `subscriptionPlanId`, hỗ trợ OAuth (provider/providerSub) |
| subjects | Nhóm tài liệu và bộ đề theo từng môn | Thuộc về 1 user (owner) |
| documents | Tài liệu tải lên, văn bản trích xuất và tóm tắt | Có `summaryShort`/`summaryFull` hiển thị đầu nội dung |
| questionSets | Bộ đề thi (trắc nghiệm) | Nhúng `questions[]`; trạng thái mở rộng (Pending/Processing/Error...) |
| quizAttempts | Lượt làm bài | Ghi điểm, answers; hỗ trợ chế độ timed/untimed |
| validationRequests | Yêu cầu xác thực bộ đề | Liên quan learner/admin/expert; hỗ trợ revision workflow |
| commissionRecords | Bản ghi hoa hồng cho Expert | Hybrid Model (Fixed + Bonus); reconciliation tracking |
| subscriptionPlans | Danh mục gói đăng ký | entitlements JSON, Monthly/Yearly |
| userSubscriptions | Lịch sử đăng ký của user | Trạng thái Active/Expired/Cancelled/PendingPayment |
| notifications | Thông báo | Theo user, có cờ isRead |
| emailTemplates | Mẫu email hệ thống | Template cho Auth/Subscription/Validation/System/Marketing |
| refresh_tokens | JWT refresh tokens | Hỗ trợ token rotation, family tracking, device management |
| password_reset_tokens | Token đặt lại mật khẩu | TTL tự động xóa token hết hạn |
| usageTracking | Theo dõi sử dụng tính năng | Đếm question_set_generation, validation_request |
| contentFlags | Báo cáo nội dung vi phạm | Moderation workflow cho QuestionSet/Question/Document |
| systemSettings | Cấu hình hệ thống | Key-value settings theo category |

---

## 1) users

Mục đích: lưu thông tin định danh, vai trò, trạng thái và gói đăng ký hiện tại của người dùng.

Ví dụ document:
```json
{
  "_id": {"$oid": "665f..."},
  "fullName": "Nguyen Van A",
  "email": "a@example.com",
  "hashedPassword": "$2b$10$...",
  "role": "Learner",               // 'Learner' | 'Expert' | 'Admin'
  "status": "Active",              // 'PendingActivation' | 'Active' | 'Deactivated'
  "subscriptionPlanId": {"$oid": "66aa..."},
  "subscriptionStatus": "Active",  // 'None' | 'Active' | 'Expired' | 'Cancelled'
  "subscriptionRenewalDate": {"$date": "2025-11-01T00:00:00Z"},
  "provider": "google",            // OAuth provider (optional)
  "providerSub": "1234567890",     // OAuth subject ID (optional)
  "providerEmail": "a@gmail.com",  // OAuth email (optional)
  "createdAt": {"$date": "2025-10-01T10:00:00Z"},
  "updatedAt": {"$date": "2025-10-10T10:00:00Z"}
}
```

Trường dữ liệu:

| Trường | Kiểu | Bắt buộc | Mô tả |
|---|---|---|---|
| fullName | String | Yes | Họ tên (max 160 ký tự) |
| email | String | Yes, unique | Định danh đăng nhập (lowercase, trim) |
| hashedPassword | String | No | Mật khẩu đã băm (bcrypt); không bắt buộc với OAuth-only accounts |
| role | String (enum) | Yes | 'Learner' \| 'Expert' \| 'Admin' (default: 'Learner') |
| status | String (enum) | Yes | 'PendingActivation' \| 'Active' \| 'Deactivated' (default: 'PendingActivation') |
| subscriptionPlanId | ObjectId | No | Tham chiếu `subscriptionPlans._id` |
| subscriptionStatus | String (enum) | Yes | 'None' \| 'Active' \| 'Expired' \| 'Cancelled' (default: 'None') |
| subscriptionRenewalDate | Date | No | Ngày gia hạn tiếp theo |
| provider | String | No | OAuth provider (google, facebook, etc.) |
| providerSub | String | No | OAuth subject/user ID |
| providerEmail | String | No | Email từ OAuth provider |
| createdAt/updatedAt | Date | Yes | Dấu thời gian (auto by Mongoose) |

Indexes khuyến nghị:
- Unique: `email`.
- RBAC/truy vấn danh sách: `{ role: 1, status: 1, email: 1 }`.
- Theo gói: `{ subscriptionPlanId: 1, subscriptionStatus: 1 }`.
- OAuth lookup: `{ provider: 1 }`, `{ providerSub: 1 }`.
- Unique OAuth identity: `{ provider: 1, providerSub: 1 }` với partial filter (khi cả 2 đều là string).

Validator (JSON Schema rút gọn):
```json
{
  "$jsonSchema": {
    "bsonType": "object",
    "required": ["fullName", "email", "role", "status", "subscriptionStatus", "createdAt", "updatedAt"],
    "properties": {
      "fullName": {"bsonType": "string", "maxLength": 160},
      "email": {"bsonType": "string", "pattern": "^.+@.+\\..+$"},
      "role": {"enum": ["Learner","Expert","Admin"]},
      "status": {"enum": ["PendingActivation","Active","Deactivated"]},
      "subscriptionStatus": {"enum": ["None","Active","Expired","Cancelled"]}
    }
  }
}
```

---

## 2) subjects

Mục đích: quản lý môn học theo người dùng.

Ví dụ document:
```json
{
  "_id": {"$oid": "66bb..."},
  "userId": {"$oid": "665f..."},
  "subjectName": "Cấu trúc dữ liệu",
  "description": "Môn học về cấu trúc dữ liệu",
  "tableOfContents": [
    {"topicId": "uuid-1", "topicName": "Chương 1", "childTopics": []}
  ],
  "summary": "Tổng quan môn học...",
  "createdAt": {"$date": "2025-10-05T00:00:00Z"},
  "updatedAt": {"$date": "2025-10-05T00:00:00Z"}
}
```

Trường dữ liệu:

| Trường | Kiểu | Bắt buộc | Mô tả |
|---|---|---|---|
| userId | ObjectId | Yes | Chủ sở hữu |
| subjectName | String | Yes | Tên môn |
| description | String | No | Mô tả |
| tableOfContents | Array<Object> | No | Cấu trúc mục lục |
| summary | String | No | Tóm tắt môn |
| createdAt/updatedAt | Date | Yes | Dấu thời gian |

Indexes:
- `{ userId: 1, subjectName: 1 }` (tìm kiếm theo người dùng và môn).

---

## 3) documents

Mục đích: tài liệu tải lên, nội dung trích xuất, tóm tắt hiển thị đầu nội dung.

Ví dụ document:
```json
{
  "_id": {"$oid": "66dc..."},
  "subjectId": {"$oid": "66bb..."},
  "ownerId": {"$oid": "665f..."},
  "originalFileName": "chuong1.pdf",
  "fileType": ".pdf",
  "fileSize": 4.8,
  "storagePath": "s3://.../chuong1.pdf",
  "extractedText": "Noi dung ...",
  "summaryShort": "3-5 câu tóm tắt ...",
  "summaryFull": "- điểm 1\n- điểm 2\n- ...",
  "summaryUpdatedAt": {"$date": "2025-10-10T12:00:00Z"},
  "status": "Completed",  // 'Uploading' | 'Processing' | 'Completed' | 'Error'
  "uploadedAt": {"$date": "2025-10-10T10:00:00Z"}
}
```

Trường dữ liệu:

| Trường | Kiểu | Bắt buộc | Mô tả |
|---|---|---|---|
| subjectId | ObjectId | Yes | Thuộc môn |
| ownerId | ObjectId | Yes | Chủ sở hữu |
| originalFileName | String | Yes | Tên file gốc |
| fileType | String (enum) | Yes | '.pdf' | '.docx' | '.txt' |
| fileSize | Number | Yes | MB |
| storagePath | String | Yes | Đường dẫn lưu file |
| extractedText | String | No | Văn bản trích xuất |
| summaryShort | String | No | Tóm tắt ngắn |
| summaryFull | String | No | Tóm tắt đầy đủ |
| summaryUpdatedAt | Date | No | Lần cập nhật tóm tắt |
| tableOfContents | Array<Object> | No | Mục lục của tài liệu (cấu trúc tương tự subjects.tableOfContents) |
| status | String (enum) | Yes | 'Uploading' | 'Processing' | 'Completed' | 'Error' |
| uploadedAt | Date | Yes | Thời điểm tải |

Indexes:
- `{ subjectId: 1, uploadedAt: -1 }`
- `{ ownerId: 1, uploadedAt: -1 }`

---

## 4) questionSets

Mục đích: lưu trữ bộ đề, nhúng danh sách câu hỏi.

Ví dụ document (rút gọn):
```json
{
  "_id": {"$oid": "66ee..."},
  "userId": {"$oid": "665f..."},
  "subjectId": {"$oid": "66bb..."},
  "title": "Đề giữa kỳ Ch1-2",
  "status": "Public", // 'Pending'|'Processing'|'Draft'|'Public'|'PendingValidation'|'InReview'|'Validated'|'Rejected'|'PendingApproval'|'Published'|'Error'
  "isShared": true,
  "sharedUrl": "https://.../share/abc123",
  "questions": [
    {
      "questionId": "uuid-q1",
      "questionText": "Khái niệm stack là gì?",
      "options": ["A","B","C","D"],
      "correctAnswerIndex": 1,
      "explanation": "Giải thích ...",
      "topicTags": ["Ch1"],
      "topicId": "topic-uuid-1",
      "topicStatus": "active",
      "difficultyLevel": "Understand"
    }
  ],
  "createdAt": {"$date": "2025-10-12T00:00:00Z"},
  "updatedAt": {"$date": "2025-10-12T00:00:00Z"}
}
```

Trường dữ liệu chính:

| Trường | Kiểu | Bắt buộc | Mô tả |
|---|---|---|---|
| userId | ObjectId | Yes | Người tạo (Learner/Expert) |
| subjectId | ObjectId | No | Thuộc môn (có thể null) |
| title | String | Yes | Tiêu đề |
| status | String (enum) | Yes | Trạng thái vòng đời (xem danh sách bên dưới) |
| isShared | Boolean | Yes | Chia sẻ công khai (default: false) |
| sharedUrl | String | No | Đường dẫn chia sẻ (unique, sparse) |
| questions[] | Array<Object> | Yes | Danh sách câu hỏi nhúng (default: []) |
| createdAt/updatedAt | Date | Yes | Dấu thời gian |

Các trạng thái status:
- `Pending`: Đang chờ xử lý (mới tạo yêu cầu sinh đề)
- `Processing`: Đang trong quá trình sinh đề bởi LLM
- `Draft`: Bản nháp chưa công khai
- `Public`: Công khai cho mọi người
- `PendingValidation`: Chờ xác thực bởi Expert
- `InReview`: Đang được Expert xem xét
- `Validated`: Đã được Expert xác thực
- `Rejected`: Bị từ chối
- `PendingApproval`: Chờ Admin phê duyệt
- `Published`: Đã xuất bản
- `Error`: Lỗi trong quá trình xử lý

Trường trong questions[] (subdocument):

| Trường | Kiểu | Bắt buộc | Mô tả |
|---|---|---|---|
| questionId | String | No | UUID của câu hỏi |
| questionText | String | Yes | Nội dung câu hỏi |
| options | Array<String> | Yes | Các đáp án |
| correctAnswerIndex | Number | Yes | Chỉ số đáp án đúng (0-based) |
| explanation | String | No | Giải thích đáp án |
| topicTags | Array<String> | No | Tags phân loại (default: []) |
| topicId | String | No | ID của topic trong tableOfContents mà câu hỏi thuộc về |
| topicStatus | String | No | Trạng thái topic |
| difficultyLevel | String (enum) | No | 'Remember' \| 'Understand' \| 'Apply' \| 'Analyze' (Bloom's Taxonomy) |

Index:
- `{ userId: 1, subjectId: 1, status: 1, createdAt: -1 }`.
- `{ sharedUrl: 1 }` unique, sparse - cho phép truy cập công khai qua URL.

Lưu ý câu hỏi (nhúng): 
- `difficultyLevel` theo Bloom's Taxonomy để tính trọng số khi chấm điểm.
- Trường `topicId` liên kết câu hỏi với một topic cụ thể trong mục lục (tableOfContents) của môn học hoặc tài liệu.
- Khi tạo bộ đề có thể chỉ định phân bố câu hỏi theo độ khó (`difficultyDistribution`) và theo topic (`topicDistribution`).

---

## 5) quizAttempts

Mục đích: lượt làm bài, tính điểm theo trọng số, phát sinh hoa hồng.

Ví dụ document:
```json
{
  "_id": {"$oid": "66ff..."},
  "userId": {"$oid": "665f..."},
  "setId": {"$oid": "66ee..."},
  "score": 8.5,
  "userAnswers": [
    {"questionId": "uuid-q1", "selectedOptionIndex": 1, "isCorrect": true}
  ],
  "isCompleted": true,
  "isTimed": true,
  "startTime": {"$date": "2025-10-12T10:00:00Z"},
  "endTime": {"$date": "2025-10-12T10:30:00Z"},
  "createdAt": {"$date": "2025-10-12T10:00:00Z"},
  "updatedAt": {"$date": "2025-10-12T10:30:00Z"}
}
```

Trường dữ liệu và Index:

| Trường | Kiểu | Bắt buộc | Index | Mô tả |
|---|---|---|---|---|
| userId | ObjectId | Yes | Yes: `{ userId: 1, endTime: -1 }` | Người làm bài |
| setId | ObjectId | Yes | Yes: `{ setId: 1, endTime: -1 }` | Bộ đề |
| score | Number | Yes | | Điểm số |
| userAnswers | Array<Object> | Yes | | Danh sách câu trả lời |
| isCompleted | Boolean | Yes | | Đã hoàn thành |
| isTimed | Boolean | No | | Chế độ tính giờ (default: true) |
| startTime | Date | No | | Thời điểm bắt đầu |
| endTime | Date | No | | Thời điểm kết thúc |
| createdAt/updatedAt | Date | Yes | | Dấu thời gian (auto) |

---

## 6) validationRequests

Mục đích: theo dõi yêu cầu xác thực bộ đề, hỗ trợ workflow revision.

```json
{
  "_id": {"$oid": "6700..."},
  "setId": {"$oid": "66ee..."},
  "learnerId": {"$oid": "665f..."},
  "adminId": {"$oid": "665a..."},
  "expertId": {"$oid": "665e..."},
  "status": "Assigned",  // 'PendingAssignment'|'Assigned'|'Completed'|'RevisionRequested'
  "decision": "Approved", // 'Approved'|'Rejected' (khi status = Completed)
  "feedback": "Bộ đề đạt chất lượng tốt",
  "learnerResponse": "Đã chỉnh sửa theo góp ý",
  "revisionRequestTime": {"$date": "2025-10-13T09:00:00Z"},
  "requestTime": {"$date": "2025-10-12T11:00:00Z"},
  "completionTime": null,
  "createdAt": {"$date": "2025-10-12T11:00:00Z"},
  "updatedAt": {"$date": "2025-10-13T09:00:00Z"}
}
```

Trường dữ liệu:

| Trường | Kiểu | Bắt buộc | Mô tả |
|---|---|---|---|
| setId | ObjectId | Yes | Bộ đề cần xác thực |
| learnerId | ObjectId | Yes | Người yêu cầu xác thực |
| adminId | ObjectId | No | Admin điều phối |
| expertId | ObjectId | No | Expert được giao xác thực |
| status | String (enum) | Yes | 'PendingAssignment' \| 'Assigned' \| 'Completed' \| 'RevisionRequested' |
| decision | String (enum) | No | 'Approved' \| 'Rejected' (khi status = Completed) |
| feedback | String | No | Góp ý từ Expert |
| learnerResponse | String | No | Phản hồi/chỉnh sửa từ Learner |
| revisionRequestTime | Date | No | Thời điểm yêu cầu chỉnh sửa |
| requestTime | Date | Yes | Thời điểm tạo yêu cầu |
| completionTime | Date | No | Thời điểm hoàn thành |
| createdAt/updatedAt | Date | Yes | Dấu thời gian (auto) |

Index:
- `{ status: 1, requestTime: -1 }`
- `{ expertId: 1, status: 1 }` (hàng chờ chuyên gia)
- `{ adminId: 1, status: 1 }` (điều phối)

---

## 7) commissionRecords

Mục đích: ghi nhận hoa hồng theo Hybrid Model (Fixed + Bonus) cho Expert.

```json
{
  "_id": {"$oid": "6701..."},
  "expertId": {"$oid": "665e..."},
  "attemptId": {"$oid": "66ff..."},
  "setId": {"$oid": "66ee..."},
  "validationRequestId": {"$oid": "6700..."},
  "type": "Published",             // 'Published' | 'Validated'
  "fixedAmount": 5000,             // Số tiền cố định mỗi lượt làm
  "bonusAmount": 2000,             // Bonus tính khi reconciliation
  "commissionAmount": 7000,        // Tổng = fixed + bonus
  "transactionDate": {"$date": "2025-10-31T23:59:59Z"},
  "status": "Pending",             // 'Pending' | 'Paid' | 'Cancelled'
  "isPremiumAttempt": true,        // Chỉ premium attempts mới sinh hoa hồng
  "paidAt": null,
  "paymentReference": null,
  "isReconciled": false,           // Đã tính bonus chưa?
  "reconciledAt": null,
  "reconciliationMonth": "2025-10",
  "entitledUntil": {"$date": "2026-10-31T23:59:59Z"},
  "metadata": {
    "questionSetTitle": "Đề giữa kỳ Ch1-2",
    "learnerScore": 8.5,
    "attemptDuration": 1800
  },
  "createdAt": {"$date": "2025-10-31T23:59:59Z"},
  "updatedAt": {"$date": "2025-10-31T23:59:59Z"}
}
```

Trường dữ liệu:

| Trường | Kiểu | Bắt buộc | Mô tả |
|---|---|---|---|
| expertId | ObjectId | Yes | Expert nhận hoa hồng |
| attemptId | ObjectId | Yes, unique | Lượt làm bài phát sinh hoa hồng |
| setId | ObjectId | Yes | Bộ đề |
| validationRequestId | ObjectId | No | Yêu cầu xác thực (cho type = Validated) |
| type | String (enum) | Yes | 'Published' (Expert tạo đề) \| 'Validated' (Expert xác thực) |
| fixedAmount | Number | Yes | Số tiền cố định (default: 0) |
| bonusAmount | Number | No | Bonus doanh thu (tính khi reconciliation, default: 0) |
| commissionAmount | Number | Yes | Tổng hoa hồng = fixed + bonus |
| transactionDate | Date | Yes | Ngày ghi nhận |
| status | String (enum) | Yes | 'Pending' \| 'Paid' \| 'Cancelled' (default: 'Pending') |
| isPremiumAttempt | Boolean | No | Lượt làm từ user premium (default: false) |
| paidAt | Date | No | Thời điểm thanh toán |
| paymentReference | String | No | Mã tham chiếu thanh toán |
| isReconciled | Boolean | No | Đã tính bonus (default: false) |
| reconciledAt | Date | No | Thời điểm reconciliation |
| reconciliationMonth | String | No | Kỳ reconciliation (format: "YYYY-MM") |
| entitledUntil | Date | No | Thời hạn nhận hoa hồng (cho type = Validated) |
| metadata | Object | No | Thông tin bổ sung (title, score, duration) |
| createdAt/updatedAt | Date | Yes | Dấu thời gian (auto) |

Indexes:
- `{ expertId: 1, status: 1, transactionDate: -1 }` - Báo cáo theo expert
- `{ setId: 1, transactionDate: -1 }` - Thống kê theo bộ đề
- `{ expertId: 1, reconciliationMonth: 1 }` - Reconciliation theo kỳ
- `{ isReconciled: 1, status: 1 }` - Tìm records cần reconcile
- `{ type: 1, transactionDate: -1 }` - Thống kê theo loại
- `{ attemptId: 1 }` unique - Đảm bảo 1 hoa hồng/lượt làm

---

## 8) subscriptionPlans

Mục đích: danh mục gói và quyền lợi (entitlements).

```json
{
  "_id": {"$oid": "66aa..."},
  "planName": "Pro",
  "description": "Quyền lợi nâng cao",
  "billingCycle": "Monthly",
  "price": 99000,
  "entitlements": {
    "maxMonthlyTestGenerations": "unlimited",
    "maxValidationRequests": 20,
    "priorityProcessing": true,
    "shareLimits": 100,
    "maxSubjects": 999
  },
  "status": "Active",
  "createdAt": {"$date": "2025-10-01T00:00:00Z"},
  "updatedAt": {"$date": "2025-10-10T00:00:00Z"}
}
```

Indexes:
- Unique: `{ planName: 1, status: 1 }` (tuỳ chọn, hoặc chỉ `{ planName: 1 }`).

---

## 9) userSubscriptions

Mục đích: lưu lịch sử đăng ký, phục vụ đối soát.

```json
{
  "_id": {"$oid": "66ab..."},
  "userId": {"$oid": "665f..."},
  "planId": {"$oid": "66aa..."},
  "startDate": {"$date": "2025-10-01T00:00:00Z"},
  "endDate": null,
  "renewalDate": {"$date": "2025-11-01T00:00:00Z"},
  "status": "Active", // 'Active'|'Expired'|'Cancelled'|'PendingPayment'
  "entitlementsSnapshot": { "maxValidationRequests": 20 },
  "createdAt": {"$date": "2025-10-01T00:00:00Z"},
  "updatedAt": {"$date": "2025-10-01T00:00:00Z"}
}
```

Trường dữ liệu:

| Trường | Kiểu | Bắt buộc | Mô tả |
|---|---|---|---|
| userId | ObjectId | Yes | Người đăng ký |
| planId | ObjectId | Yes | Gói đăng ký |
| startDate | Date | Yes | Ngày bắt đầu |
| endDate | Date | No | Ngày kết thúc |
| renewalDate | Date | No | Ngày gia hạn tiếp theo |
| status | String (enum) | Yes | 'Active' \| 'Expired' \| 'Cancelled' \| 'PendingPayment' |
| entitlementsSnapshot | Mixed | No | Snapshot quyền lợi tại thời điểm đăng ký |
| createdAt/updatedAt | Date | Yes | Dấu thời gian (auto) |

Indexes:
- `{ userId: 1, status: 1, startDate: -1 }`
- `{ planId: 1, status: 1 }`

---

## 10) notifications

Mục đích: thông báo cho người dùng.

```json
{
  "_id": {"$oid": "6710..."},
  "userId": {"$oid": "665f..."},
  "title": "Bộ đề đã được xác thực",
  "message": "Đề Ch1-2 đã được xác thực",
  "type": "success", // 'info'|'success'|'warning'|'error'
  "isRead": false,
  "relatedEntityType": "QuestionSet",
  "relatedEntityId": {"$oid": "66ee..."},
  "createdAt": {"$date": "2025-10-12T12:00:00Z"},
  "updatedAt": {"$date": "2025-10-12T12:00:00Z"}
}
```

Trường dữ liệu:

| Trường | Kiểu | Bắt buộc | Mô tả |
|---|---|---|---|
| userId | ObjectId | Yes | Người nhận thông báo |
| title | String | Yes | Tiêu đề thông báo |
| message | String | Yes | Nội dung thông báo |
| type | String (enum) | No | 'info' \| 'success' \| 'warning' \| 'error' (default: 'info') |
| isRead | Boolean | No | Đã đọc (default: false) |
| relatedEntityType | String | No | Loại entity liên quan |
| relatedEntityId | ObjectId | No | ID entity liên quan |
| createdAt/updatedAt | Date | Yes | Dấu thời gian (auto) |

Indexes:
- `{ userId: 1, isRead: 1, createdAt: -1 }`

---

## 11) emailTemplates

Mục đích: lưu trữ mẫu email hệ thống với hỗ trợ biến động.

```json
{
  "_id": {"$oid": "6711..."},
  "templateId": "password_reset",
  "name": "Password Reset Email",
  "subject": "Reset your password - Learinal",
  "bodyHtml": "<html>...</html>",
  "bodyText": "Click here to reset your password...",
  "variables": ["{{userName}}", "{{resetLink}}", "{{expiryTime}}"],
  "category": "Auth", // 'Auth'|'Subscription'|'Validation'|'System'|'Marketing'
  "isActive": true,
  "createdAt": {"$date": "2025-10-01T00:00:00Z"},
  "updatedAt": {"$date": "2025-10-01T00:00:00Z"}
}
```

Trường dữ liệu:

| Trường | Kiểu | Bắt buộc | Mô tả |
|---|---|---|---|
| templateId | String | Yes, unique | ID định danh template |
| name | String | Yes | Tên mô tả |
| subject | String | Yes | Tiêu đề email (max 200 ký tự) |
| bodyHtml | String | Yes | Nội dung HTML |
| bodyText | String | No | Nội dung text thuần |
| variables | Array<String> | No | Danh sách biến có thể dùng (default: []) |
| category | String (enum) | Yes | 'Auth' \| 'Subscription' \| 'Validation' \| 'System' \| 'Marketing' |
| isActive | Boolean | No | Đang hoạt động (default: true) |
| createdAt/updatedAt | Date | Yes | Dấu thời gian (auto) |

Indexes:
- `{ templateId: 1 }` unique
- `{ category: 1, isActive: 1 }`

---

## 12) refresh_tokens

Mục đích: quản lý JWT refresh tokens với hỗ trợ rotation, family tracking và device management.

```json
{
  "_id": {"$oid": "6712..."},
  "userId": {"$oid": "665f..."},
  "jti": "550e8400-e29b-41d4-a716-446655440000",
  "familyId": "family-abc123",
  "parentJti": null,
  "rotatedToJti": null,
  "rotatedAt": null,
  "reusedAt": null,
  "tokenType": "jwt", // 'jwt' | 'opaque'
  "tokenHash": null,
  "familyIssuedAt": {"$date": "2025-10-12T10:00:00Z"},
  "deviceId": "device-xyz",
  "userAgent": "Mozilla/5.0...",
  "ip": "192.168.1.1",
  "expiresAt": {"$date": "2025-10-26T10:00:00Z"},
  "revokedAt": null,
  "createdAt": {"$date": "2025-10-12T10:00:00Z"},
  "updatedAt": {"$date": "2025-10-12T10:00:00Z"}
}
```

Trường dữ liệu:

| Trường | Kiểu | Bắt buộc | Mô tả |
|---|---|---|---|
| userId | ObjectId | Yes | Người sở hữu token |
| jti | String | Yes, unique | JWT ID |
| familyId | String | No | ID nhóm token (rotation tracking) |
| parentJti | String | No | JTI của token cha |
| rotatedToJti | String | No | JTI của token mới sau rotation |
| rotatedAt | Date | No | Thời điểm rotation |
| reusedAt | Date | No | Thời điểm phát hiện reuse (security) |
| tokenType | String (enum) | No | 'jwt' \| 'opaque' (default: 'jwt') |
| tokenHash | String | No | Hash của opaque token |
| familyIssuedAt | Date | No | Thời điểm tạo family |
| deviceId | String | No | ID thiết bị |
| userAgent | String | No | User agent |
| ip | String | No | Địa chỉ IP |
| expiresAt | Date | Yes | Thời điểm hết hạn |
| revokedAt | Date | No | Thời điểm thu hồi |
| createdAt/updatedAt | Date | Yes | Dấu thời gian (auto) |

Indexes:
- `{ userId: 1 }` - Lookup theo user
- `{ jti: 1 }` unique - Lookup theo JTI
- `{ familyId: 1 }` - Lookup theo family
- `{ parentJti: 1 }` - Tracking rotation chain
- `{ rotatedToJti: 1 }` - Tracking rotation
- `{ rotatedAt: 1 }` - Cleanup rotated tokens
- `{ reusedAt: 1 }` - Security monitoring
- `{ tokenType: 1 }` - Filter by type
- `{ familyIssuedAt: 1 }` - Absolute lifetime tracking
- `{ deviceId: 1 }` - Device management
- `{ expiresAt: 1 }` - TTL index (expireAfterSeconds: 0)
- `{ revokedAt: 1 }` - TTL cleanup revoked (expireAfterSeconds: 604800 = 7 days)
- `{ userId: 1, jti: 1 }` unique - Compound lookup
- `{ userId: 1, familyId: 1 }` - Family by user

---

## 13) password_reset_tokens

Mục đích: quản lý token đặt lại mật khẩu với TTL tự động.

```json
{
  "_id": {"$oid": "6713..."},
  "userId": {"$oid": "665f..."},
  "jti": "reset-token-abc123",
  "expiresAt": {"$date": "2025-10-12T11:00:00Z"},
  "usedAt": null,
  "createdAt": {"$date": "2025-10-12T10:00:00Z"},
  "updatedAt": {"$date": "2025-10-12T10:00:00Z"}
}
```

Trường dữ liệu:

| Trường | Kiểu | Bắt buộc | Mô tả |
|---|---|---|---|
| userId | ObjectId | Yes | Người yêu cầu reset |
| jti | String | Yes, unique | Token ID |
| expiresAt | Date | Yes | Thời điểm hết hạn |
| usedAt | Date | No | Thời điểm sử dụng |
| createdAt/updatedAt | Date | Yes | Dấu thời gian (auto) |

Indexes:
- `{ userId: 1 }` - Lookup theo user
- `{ jti: 1 }` unique - Lookup theo token
- `{ expiresAt: 1 }` - TTL index (expireAfterSeconds: 0, tự động xóa khi hết hạn)
- `{ usedAt: 1 }` - Tracking used tokens
- `{ userId: 1, jti: 1 }` unique - Compound lookup

---

## 14) usageTracking

Mục đích: theo dõi sử dụng tính năng (question set generation, validation request) để kiểm tra quota.

```json
{
  "_id": {"$oid": "6714..."},
  "userId": {"$oid": "665f..."},
  "actionType": "question_set_generation", // 'question_set_generation' | 'validation_request'
  "resourceId": {"$oid": "66ee..."},
  "timestamp": {"$date": "2025-10-12T10:00:00Z"},
  "metadata": {
    "questionsGenerated": 20,
    "documentId": "66dc..."
  }
}
```

Trường dữ liệu:

| Trường | Kiểu | Bắt buộc | Mô tả |
|---|---|---|---|
| userId | ObjectId | Yes | Người thực hiện action |
| actionType | String (enum) | Yes | 'question_set_generation' \| 'validation_request' |
| resourceId | ObjectId | No | ID của resource liên quan |
| timestamp | Date | Yes | Thời điểm thực hiện (default: now) |
| metadata | Mixed | No | Thông tin bổ sung |

Indexes:
- `{ userId: 1 }` - Lookup theo user
- `{ timestamp: 1 }` - Thống kê theo thời gian
- `{ userId: 1, actionType: 1, timestamp: -1 }` - Đếm usage theo user và action

Lưu ý: Collection này không có `createdAt/updatedAt` (timestamps: false).

---

## 15) contentFlags

Mục đích: quản lý báo cáo nội dung vi phạm với workflow moderation.

```json
{
  "_id": {"$oid": "6715..."},
  "contentType": "QuestionSet", // 'QuestionSet' | 'Question' | 'Document' | 'Comment'
  "contentId": {"$oid": "66ee..."},
  "reportedBy": {"$oid": "665f..."},
  "reason": "Inappropriate", // 'Inappropriate'|'Spam'|'Offensive'|'Copyright'|'Inaccurate'|'Other'
  "description": "Nội dung không phù hợp với trẻ em",
  "status": "Pending", // 'Pending'|'UnderReview'|'Resolved'|'Dismissed'
  "reviewedBy": null,
  "reviewedAt": null,
  "action": null, // 'None'|'Warning'|'ContentRemoved'|'UserBanned'
  "notes": null,
  "createdAt": {"$date": "2025-10-12T10:00:00Z"},
  "updatedAt": {"$date": "2025-10-12T10:00:00Z"}
}
```

Trường dữ liệu:

| Trường | Kiểu | Bắt buộc | Mô tả |
|---|---|---|---|
| contentType | String (enum) | Yes | 'QuestionSet' \| 'Question' \| 'Document' \| 'Comment' |
| contentId | ObjectId | Yes | ID nội dung bị báo cáo |
| reportedBy | ObjectId | Yes | Người báo cáo |
| reason | String (enum) | Yes | Lý do: 'Inappropriate' \| 'Spam' \| 'Offensive' \| 'Copyright' \| 'Inaccurate' \| 'Other' |
| description | String | No | Mô tả chi tiết (max 500 ký tự) |
| status | String (enum) | No | 'Pending' \| 'UnderReview' \| 'Resolved' \| 'Dismissed' (default: 'Pending') |
| reviewedBy | ObjectId | No | Admin/Moderator xử lý |
| reviewedAt | Date | No | Thời điểm xử lý |
| action | String (enum) | No | 'None' \| 'Warning' \| 'ContentRemoved' \| 'UserBanned' |
| notes | String | No | Ghi chú của moderator (max 1000 ký tự) |
| createdAt/updatedAt | Date | Yes | Dấu thời gian (auto) |

Indexes:
- `{ contentType: 1, contentId: 1 }` - Lookup theo content
- `{ status: 1 }` - Filter theo trạng thái
- `{ reportedBy: 1 }` - Thống kê theo người báo cáo

---

## 16) systemSettings

Mục đích: lưu trữ cấu hình hệ thống dạng key-value.

```json
{
  "_id": {"$oid": "6716..."},
  "key": "commission_fixed_rate",
  "value": 5000,
  "category": "Payment", // 'General'|'Features'|'Limits'|'Email'|'Payment'|'Security'
  "description": "Số tiền hoa hồng cố định cho mỗi lượt làm bài",
  "isPublic": false,
  "updatedBy": {"$oid": "665a..."},
  "createdAt": {"$date": "2025-10-01T00:00:00Z"},
  "updatedAt": {"$date": "2025-10-15T00:00:00Z"}
}
```

Trường dữ liệu:

| Trường | Kiểu | Bắt buộc | Mô tả |
|---|---|---|---|
| key | String | Yes, unique | Key cấu hình |
| value | Mixed | Yes | Giá trị (có thể là string/number/object/array) |
| category | String (enum) | No | 'General' \| 'Features' \| 'Limits' \| 'Email' \| 'Payment' \| 'Security' (default: 'General') |
| description | String | No | Mô tả (max 500 ký tự) |
| isPublic | Boolean | No | Hiển thị công khai cho client (default: false) |
| updatedBy | ObjectId | No | Admin cập nhật cuối |
| createdAt/updatedAt | Date | Yes | Dấu thời gian (auto) |

Indexes:
- `{ key: 1 }` unique
- `{ category: 1 }`

---

## Ràng buộc nghiệp vụ và xác thực bổ sung

- `questions[].difficultyLevel` khuyến nghị ∈ {'Remember','Understand','Apply','Analyze'} theo Bloom's Taxonomy (không bắt buộc trong schema).
- Tính điểm: backend tính theo trọng số (SRS 4.1.1), không lưu điểm từng câu trong đề gốc, chỉ lưu trong `quizAttempts.userAnswers[].isCorrect` và tổng `score`.
- Hoa hồng Hybrid Model: `commissionAmount = fixedAmount + bonusAmount`. Fixed amount tính ngay khi có attempt, bonus tính trong reconciliation hàng tháng.
- Với `validationRequests`: chỉ 1 yêu cầu mở trên 1 set tại một thời điểm (có thể áp unique compound: `{ setId: 1, status: 1 }` với filter `status ∈ {'PendingAssignment','Assigned','RevisionRequested'}` bằng index partial).
- Với `questionSets.sharedUrl`: unique sparse - chỉ enforce uniqueness khi có giá trị.
- Token TTL: `refresh_tokens` và `password_reset_tokens` sử dụng MongoDB TTL index để tự động xóa documents hết hạn.

## Chỉ mục tổng hợp đề xuất

- Khối user-scoped: `{ userId: 1, createdAt: -1 }` áp dụng cho `subjects`, `questionSets`, `quizAttempts`, `notifications`, `usageTracking`.
- Truy vấn theo trạng thái công việc: `{ status: 1, updatedAt: -1 }` cho `validationRequests`, `questionSets`, `contentFlags`.
- Tài chính: `{ expertId: 1, status: 1, transactionDate: -1 }` và `{ expertId: 1, reconciliationMonth: 1 }` cho `commissionRecords`.
- Security: TTL indexes cho `refresh_tokens.expiresAt` và `password_reset_tokens.expiresAt`.

## Sharding (gợi ý)

Phù hợp khi quy mô lớn:
- Shard theo `userId` (hashed) cho `subjects`, `documents`, `questionSets`, `notifications`, `quizAttempts`, `usageTracking` — phân phối đều tải theo người dùng.
- `commissionRecords`: shard theo `expertId` hoặc `transactionDate` (time-range) tùy truy vấn chi phối (báo cáo theo chuyên gia hay theo kỳ).
- `validationRequests`: shard theo `expertId` để cân bằng hàng chờ chuyên gia.
- `refresh_tokens`: shard theo `userId` (hashed) vì queries chủ yếu theo user.
- `contentFlags`: shard theo `contentId` (hashed) để phân phối theo nội dung.

## Lưu ý triển khai

- Validator áp dụng bằng `db.runCommand({ collMod: ..., validator: ... })` trong script khởi tạo.
- Duy trì `createdAt/updatedAt` qua Mongoose timestamps: true (tự động).
- Xem xét dung lượng `questionSets.questions[]`; nếu >10k câu, cân nhắc tách sang collection `questions` riêng, hoặc phân mảnh đề.
- Log chi phí LLM (nếu cần) ở collection riêng (ngoài phạm vi tài liệu này).
- TTL indexes cần MongoDB 3.2+ và chạy background thread, có độ trễ ~60s.
- OAuth identity unique index sử dụng partial filter để chỉ áp dụng khi cả `provider` và `providerSub` đều là string (không null).

---

Tài liệu này đồng bộ với codebase backend hiện tại (Mongoose models). Bao gồm các collections mới: `emailTemplates`, `refresh_tokens`, `password_reset_tokens`, `usageTracking`, `contentFlags`, `systemSettings`. Cập nhật ngày 26/11/2025.
