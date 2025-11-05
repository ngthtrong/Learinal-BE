# Learinal – Thiết kế Cơ sở Dữ liệu MongoDB

Tài liệu này mô tả chi tiết thiết kế CSDL MongoDB cho dự án Learinal, bao gồm danh sách collection, cấu trúc tài liệu (document schema), quy tắc xác thực (validator), chỉ mục (indexes), chiến lược nhúng/tham chiếu (embed/reference), và gợi ý sharding. Tài liệu nhằm phục vụ nhóm backend triển khai nhất quán và hiệu quả.

## Nguyên tắc chung

- Tên collection dạng số nhiều, lowerCamelCase: `users`, `subjects`, `documents`, `questionSets`, `quizAttempts`, `validationRequests`, `commissionRecords`, `subscriptionPlans`, `userSubscriptions`, `notifications`.
- Mỗi document có `createdAt`, `updatedAt` (Date). Cập nhật `updatedAt` ở tầng ứng dụng.
- ID: MongoDB ObjectId mặc định cho _id. Với subdocument trong mảng (ví dụ: `questionSets.questions`), dùng `questionId` kiểu UUID string.
- Lựa chọn nhúng vs tham chiếu:
  - Nhúng (embed): `questions` trong `questionSets` để đọc đề nhanh, nguyên tử theo bộ đề.
  - Tham chiếu (reference): quan hệ giữa user–subject–document–questionSet–quizAttempt; tránh nhân bản dữ liệu.
- Giới hạn kích thước: tuân thủ 16MB/document của MongoDB. Tránh nhúng quá lớn; phân trang câu hỏi nếu cần.
- Quốc tế hóa: chuỗi UTF-8, không hard-code locale trong dữ liệu.

## Tổng quan collections

