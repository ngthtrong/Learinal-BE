# Hướng dẫn Sử dụng Tài liệu Hoàn thiện Backend

**Dành cho:** Team Backend Learinal  
**Ngày:** 02/11/2025

---

## Tổng quan Tài liệu

Dự án hiện tại đang ở trạng thái **MVP (v0.1)** với nhiều tính năng còn ở dạng stub hoặc chưa hoàn thiện. Bộ tài liệu này cung cấp roadmap đầy đủ để chuyển dự án sang **Production-Ready** theo SRS đầy đủ.

---

## Cấu trúc Tài liệu

### 1. BACKEND_COMPLETION_OVERVIEW.md ⭐ (BẮT ĐẦU TỪ ĐÂY)

**Mục đích:** Tổng quan toàn bộ các tính năng còn thiếu

**Nội dung:**
- Tình trạng hiện tại (✅ Completed / 🔴 Not Implemented)
- Danh sách đầy đủ 10 nhóm tính năng cần hoàn thiện
- Ưu tiên thực hiện (Priority Order)
- Metrics & Success Criteria
- Timeline ước tính: 8-12 tuần

**Khi nào đọc:**
- Lần đầu tiên làm quen với dự án
- Cần overview toàn bộ scope công việc
- Planning sprint/milestone
- Báo cáo tiến độ cho stakeholders

---

### 2. PHASE_1_SUBSCRIPTION_SYSTEM.md 🔴 (CRITICAL - Ưu tiên cao nhất)

**Mục đích:** Triển khai đầy đủ Subscription & Payment System

**Nội dung:**
- SubscriptionPlans CRUD (Admin)
- UserSubscriptions management
- Entitlement checking middleware
- Payment webhook integration (SePay)
- Background jobs (expiration, renewal reminder)
- Seed data cho 2 gói: Standard (2000đ) và Pro (5000đ)

**Code samples included:**
- ✅ Complete controller implementations
- ✅ Service layer với business logic
- ✅ Middleware for entitlement checks
- ✅ Webhook handler với signature verification
- ✅ Background jobs
- ✅ Unit & Integration tests

**Timeline:** 2-3 tuần  
**Dependencies:** None (có thể bắt đầu ngay)

**Khi nào implement:**
- NGAY LẬP TỨC - đây là foundation cho mọi tính năng premium
- Trước khi làm validation workflow (vì cần check subscription limits)

---

### 3. PHASE_2_EXPERT_WORKFLOW.md 🔴 (HIGH Priority)

**Mục đích:** Hoàn thiện Expert features (Validation & Commission)

**Nội dung:**
- Request validation endpoint (thay thế stub 202)
- Expert assignment worker (least-loaded strategy)
- Review completion workflow
- Commission calculation (theo công thức SRS 4.1.2)
- Commission records API
- Expert dashboard statistics
- Email notifications

**Code samples included:**
- ✅ Complete validation workflow
- ✅ Commission calculation với công thức phức tạp
- ✅ Email templates (assigned, completed, earned)
- ✅ Expert dashboard endpoints
- ✅ Admin commission management
- ✅ Full E2E test scenarios

**Timeline:** 2 tuần  
**Dependencies:** Phase 1 (cần subscription system để check limits)

**Khi nào implement:**
- Sau khi Phase 1 hoàn thành
- Khi cần monetize Expert network
- Khi có đủ Experts để test

---

### 4. PHASE_3_CONTENT_PROCESSING.md (TBD)

**Sẽ bao gồm:**
- Document text extraction (PDF/DOCX/TXT)
- Summary generation (short/full)
- Table of Contents generation
- Multi-level question generation
- LLM prompt optimization

**Timeline:** 1-2 tuần

---

### 5. PHASE_4_ADMIN_MANAGEMENT.md (TBD)

**Sẽ bao gồm:**
- User management (roles, status)
- System configuration
- Content moderation
- Financial reports
- Expert performance monitoring

**Timeline:** 1-2 tuần

---

### 6. PHASE_5_TESTING_QA.md (TBD)

