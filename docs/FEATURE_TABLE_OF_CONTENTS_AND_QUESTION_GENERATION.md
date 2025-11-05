# Tóm tắt các thay đổi: Tính năng Quản lý Mục lục và Question Generation Nâng cao

## Tổng quan

Đã triển khai thành công hai tính năng chính:

1. **Quản lý mục lục (Table of Contents)** cho tài liệu và môn học
2. **Question-sets generation nâng cao** với phân bố độ khó và topic mapping

## Chi tiết các thay đổi

### 1. Document Model (`src/models/document.model.js`)

**Thêm mới:**
- Trường `tableOfContents` (Array): Mục lục riêng cho từng tài liệu
- Cấu trúc TopicSchema với các trường:
  - `topicId` (String): ID duy nhất của topic
  - `topicName` (String): Tên của topic
  - `childTopics` (Array): Cấu trúc đệ quy cho các topic con

**Lợi ích:**
- Mỗi tài liệu có thể có mục lục riêng
- Hỗ trợ cấu trúc phân cấp (topic cha - con)
- **TỰ ĐỘNG TẠO**: Khi upload document, LLM tự động phân tích và tạo mục lục

### 2. QuestionSet Model (`src/models/questionSet.model.js`)

**Thêm mới:**
- Trường `topicId` trong QuestionSchema: Gắn câu hỏi với topic trong mục lục

**Lợi ích:**
- Mỗi câu hỏi có thể được liên kết với một nội dung cụ thể trong mục lục
- Dễ dàng phân tích và báo cáo theo từng phần nội dung

### 3. **LLM Client (`src/adapters/llmClient.js`)**

**Cải tiến phương thức `generateQuestions`:**

