# Hệ thống Hoa hồng Expert - Hybrid Model

## Tổng quan

Hệ thống hoa hồng Hybrid Model kết hợp **Fixed Rate** (tỷ lệ cố định) và **Revenue Bonus** (thưởng doanh thu) để:

- Đảm bảo thu nhập ổn định cho Expert (Fixed)
- Khuyến khích nội dung phổ biến (Bonus)
- Bảo vệ doanh nghiệp khỏi lỗ

## Cấu trúc hoa hồng

### 1. Fixed Rate (Tính ngay khi có quiz attempt)

| Loại nội dung     | Fixed Rate      | Mô tả                                   |
| ------------------- | --------------- | ----------------------------------------- |
| **Published** | 300 VND/attempt | Expert tự tạo và publish bộ đề      |
| **Validated** | 150 VND/attempt | Expert kiểm duyệt bộ đề của Learner |

### 2. Revenue Bonus (Tính cuối tháng)

| Loại nội dung     | Threshold            | Bonus Rate                    |
| ------------------- | -------------------- | ----------------------------- |
| **Published** | >100 attempts/tháng | +5% doanh thu vượt ngưỡng |
| **Validated** | >100 attempts/tháng | +2% doanh thu vượt ngưỡng |

**Công thức:**

```
Bonus = (Số attempt vượt ngưỡng) × (Doanh thu trung bình/attempt) × (Bonus Rate)
      = (totalAttempts - 100) × 500 VND × rate
```

### 3. Ví dụ tính toán

#### Expert A: Content phổ biến (Published)

- Tháng 11: 250 quiz attempts
- Fixed: 250 × 300 = **75,000 VND**
- Bonus: (250-100) × 500 × 0.05 = **3,750 VND**
- **Tổng: 78,750 VND**

#### Expert B: Validator (Validated)

- Tháng 11: 180 quiz attempts
- Fixed: 180 × 150 = **27,000 VND**
- Bonus: (180-100) × 500 × 0.02 = **800 VND**
- **Tổng: 27,800 VND**

## Điều kiện áp dụng

### Commission được tạo khi:

1. User hoàn thành quiz (`isCompleted = true`)
2. Question set có status `Published` hoặc `Validated`
3. Đối với Validated: còn trong thời hạn hưởng quyền (180 ngày)

### Chỉ tính Bonus cho:

- Attempts từ Premium users (`isPremiumAttempt = true`)
- Attempts đạt ngưỡng >100/tháng/bộ đề

## API Endpoints

### Expert Endpoints

```
GET /commission-records
  - Danh sách commission records của Expert
  - Query params: page, pageSize, status

GET /commission-records/summary?month=2024-11
  - Tổng hợp thu nhập (fixed + bonus breakdown)
  
GET /commission-records/stats?month=2024-11
  - Thống kê chi tiết theo loại và status
```

### Admin Endpoints

```
GET /commission-records/config
  - Xem cấu hình hiện tại

GET /commission-records/pending-summary
  - Tổng hợp pending payments theo Expert

POST /commission-records/reconcile
  - Trigger monthly reconciliation thủ công
  - Body: { "month": "2024-11" }

PATCH /commission-records/batch/mark-paid
  - Batch thanh toán
  - Body: { "commissionIds": [...], "paymentReference": "..." }

PATCH /commission-records/:id/mark-paid
  - Đánh dấu đã thanh toán
```

## Database Schema

```javascript
CommissionRecord {
  expertId: ObjectId,        // Expert nhận commission
  attemptId: ObjectId,       // Quiz attempt
  setId: ObjectId,           // Question set
  validationRequestId: ObjectId, // Nếu type = Validated
  
  type: "Published" | "Validated",
  
  fixedAmount: Number,       // Fixed rate amount
  bonusAmount: Number,       // Revenue bonus (tính cuối tháng)
  commissionAmount: Number,  // Tổng = fixed + bonus
  
  isPremiumAttempt: Boolean, // User có subscription không
  isReconciled: Boolean,     // Đã tính bonus chưa
  reconciliationMonth: String, // "YYYY-MM"
  
  status: "Pending" | "Paid" | "Cancelled",
  entitledUntil: Date,       // Thời hạn hưởng quyền (Validated)
}
```

## Cron Jobs

### 1. Commission Calculate Worker

- Queue: `commissionCalculate`
- Trigger: Khi user submit quiz
- Tính fixed commission ngay lập tức

### 2. Monthly Reconciliation

- Schedule: `0 3 1 * *` (3 AM ngày 1 hàng tháng)
- Tính revenue bonus cho tháng trước
- Cập nhật `bonusAmount` và `isReconciled`

## Cấu hình

File: `src/config/commission.js`

```javascript
{
  commissionPoolRate: 0.30,    // 30% doanh thu cho pool
  fixedRates: {
    published: 300,            // VND
    validated: 150,            // VND
  },
  revenueBonus: {
    attemptThreshold: 100,     // Ngưỡng attempts
    rates: {
      published: 0.05,         // 5%
      validated: 0.02,         // 2%
    },
  },
  averageRevenuePerAttempt: 500, // VND (ước tính)
  entitlementDays: 180,        // 6 tháng
  minimumCommissionAmount: 10, // VND
}
```

## Migration

Chạy migration script cho records cũ:

```bash
node scripts/migrate-commission-records.js
```

## Flow Chart

```
Quiz Submit
    │
    ▼
Worker: commissionCalculate
    │
    ├─► Check: Question Set Published/Validated?
    │       │
    │       └─► No: Skip
    │
    ├─► Check: Expert exists?
    │       │
    │       └─► No: Skip
    │
    ├─► Check: Entitlement valid? (for Validated)
    │       │
    │       └─► No: Skip
    │
    ├─► Calculate Fixed Amount
    │       Published: 300 VND
    │       Validated: 150 VND
    │
    └─► Create CommissionRecord (status: Pending)

Monthly Reconciliation (Day 1, 3AM)
    │
    ▼
Get unreconciled records for previous month
    │
    ▼
Group by setId
    │
    ▼
For each set:
    │
    ├─► Count premium attempts
    │
    ├─► If > 100: Calculate bonus
    │       Bonus = (excess × 500 × rate)
    │
    └─► Update records: bonusAmount, isReconciled = true

Admin: Mark Paid
    │
    ▼
Update status: Paid
    │
    ▼
Notify Expert (optional)
```

## Lưu ý quan trọng

1. **Entitlement Period**: Validated content chỉ được tính commission trong 180 ngày
2. **Premium Only Bonus**: Chỉ tính bonus từ premium user attempts
3. **No Double Commission**: Mỗi attempt chỉ tạo 1 commission record (unique index)
4. **Backward Compatible**: API `/summary` vẫn trả về các field cũ để FE không cần update ngay