**Sẽ bao gồm:**
- Unit test framework setup
- Integration tests
- E2E tests
- Test coverage targets (≥85%)
- CI/CD integration

**Timeline:** 1-2 tuần

---

## Cách Sử Dụng Tài liệu

### Bước 1: Đọc Overview
```
📄 BACKEND_COMPLETION_OVERVIEW.md
```
- Hiểu tổng quan scope
- Xác định priority
- Planning timeline

### Bước 2: Chọn Phase để implement
```
📁 docs/completion/
  ├── PHASE_1_SUBSCRIPTION_SYSTEM.md     ← Bắt đầu từ đây
  ├── PHASE_2_EXPERT_WORKFLOW.md         ← Tiếp theo
  └── ... (sẽ có thêm)
```

### Bước 3: Follow Phase document
Mỗi phase document có cấu trúc:

1. **Tổng quan**
   - Mục tiêu
   - Timeline
   - Dependencies

2. **Implementation chi tiết**
   - Controller code
   - Service logic
   - Repository patterns
   - Middleware
   - Jobs/Workers

3. **Testing**
   - Unit tests
   - Integration tests
   - E2E scenarios

4. **Checklist**
   - Implementation tasks
   - Testing tasks
   - Documentation tasks
   - Production readiness

### Bước 4: Verify hoàn thành
✅ Checklist items tất cả đã complete  
✅ Tests pass (≥85% coverage)  
✅ Code review done  
✅ Documentation updated  
✅ Production deployment successful

---

## Code Standards

Tất cả code trong tài liệu tuân thủ:

### 1. Architecture Patterns
```
Controller → Service → Repository/Adapter
```
- **Controller:** Nhận request, validate, gọi service
- **Service:** Business logic, orchestration
- **Repository:** Database access (Mongoose)
- **Adapter:** External services (LLM, Email, Storage, Payment)

### 2. Error Handling
```javascript
// Standard error response
{
  "code": "ErrorCode",
  "message": "Human readable message",
  "details": { /* optional */ }
}
```

### 3. Pagination
```javascript
// Standard pagination response
{
  "items": [...],
  "meta": {
    "page": 1,
    "pageSize": 20,
    "total": 100,
    "totalPages": 5
  }
}
```

### 4. Mongoose Patterns
```javascript
// Always use timestamps
Schema.set('timestamps', true);

// Define indexes
Schema.index({ userId: 1, createdAt: -1 });

// Enums in schema
status: { type: String, enum: ['Active', 'Inactive'] }
```

### 5. Testing Patterns
```javascript
// Unit test
describe('ServiceName', () => {
  describe('methodName', () => {
    it('should do something', async () => {
      // Arrange
      // Act
      // Assert
    });
  });
});

// Integration test
describe('API Endpoint', () => {
  it('should return expected response', async () => {
    const res = await request(app)
      .post('/api/v1/endpoint')
      .set('Authorization', `Bearer ${token}`)
      .send(payload)
      .expect(200);
    
    expect(res.body).toMatchObject(expected);
  });
});
```

---

## Quan trọng: Những điều KHÔNG NÊN làm

### ❌ KHÔNG:
1. **Copy-paste code mà không hiểu**
   - Đọc kỹ comment
   - Hiểu business logic
   - Test thoroughly

2. **Bỏ qua tests**
   - Mỗi feature MỚI phải có tests
   - Minimum coverage: 85%
   - Tests phải pass trước khi merge

3. **Thay đổi API contract**
   - Tất cả API phải match `learinal-openapi.yaml`
   - Nếu cần thay đổi, update OpenAPI spec trước

4. **Hard-code values**
   - Dùng config/env variables
   - Commission rates, limits, prices đều configurable

5. **Ignore error handling**
   - Mọi external call phải có try-catch
   - Retry logic cho transient errors
   - Proper logging

### ✅ NÊN:
1. **Follow DIP (Dependency Inversion Principle)**
   ```javascript
   // Good
   class Service {
     constructor({ repository, adapter }) {
       this.repo = repository;
       this.adapter = adapter;
     }
   }
   ```