| Collection | Mục đích | Ghi chú quan trọng |
|---|---|---|
| users | Tài khoản người dùng, vai trò, trạng thái, gói đăng ký hiện tại | Tham chiếu `subscriptionPlanId`, theo dõi `subscriptionStatus`/`renewalDate` |
| subjects | Nhóm tài liệu và bộ đề theo từng môn | Thuộc về 1 user (owner) |
| documents | Tài liệu tải lên, văn bản trích xuất và tóm tắt | Có `summaryShort`/`summaryFull` hiển thị đầu nội dung |
| questionSets | Bộ đề thi (trắc nghiệm) | Nhúng `questions[]`; trạng thái (Public/Validated/Published...) |
| quizAttempts | Lượt làm bài | Ghi điểm, answers; phát sinh hoa hồng |
| validationRequests | Yêu cầu xác thực bộ đề | Liên quan learner/admin/expert |
| commissionRecords | Bản ghi hoa hồng cho Expert | Ghi theo attempt/set; trạng thái Pending/Paid |
| subscriptionPlans | Danh mục gói đăng ký | entitlements JSON, Monthly/Yearly |
| userSubscriptions | Lịch sử đăng ký của user | Trạng thái Active/Expired/Cancelled |
| notifications | Thông báo | Theo user, có cờ isRead |

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
  "createdAt": {"$date": "2025-10-01T10:00:00Z"},
  "updatedAt": {"$date": "2025-10-10T10:00:00Z"}
}
```

Trường dữ liệu:

| Trường | Kiểu | Bắt buộc | Mô tả |
|---|---|---|---|
| fullName | String | Yes | Họ tên |
| email | String | Yes, unique | Định danh đăng nhập |
| hashedPassword | String | Yes | Mật khẩu đã băm (bcrypt) |
| role | String (enum) | Yes | 'Learner' | 'Expert' | 'Admin' |
| status | String (enum) | Yes | 'PendingActivation' | 'Active' | 'Deactivated' |
| subscriptionPlanId | ObjectId | No | Tham chiếu `subscriptionPlans._id` |
| subscriptionStatus | String (enum) | Yes | 'None' | 'Active' | 'Expired' | 'Cancelled' |
| subscriptionRenewalDate | Date | No | Ngày gia hạn tiếp theo |
| createdAt/updatedAt | Date | Yes | Dấu thời gian |

Indexes khuyến nghị:
- Unique: `email`.
- RBAC/truy vấn danh sách: `{ role: 1, status: 1, email: 1 }`.
- Theo gói: `{ subscriptionPlanId: 1, subscriptionStatus: 1 }`.

Validator (JSON Schema rút gọn):
```json
{
  "$jsonSchema": {
    "bsonType": "object",
    "required": ["fullName", "email", "hashedPassword", "role", "status", "subscriptionStatus", "createdAt", "updatedAt"],
    "properties": {
      "email": {"bsonType": "string", "pattern": "^.+@.+$"},
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
  "status": "Public", // 'Public'|'PendingValidation'|'InReview'|'Validated'|'Rejected'|'Draft'|'PendingApproval'|'Published'
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
| subjectId | ObjectId | Yes | Thuộc môn |
| title | String | Yes | Tiêu đề |
| status | String (enum) | Yes | Trạng thái vòng đời |
| isShared | Boolean | Yes | Chia sẻ công khai |
| sharedUrl | String | No | Đường dẫn chia sẻ |
| questions[] | Array<Object> | Yes | Danh sách câu hỏi nhúng |
| createdAt/updatedAt | Date | Yes | Dấu thời gian |

Trường trong questions[] (subdocument):

| Trường | Kiểu | Bắt buộc | Mô tả |
|---|---|---|---|
| questionId | String | Yes | UUID của câu hỏi |
| questionText | String | Yes | Nội dung câu hỏi |
| options | Array<String> | Yes | Các đáp án |
| correctAnswerIndex | Number | Yes | Chỉ số đáp án đúng (0-based) |
| explanation | String | No | Giải thích đáp án |
| topicTags | Array<String> | No | Tags phân loại |
| topicId | String | No | ID của topic trong tableOfContents mà câu hỏi thuộc về |
| topicStatus | String | No | Trạng thái topic |
| difficultyLevel | String (enum) | Yes | 'Remember' | 'Understand' | 'Apply' | 'Analyze' (Bloom's Taxonomy) |

Index:
- `{ userId: 1, subjectId: 1, status: 1, createdAt: -1 }`.
- `{ sharedUrl: 1 }` unique nếu cho phép truy cập công khai qua URL.

Lưu ý câu hỏi (nhúng): 
- Bắt buộc `difficultyLevel ∈ {Remember, Understand, Apply, Analyze}` theo Bloom's Taxonomy để tính trọng số.
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
  "startTime": {"$date": "2025-10-12T10:00:00Z"},
  "endTime": {"$date": "2025-10-12T10:30:00Z"}
}
```

Trường dữ liệu và Index:

| Trường | Kiểu | Bắt buộc | Index |
|---|---|---|---|
| userId | ObjectId | Yes | Yes: `{ userId: 1, endTime: -1 }` |
| setId | ObjectId | Yes | Yes: `{ setId: 1, endTime: -1 }` |
| score | Number | Yes |  |
| userAnswers | Array<Object> | Yes |  |
| isCompleted | Boolean | Yes |  |
| startTime/endTime | Date | Yes |  |

---

## 6) validationRequests

Mục đích: theo dõi yêu cầu xác thực.

```json
{
  "_id": {"$oid": "6700..."},
  "setId": {"$oid": "66ee..."},
  "learnerId": {"$oid": "665f..."},
  "adminId": {"$oid": "665a..."},
  "expertId": {"$oid": "665e..."},
  "status": "Assigned",  // 'PendingAssignment'|'Assigned'|'Completed'
  "requestTime": {"$date": "2025-10-12T11:00:00Z"},
  "completionTime": null
}
```

Index:
- `{ status: 1, requestTime: -1 }`
- `{ expertId: 1, status: 1 }` (hàng chờ chuyên gia)
- `{ adminId: 1, status: 1 }` (điều phối)

---

## 7) commissionRecords

Mục đích: ghi nhận hoa hồng theo công thức (xem SRS 4.1.2).

```json
{
  "_id": {"$oid": "6701..."},
  "expertId": {"$oid": "665e..."},
  "attemptId": {"$oid": "66ff..."},
  "setId": {"$oid": "66ee..."},
  "commissionAmount": 0.12,
  "transactionDate": {"$date": "2025-10-31T23:59:59Z"},
  "status": "Pending" // 'Pending' | 'Paid'
}
```

Indexes:
- `{ expertId: 1, status: 1, transactionDate: -1 }`
- `{ setId: 1, transactionDate: -1 }`

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
  "entitlementsSnapshot": { "maxValidationRequests": 20 }
}
```

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
  "createdAt": {"$date": "2025-10-12T12:00:00Z"}
}
```

Indexes:
- `{ userId: 1, isRead: 1, createdAt: -1 }`

---

## Ràng buộc nghiệp vụ và xác thực bổ sung

- `questions[].difficultyLevel` bắt buộc ∈ {'Biết','Hiểu','Vận dụng','Vận dụng cao'}.
- Tính điểm: backend tính theo trọng số (SRS 4.1.1), không lưu điểm từng câu trong đề gốc, chỉ lưu trong `quizAttempts.userAnswers[].isCorrect` và tổng `score`.
- Với `validationRequests`: chỉ 1 yêu cầu mở trên 1 set tại một thời điểm (có thể áp unique compound: `{ setId: 1, status: 1 }` với filter `status ∈ {'PendingAssignment','Assigned'}` bằng index partial).
- Với `questionSets.sharedUrl`: unique nếu bật chia sẻ công khai qua URL.

## Chỉ mục tổng hợp đề xuất

- Khối user-scoped: `{ userId: 1, createdAt: -1 }` áp dụng cho `subjects`, `questionSets`, `quizAttempts`.
- Truy vấn theo trạng thái công việc: `{ status: 1, updatedAt: -1 }` cho `validationRequests`, `questionSets`.
- Tài chính: `{ expertId: 1, status: 1, transactionDate: -1 }` cho `commissionRecords`.

## Sharding (gợi ý)

Phù hợp khi quy mô lớn:
- Shard theo `userId` (hashed) cho `subjects`, `documents`, `questionSets`, `notifications`, `quizAttempts` — phân phối đều tải theo người dùng.
- `commissionRecords`: shard theo `expertId` hoặc `transactionDate` (time-range) tùy truy vấn chi phối (báo cáo theo chuyên gia hay theo kỳ).
- `validationRequests`: shard theo `expertId` để cân bằng hàng chờ chuyên gia.

## Lưu ý triển khai

- Validator áp dụng bằng `db.runCommand({ collMod: ..., validator: ... })` trong script khởi tạo.
- Duy trì `createdAt/updatedAt` qua middleware (ORM) hoặc thủ công.
- Xem xét dung lượng `questionSets.questions[]`; nếu >10k câu, cân nhắc tách sang collection `questions` riêng, hoặc phân mảnh đề.
- Log chi phí LLM (nếu cần) ở collection riêng (ngoài phạm vi tài liệu này).

---

Tài liệu này đồng bộ với SRS hiện hành (bao gồm SubscriptionPlans/UserSubscriptions, tóm tắt theo tài liệu, công thức điểm/hoa hồng). Nếu cần, có thể xuất kèm JSON Schema/Index scripts riêng để dùng trong migration/seed.