**Tham số mới:**
- `difficultyDistribution` (Object): Phân bố số câu hỏi theo độ khó (Bloom's Taxonomy)
  - Ví dụ: `{ "Remember": 20, "Understand": 10, "Apply": 10, "Analyze": 10 }`
- `topicDistribution` (Object): Phân bố số câu hỏi theo topic
  - Ví dụ: `{ "topic-id-1": 10, "topic-id-2": 20 }`
- `tableOfContents` (Array): Mục lục của môn học/tài liệu

**Cải tiến prompt:**
- Tự động xây dựng hướng dẫn phân bố độ khó cho LLM
- Truyền mục lục vào prompt để LLM biết cấu trúc nội dung
- Yêu cầu LLM gắn `topicId` cho mỗi câu hỏi khi có topicDistribution
- LLM sẽ tuân thủ chính xác tỷ lệ câu hỏi theo yêu cầu

**Phương thức mới `generateTableOfContents`:**
- Tự động phân tích nội dung document
- Tạo mục lục phân cấp (tối đa 3 level)
- Generate unique `topicId` cho mỗi topic
- Tự động gọi khi upload document (qua job `content.summary`)

### 4. QuestionSets Controller (`src/controllers/questionSets.controller.js`)

**Cập nhật endpoint POST `/question-sets/generate`:**

**Request body mới:**
```javascript
{
  "subjectId": "string (required)",
  "title": "string (required)",
  "numQuestions": 10, // optional, bỏ qua nếu dùng difficultyDistribution
  "difficulty": "Understand", // optional, bỏ qua nếu dùng difficultyDistribution
  "difficultyDistribution": { // optional - Bloom's Taxonomy levels
    "Remember": 20,
    "Understand": 10,
    "Apply": 10,
    "Analyze": 10
  },
  "topicDistribution": { // optional
    "topic-uuid-1": 10,
    "topic-uuid-2": 20
  }
}
```

**Logic mới:**
1. Lấy `tableOfContents` từ môn học (Subject)
2. Validate tổng số câu hỏi từ `difficultyDistribution` (nếu có)
3. Truyền tất cả thông tin cần thiết xuống LLM Client
4. LLM sẽ tạo câu hỏi theo đúng phân bố yêu cầu

### 5. OpenAPI Specification (`docs/api/learinal-openapi.yaml`)

**Cập nhật schema Document:**
- Thêm trường `tableOfContents` với cấu trúc nested objects

**Cập nhật schema Question:**
- Thêm trường `topicId` (nullable) với mô tả tiếng Việt

**Cập nhật endpoint `/question-sets/generate`:**
- Thay đổi required fields: `subjectId` và `title` (thay vì `documentId`)
- Thêm `difficultyDistribution` (object)
- Thêm `topicDistribution` (object)
- Cập nhật mô tả chi tiết cho từng trường

### 6. MongoDB Schema Documentation (`docs/mongodb-schema.md`)

**Cập nhật collection `documents`:**
- Thêm trường `tableOfContents` vào bảng trường dữ liệu

**Cập nhật collection `questionSets`:**
- Thêm bảng mô tả chi tiết các trường trong `questions[]` subdocument
- Thêm mô tả cho trường `topicId`
- Bổ sung ghi chú về phân bố câu hỏi

### 7. Content Summary Job (`src/jobs/content.summary.js`)

**Thêm tính năng tự động tạo Table of Contents:**
- Chạy song song với việc tạo summary (sử dụng `Promise.allSettled`)
- Gọi `llmClient.generateTableOfContents()` để tạo mục lục
- Lưu `tableOfContents` vào document nếu tạo thành công
- Graceful handling: Nếu TOC generation thất bại, vẫn lưu summary

**Workflow khi upload document:**
```
1. Upload File → Document created (status: "Uploading")
2. document.ingestion job → Extract text (status: "Processing")
3. content.summary job → Generate:
   - summaryShort
   - summaryFull
   - tableOfContents (TỰ ĐỘNG cho Document)
4. Document completed (status: "Completed")
5. Update Subject TOC → Generate:
   - tableOfContents (TỰ ĐỘNG cho Subject - chỉ 1 level)
   - Dựa trên TẤT CẢ documents đã completed trong subject
```

**Đặc điểm Subject Table of Contents:**
- **Chỉ 1 level** (flat structure): Mỗi môn học có danh sách các chương
- **Không có nested childTopics**: childTopics luôn là mảng rỗng `[]`
- **Tự động merge**: Nếu nhiều documents cover cùng topic, LLM sẽ gộp thành một chương
- **5-15 chương**: LLM tạo số lượng chương hợp lý cho môn học
- **Cập nhật mỗi lần upload**: Mỗi khi có document mới completed, Subject TOC được regenerate

## Ví dụ sử dụng

### Ví dụ 1: Tạo đề với phân bố độ khó

```bash
POST /api/v1/question-sets/generate
Content-Type: application/json
Authorization: Bearer <token>

{
  "subjectId": "66bb123456789abc",
  "title": "Đề thi giữa kỳ - Cấu trúc dữ liệu",
  "difficultyDistribution": {
    "Remember": 20,
    "Understand": 15,
    "Apply": 10,
    "Analyze": 5
  }
}
```

Kết quả: Tạo bộ đề 50 câu với:
- 20 câu "Remember" (Nhớ/Biết - Bloom's Level 1)
- 15 câu "Understand" (Hiểu - Bloom's Level 2)
- 10 câu "Apply" (Vận dụng - Bloom's Level 3)
- 5 câu "Analyze" (Phân tích - Bloom's Level 4)

### Ví dụ 2: Tạo đề với phân bố theo topic

Giả sử môn học có mục lục:
```json
[
  {"topicId": "topic-1", "topicName": "Stack và Queue"},
  {"topicId": "topic-2", "topicName": "Tree và Graph"}
]
```

Request:
```bash
POST /api/v1/question-sets/generate
Content-Type: application/json
Authorization: Bearer <token>

{
  "subjectId": "66bb123456789abc",
  "title": "Đề thi cuối kỳ",
  "difficultyDistribution": {
    "Remember": 10,
    "Understand": 10,
    "Apply": 5,
    "Analyze": 5
  },
  "topicDistribution": {
    "topic-1": 15,
    "topic-2": 15
  }
}
```

Kết quả: Tạo bộ đề 30 câu với:
- 15 câu về "Stack và Queue"
- 15 câu về "Tree và Graph"
- Mỗi topic có phân bố độ khó tương ứng
- Mỗi câu hỏi sẽ có trường `topicId` gắn với topic phù hợp

### Ví dụ 3: Tạo đề đơn giản (backward compatible)

```bash
POST /api/v1/question-sets/generate
Content-Type: application/json
Authorization: Bearer <token>

{
  "subjectId": "66bb123456789abc",
  "title": "Đề ôn tập",
  "numQuestions": 20,
  "difficulty": "Understand"
}
```

Kết quả: Tạo bộ đề 20 câu với độ khó "Understand" (giống cách hoạt động cũ)

## Backward Compatibility

Tất cả các thay đổi đều tương thích ngược:
- Trường `tableOfContents` và `topicId` đều là optional
- Endpoint cũ vẫn hoạt động với `numQuestions` và `difficulty`
- Không ảnh hưởng đến các bộ đề đã tạo trước đó

## Testing Checklist

- [ ] Test tạo đề với `difficultyDistribution`
- [ ] Test tạo đề với `topicDistribution`
- [ ] Test tạo đề với cả hai distribution
- [ ] Test backward compatibility với request cũ
- [ ] Verify câu hỏi được gắn đúng `topicId`
- [ ] Verify tổng số câu hỏi khớp với distribution
- [ ] Test với subject có/không có tableOfContents

## Lưu ý triển khai

1. **LLM Configuration**: Đảm bảo `GEMINI_API_KEY` được cấu hình đúng
2. **Subject TOC**: Cần có mục lục trong Subject để topicDistribution hoạt động tốt
3. **Validation**: Controller đã validate tổng số câu hỏi từ distribution
4. **LLM Behavior**: LLM có thể không luôn tuân thủ 100% distribution nếu context không đủ

## Next Steps (Optional Enhancements)

1. Thêm API để cập nhật `tableOfContents` cho Document
2. Thêm API để tự động tạo TOC từ nội dung tài liệu (sử dụng LLM)
3. Thêm validation để đảm bảo `topicId` trong distribution tồn tại trong TOC
4. Thêm analytics/reporting theo topic và difficulty level
5. Hỗ trợ nested topics trong topicDistribution

---

**Ngày hoàn thành:** 5 tháng 11, 2025
**Tuân thủ:** Instruction file, OpenAPI spec, MongoDB schema, coding conventions
