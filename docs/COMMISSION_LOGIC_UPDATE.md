# Cập nhật Logic Tính Hoa Hồng Expert

## Tổng quan thay đổi

Đã cập nhật logic tính hoa hồng để tối ưu chi phí và công bằng hơn:

### 1. Validated Type: Trả 1 lần khi hoàn thành kiểm duyệt

**Trước đây:**
- Expert nhận 150đ mỗi lần learner làm bài trên bộ đề đã kiểm duyệt
- Trong vòng 180 ngày sau khi approve

**Bây giờ:**
- Expert nhận 150đ **một lần duy nhất** ngay khi hoàn thành kiểm duyệt (decision = Approved)
- Không tính thêm khi có quiz attempts
- Đơn giản, rõ ràng, dễ tính toán

### 2. Published Type: Giới hạn 20 lượt/learner

**Trước đây:**
- Expert nhận 300đ cho **mọi** quiz attempt của premium users
- Không có giới hạn → Dễ bị spam/abuse

**Bây giờ:**
- Expert nhận 300đ cho **mỗi lượt làm bài**
- **Giới hạn tối đa 20 lượt commission cho mỗi learner ID trên mỗi bộ đề**
- Ví dụ: Learner X làm 50 lần → Expert chỉ nhận 20 lần đầu = 6,000đ

## Chi tiết kỹ thuật

### Files đã thay đổi

1. **src/jobs/review.completed.js**
   - Thêm logic tạo commission record khi validation approved
   - Chỉ tạo 1 lần duy nhất cho mỗi validationRequestId

2. **src/jobs/commission.calculate.js**
   - Skip VALIDATED type (đã tính khi complete)
   - Thêm check limit 20 lượt/learner cho PUBLISHED type
   - Thêm learnerId vào metadata để track

3. **src/models/commissionRecord.model.js**
   - Thêm field `metadata.learnerId` để track limit

4. **docs/COMMISSION_HYBRID_MODEL.md**
   - Cập nhật documentation đầy đủ

### Logic Flow

#### VALIDATED Type

```javascript
// Trong validationRequests.controller.js -> complete()
await reviewCompleted({
  validationRequestId,
  expertId,
  setId,
  decision, // 'Approved' hoặc 'Rejected'
});

// Trong review.completed.js
if (decision === 'Approved') {
  // Check xem đã tạo commission chưa
  const existing = await CommissionRecord.findOne({
    validationRequestId,
    type: 'Validated'
  });
  
  if (!existing) {
    // Tạo commission 150đ một lần
    await CommissionRecord.create({
      expertId,
      attemptId: null, // Không liên kết với attempt cụ thể
      setId,
      validationRequestId,
      type: 'Validated',
      fixedAmount: 150,
      commissionAmount: 150,
      // ...
    });
  }
}
```

#### PUBLISHED Type

```javascript
// Trong commission.calculate.js
async function calculateCommissionForAttempt({ attemptId }) {
  // ... existing checks ...
  
  if (commissionInfo.type === 'PUBLISHED') {
    // Đếm số commissions đã tạo cho learner này với question set này
    const count = await CommissionRecord.countDocuments({
      setId: questionSet._id,
      type: 'Published',
      'metadata.learnerId': attempt.userId.toString(),
    });
    
    if (count >= 20) {
      logger.info('Learner exceeded 20 attempts limit - skipping');
      return null; // Không tạo commission
    }
  }
  
  // Tạo commission với learnerId trong metadata
  await CommissionRecord.create({
    // ...
    metadata: {
      questionSetTitle: questionSet.title,
      learnerId: attempt.userId.toString(), // Track cho limit
    }
  });
}
```

## Migration

**Không cần migration cho dữ liệu cũ.**

Lý do:
- Schema đã tương thích (attemptId có thể null)
- Chỉ ảnh hưởng đến commissions mới
- Records cũ vẫn hợp lệ

## Testing

### Test Case 1: Validated Type

1. Learner tạo bộ đề và request validation
2. Expert approve validation
3. ✅ Check: 1 CommissionRecord được tạo với fixedAmount = 150
4. Learner làm bài 10 lần
5. ✅ Check: Vẫn chỉ có 1 commission record (không tăng)

### Test Case 2: Published Type - Under Limit

1. Expert tạo bộ đề Public
2. Learner A làm bài 5 lần (premium)
3. ✅ Check: 5 CommissionRecords được tạo (5 × 300 = 1,500đ)

### Test Case 3: Published Type - Over Limit

1. Expert tạo bộ đề Public
2. Learner B làm bài 25 lần (premium)
3. ✅ Check: Chỉ 20 CommissionRecords được tạo (20 × 300 = 6,000đ)
4. ✅ Check: 5 lần cuối không tạo commission (log "exceeded limit")

### Test Case 4: Multiple Learners

1. Expert tạo bộ đề Public
2. 10 learners, mỗi người làm 30 lần
3. ✅ Check: Mỗi learner tạo 20 commissions
4. ✅ Total: 10 × 20 × 300 = 60,000đ

## Lợi ích

✅ **Chi phí dự đoán được**: Expert biết rõ sẽ nhận bao nhiêu từ validation (150đ/bộ đề)
✅ **Chống spam**: Limit 20 lượt/learner tránh abuse từ một user
✅ **Công bằng hơn**: Khuyến khích nhiều learners khác nhau làm bài
✅ **Đơn giản hóa**: Validated type không còn phải track entitlement period

## Cấu hình

Có thể điều chỉnh limit trong code:

```javascript
// Trong commission.calculate.js
const maxAttemptsPerLearner = 20; // Thay đổi nếu cần
```

Hoặc nên đưa vào config file:

```javascript
// src/config/commission.js
module.exports = {
  // ... existing config ...
  maxAttemptsPerLearner: 20, // Limit cho Published type
};
```

## Monitoring

Log events để theo dõi:

```
✅ "Validation commission created (one-time payment)" - Tạo commission cho validation
✅ "Validated commission already paid at validation time - skipping" - Skip validated khi có attempt
✅ "Learner exceeded 20 attempts limit - skipping commission" - Đã đạt limit
```

## Tương lai

Có thể mở rộng:
- Cho phép admin config limit linh hoạt
- Tăng limit cho premium learners
- Bonus cho bộ đề hot (>100 unique learners)