2. **Use proper logging**
   ```javascript
   logger.info({ userId, action }, 'User action completed');
   logger.error({ error: err.message }, 'Failed to process');
   ```

3. **Validate input**
   ```javascript
   // Use Joi/Zod schemas
   const schema = Joi.object({
     field: Joi.string().required(),
   });
   ```

4. **Handle edge cases**
   - Empty results
   - Concurrent updates
   - Race conditions
   - Expired tokens

---

## Timeline & Resource Planning

### Recommended Team Structure

**Option 1: Sequential (1 dev)**
- Week 1-3: Phase 1 (Subscriptions)
- Week 4-5: Phase 2 (Expert Workflow)
- Week 6-7: Phase 3 (Content Processing)
- Week 8-9: Phase 4 (Admin)
- Week 10-12: Phase 5 (Testing & QA)

**Option 2: Parallel (2 devs)**
- Dev A: Phase 1 + Phase 3 (4-5 tuần)
- Dev B: Phase 2 + Phase 4 (3-4 tuần)
- Both: Phase 5 (2 tuần)

**Option 3: Parallel (3 devs)**
- Dev A: Phase 1 (2-3 tuần)
- Dev B: Phase 2 (2 tuần)
- Dev C: Phase 3 + Phase 4 (3-4 tuần)
- All: Phase 5 (1-2 tuần)

### Milestones

**Milestone 1: Basic Monetization (End of Week 3)**
- ✅ Subscription system working
- ✅ Users can subscribe
- ✅ Entitlements enforced
- ✅ Payment integration complete

**Milestone 2: Expert Network (End of Week 5)**
- ✅ Validation workflow complete
- ✅ Commission calculation working
- ✅ Expert can review and earn

**Milestone 3: Content Quality (End of Week 7)**
- ✅ Document processing pipeline
- ✅ Multi-level questions
- ✅ Quality summaries

**Milestone 4: Production Ready (End of Week 12)**
- ✅ All tests passing
- ✅ Documentation complete
- ✅ Monitoring setup
- ✅ Ready for launch

---

## Support & Questions

### Tham khảo các file hiện có:
1. `.github/instructions/instruction_learinal_backend.instructions.md` - Backend coding standards
2. `docs/api/learinal-openapi.yaml` - API contract
3. `docs/mongodb-schema.md` - Database schema
4. `docs/SRS for Learinal.md` - Requirements
5. `docs/SDD_Learinal.md` - System design

### Khi gặp vấn đề:
1. Kiểm tra existing code patterns
2. Đọc kỹ comments trong phase docs
3. Tham khảo test examples
4. Review OpenAPI spec

---

## Quick Start Checklist

- [ ] Đọc `BACKEND_COMPLETION_OVERVIEW.md`
- [ ] Đánh giá timeline và resources
- [ ] Setup local development environment
- [ ] Review existing codebase structure
- [ ] Quyết định implementation order
- [ ] Bắt đầu với `PHASE_1_SUBSCRIPTION_SYSTEM.md`
- [ ] Follow checklist trong mỗi phase
- [ ] Write tests as you go
- [ ] Update documentation
- [ ] Deploy to staging
- [ ] Production launch 🚀

---

## Lưu ý cuối cùng

**Mục tiêu:**
Chuyển Learinal từ MVP sang production-ready platform với đầy đủ tính năng theo SRS.

**Không phải:**
- Làm tất cả cùng lúc
- Rush mà bỏ qua quality
- Implement features không trong SRS

**Thành công khi:**
- ✅ Tất cả SRS features implemented
- ✅ Test coverage ≥ 85%
- ✅ Production uptime ≥ 99.5%
- ✅ Users can subscribe và sử dụng platform
- ✅ Experts được trả commission đúng hạn
- ✅ Admin có đầy đủ tools để manage

---

**Good luck! 🚀**

Mọi thắc mắc, tham khảo phase documents hoặc existing codebase patterns.
