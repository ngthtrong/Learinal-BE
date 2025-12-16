# Tính năng Snapshot cho Validation Requests và Commission Records

## Vấn đề

Khi learner xóa bộ đề (question set), expert sẽ mất dữ liệu tại:
- Trang validation requests (`/expert/validation-requests`) - không hiển thị được tiêu đề, số câu hỏi
- Trang validation request detail - không xem được nội dung câu hỏi đã kiểm duyệt
- Commission records - mất thông tin về bộ đề đã tạo hoa hồng

## Giải pháp: Snapshot Pattern

Lưu bản sao (snapshot) của dữ liệu bộ đề vào validation request và commission record khi tạo.

### 1. ValidationRequest Model

**Thêm field mới:**

```javascript
questionSetSnapshot: {
  title: String,              // Tiêu đề bộ đề
  description: String,        // Mô tả
  questionCount: Number,      // Số lượng câu hỏi
  questions: [{               // Toàn bộ câu hỏi
    questionId: String,
    questionText: String,
    options: [String],
    correctAnswerIndex: Number,
    difficultyLevel: String,
    explanation: String,
  }]
}
```

**Khi nào lưu snapshot:**
- Khi learner request validation (`POST /question-sets/:id/review`)
- Snapshot được tạo từ question set hiện tại

**Khi nào dùng snapshot:**
- List validation requests: Nếu question set bị xóa, hiển thị `(Đã xóa)` + dữ liệu từ snapshot
- Detail validation request: Expert vẫn xem được toàn bộ câu hỏi từ snapshot

### 2. CommissionRecord Model

**Thêm field mới:**

```javascript
questionSetSnapshot: {
  title: String,         // Tiêu đề bộ đề
  description: String,   // Mô tả
  status: String,        // Published/Validated/Public
}
```

**Khi nào lưu snapshot:**
- Khi tính commission (`commissionCalculate` job)
- Snapshot được tạo từ question set hiện tại

**Khi nào dùng snapshot:**
- Hiển thị commission records khi question set đã bị xóa
- Dùng kết hợp với `metadata.questionSetTitle` đã có sẵn

## Các file đã thay đổi

### Backend Models
1. ✅ `src/models/validationRequest.model.js` - Thêm `questionSetSnapshot`
2. ✅ `src/models/commissionRecord.model.js` - Thêm `questionSetSnapshot`

### Controllers
3. ✅ `src/controllers/questionSets.controller.js` - Lưu snapshot khi tạo validation request
4. ✅ `src/controllers/validationRequests.controller.js` - Fallback to snapshot trong list và detail

### Jobs
5. ✅ `src/jobs/commission.calculate.js` - Lưu snapshot khi tính commission

### Migration Scripts
6. ✅ `scripts/backfill-validation-request-snapshots.js` - Backfill cho validation requests hiện có
7. ✅ `scripts/backfill-commission-snapshots.js` - Backfill cho commission records hiện có

### Documentation
8. ✅ `docs/COMMISSION_HYBRID_MODEL.md` - Cập nhật schema và hướng dẫn

## Cách chạy Migration

### Bước 1: Backfill Validation Requests

```bash
cd Learinal-BE
node scripts/backfill-validation-request-snapshots.js
```

Kết quả:
- Validation requests có question set còn tồn tại → copy dữ liệu vào snapshot
- Validation requests có question set đã xóa → tạo snapshot với title "(Đã xóa)"

### Bước 2: Backfill Commission Records

```bash
node scripts/backfill-commission-snapshots.js
```

Kết quả:
- Commission records có question set còn tồn tại → copy dữ liệu vào snapshot
- Commission records có question set đã xóa → dùng `metadata.questionSetTitle` nếu có

## Kiểm tra

### Test Case 1: Validation Request với Question Set bị xóa

1. Tạo bộ đề và request validation
2. Expert nhận request (hiển thị bình thường)
3. Learner xóa bộ đề
4. Expert vào `/expert/validation-requests` → Vẫn thấy tiêu đề "(Đã xóa)" và số câu hỏi
5. Expert click vào detail → Vẫn xem được toàn bộ câu hỏi từ snapshot

### Test Case 2: Commission Record với Question Set bị xóa

1. User làm bài quiz → tạo commission record
2. Admin xóa question set
3. Expert vào `/expert/commission-records` → Vẫn thấy tiêu đề bộ đề
4. Admin vào admin panel → Vẫn thấy đầy đủ thông tin commission

## Lợi ích

✅ Expert không mất dữ liệu khi learner xóa bộ đề
✅ Lịch sử validation được bảo toàn hoàn chỉnh
✅ Commission records luôn có đủ thông tin để tra cứu
✅ Tương thích ngược - không cần update frontend
✅ Migration script đơn giản, an toàn

## Lưu ý

- Snapshot chỉ lưu ở thời điểm tạo validation request / commission
- Nếu learner sửa bộ đề sau khi request validation, snapshot không tự động cập nhật
- Snapshot chiếm thêm storage, nhưng đảm bảo tính toàn vẹn dữ liệu
