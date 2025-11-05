# Changelog - Question Generation Queue Implementation

## Ngày: 5 tháng 11, 2025

### 🎯 Mục tiêu
Chuyển quá trình tạo bộ đề (question generation) sang xử lý bất đồng bộ sử dụng queue, tương tự như luồng tóm tắt và tạo mục lục của tài liệu. Sau khi bộ đề được tạo xong, gửi thông báo đến người dùng.

---

## 📝 Các thay đổi chính

### 1. Model Updates

#### `src/models/questionSet.model.js`
- ✅ Thêm status mới: `Pending`, `Processing`, `Error`
- ✅ Cập nhật enum để hỗ trợ flow bất đồng bộ

**Before:**
```javascript
status: {
  type: String,
  enum: ["Public", "PendingValidation", "InReview", "Validated", "Rejected", "Draft", "PendingApproval", "Published"],
  required: true,
}
```

**After:**
```javascript
status: {
  type: String,
  enum: ["Pending", "Processing", "Draft", "Public", "PendingValidation", "InReview", "Validated", "Rejected", "PendingApproval", "Published", "Error"],
  required: true,
}
```

---

### 2. Controller Updates

#### `src/controllers/questionSets.controller.js`
- ✅ Thay đổi từ synchronous sang asynchronous generation
- ✅ Return status `202 Accepted` thay vì `201 Created`
- ✅ Tạo question set với status `Pending` và `questions: []`
- ✅ Enqueue job thay vì gọi LLM trực tiếp

**Key Changes:**
```javascript
// Before: Gọi LLM trực tiếp
const { questions } = await client.generateQuestions({...});
const created = await repo.create({
  ...
  status: "Draft",
  questions,
});
return res.status(201).json(mapId(created));

// After: Enqueue job
const created = await repo.create({
  ...
  status: "Pending",
  questions: [],
});
await enqueueQuestionsGenerate({
  questionSetId: created._id.toString(),
  userId: user.id,
  subjectId,
  numQuestions,
  difficulty,
  difficultyDistribution,
  topicDistribution,
});
return res.status(202).json({
  ...mapId(created),
  message: "Question set generation started. You will receive a notification when completed.",
});
```

---

### 3. Job Handler Updates

#### `src/jobs/questions.generate.js`
- ✅ Hoàn toàn viết lại để xử lý đầy đủ
- ✅ Thêm logging chi tiết
- ✅ Xử lý status transitions: `Pending → Processing → Draft/Error`
- ✅ Build context từ documents (summaries + extracted text)
- ✅ Lấy table of contents từ subject
- ✅ Tạo in-app notification
- ✅ Emit real-time notification qua WebSocket
- ✅ Error handling với notification

**New Features:**
- Document context aggregation (ưu tiên summaries)
- Subject table of contents integration
- Dual notification system (in-app + real-time)
- Graceful error handling
- Comprehensive logging

---

### 4. Queue Configuration

#### `src/adapters/queue.js`
- ✅ Đã có sẵn `enqueueQuestionsGenerate()` function
- ✅ Retry: 3 attempts với exponential backoff (500ms)

#### `src/worker.js`
- ✅ Đã có sẵn worker cho `questionsGenerate` queue
- ✅ Kết nối MongoDB trước khi start workers

---

### 5. Notification System

#### In-app Notifications
- ✅ Success notification khi hoàn thành
- ✅ Error notification khi thất bại
- ✅ Lưu vào `notifications` collection
- ✅ Link đến question set qua `relatedEntityId`

#### Real-time Notifications
- ✅ Event: `questionSet.generated`
- ✅ Gửi qua Socket.IO đến user room
- ✅ Include metadata: questionSetId, title, totalQuestions, status

**Service Method:**
```javascript
notificationService.emitQuestionSetGenerated(userId, questionSet);
```

---

### 6. Testing

#### `tests/integration/questionSets.api.test.js` (NEW)
- ✅ Test POST /question-sets/generate returns 202
- ✅ Test validation rules (numQuestions, difficultyDistribution)
- ✅ Test LLM configuration check
- ✅ Test authentication
- ✅ Test GET /question-sets pagination
- ✅ Test GET /question-sets/:id
- ✅ Test PATCH /question-sets/:id
- ✅ Test ownership checks

---

### 7. Documentation

#### `docs/QUESTION_GENERATION_FLOW.md` (NEW)
- ✅ Mô tả chi tiết luồng xử lý
- ✅ Sequence diagram
- ✅ Status flow
- ✅ So sánh với Document Summary flow
- ✅ Error handling
- ✅ Monitoring & logging

#### `docs/QUESTION_GENERATION_USAGE.md` (NEW)
- ✅ Hướng dẫn sử dụng API
- ✅ Request/Response examples
- ✅ WebSocket integration
- ✅ Validation rules
- ✅ Troubleshooting guide

---

## 🔄 Flow Comparison

### Before (Synchronous)
```
User Request → Controller → LLM Generate (30s-2min) → Response
                              ↓ (User waits...)
                           Questions
```

### After (Asynchronous)
```
User Request → Controller → Enqueue Job → Immediate Response (202)
                              ↓
                           Worker picks up job
                              ↓
                           Update status: Processing
                              ↓
                           LLM Generate (30s-2min)
                              ↓
                           Update status: Draft
                              ↓
                           Create notification
                              ↓
                           Emit WebSocket event
                              ↓
                           User receives notification
```

---

## ✅ Benefits

1. **Better UX**: Người dùng không phải chờ lâu, nhận response ngay lập tức
2. **Scalability**: Worker có thể xử lý nhiều requests đồng thời
3. **Reliability**: Retry mechanism khi có lỗi
4. **Monitoring**: Dễ dàng track status và logs
5. **Consistency**: Giống với Document Summary flow, dễ maintain
6. **Notifications**: Người dùng biết khi nào bộ đề sẵn sàng

---

## 🧪 Testing Steps

### 1. Start services
```bash
# Terminal 1: Start Redis
docker run -p 6379:6379 redis:alpine

# Terminal 2: Start MongoDB
# (already running)

# Terminal 3: Start API server
npm start

# Terminal 4: Start worker
npm run worker
```

### 2. Test API
```bash
# 1. Generate question set
curl -X POST http://localhost:3000/api/v1/question-sets/generate \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "subjectId": "507f1f77bcf86cd799439011",
    "title": "Test Question Set",
    "numQuestions": 10,
    "difficulty": "Understand"
  }'

# Expected: 202 Accepted with status "Pending"

# 2. Check status
curl http://localhost:3000/api/v1/question-sets/{id} \
  -H "Authorization: Bearer $TOKEN"

# Expected: Status changes Pending → Processing → Draft

# 3. Check notifications
curl http://localhost:3000/api/v1/notifications \
  -H "Authorization: Bearer $TOKEN"

# Expected: Success notification about question set
```

### 3. Run integration tests
```bash
npm test tests/integration/questionSets.api.test.js
```

---

## 📋 Checklist

- [x] Update QuestionSet model với new statuses
- [x] Refactor controller để enqueue job
- [x] Rewrite job handler với full logic
- [x] Add in-app notifications
- [x] Add real-time notifications
- [x] Add error handling
- [x] Add comprehensive logging
- [x] Write integration tests
- [x] Write documentation (flow + usage)
- [x] Verify no lint errors
- [ ] Manual testing với real LLM
- [ ] Load testing với multiple concurrent requests
- [ ] Update OpenAPI spec (optional)

---

## 🚀 Next Steps

1. **Manual Testing**
   - Test với real GEMINI_API_KEY
   - Test với nhiều concurrent requests
   - Test error cases (LLM timeout, invalid response)

2. **Performance Monitoring**
   - Add metrics tracking
   - Monitor queue depth
   - Track average generation time

3. **Future Enhancements**
   - Progress tracking (0-100%)
   - Priority queue cho premium users
   - Cancel/Abort functionality
   - Estimated completion time

---

## 📊 Metrics to Monitor

- Queue depth (questionsGenerate)
- Average processing time per question set
- Success rate vs error rate
- Retry count distribution
- Notification delivery rate
- WebSocket connection stability

---

## 🐛 Known Issues

None at the moment.

---

## 👥 Related PRs/Issues

- Related to: Document Summary Queue (#xxx)
- Implements: Question Generation Async (#xxx)
- Closes: #xxx

---

## 📞 Contact

Nếu có vấn đề, liên hệ team backend hoặc tạo issue mới.
