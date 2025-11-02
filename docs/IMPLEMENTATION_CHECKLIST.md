# ✅ Implementation Checklist - Updated Nov 2025

**Timeline:** 6-8 weeks  
**Start Date:** ___________  
**Target Date:** ___________

---

## 🎯 Pre-Implementation (Week 0)

### Documentation Review
- [ ] Đọc `README_STATUS_UPDATE.md`
- [ ] Đọc `INFRASTRUCTURE_COMPLETE.md`
- [ ] Đọc `BACKEND_COMPLETION_SUMMARY.md`
- [ ] Review `PHASE_1_SUBSCRIPTION_SYSTEM.md`
- [ ] Review `PHASE_2_EXPERT_WORKFLOW.md`

### Environment Verification
- [ ] Verify Redis connection (`REDIS_URL`)
- [ ] Verify SendGrid API key (`SENDGRID_API_KEY`)
- [ ] Verify Gemini API key (`GEMINI_API_KEY`)
- [ ] Verify SePay credentials (`SEPAY_*`)
- [ ] Test worker process running (`node src/worker.js`)

### Infrastructure Testing
- [ ] Test document upload → auto-processing
- [ ] Test email verification flow
- [ ] Test payment webhook (manual transfer)
- [ ] Check worker logs (jobs completed)
- [ ] Verify database connections

---

## 📅 Week 1-2: Subscription Management API

### Models & Repositories ✅ (Already Done - Skip)
- [x] SubscriptionPlan model
- [x] UserSubscription model
- [x] Repositories created

### Payment Infrastructure ✅ (Already Done - Skip)
- [x] SePay webhook endpoint
- [x] Transaction reconciliation
- [x] Auto-activation logic
- [x] Signature verification

### NEW: API Layer (Need Implementation)

#### SubscriptionPlans Controller
- [ ] GET /subscription-plans (list active plans)
- [ ] POST /subscription-plans (Admin: create plan)
- [ ] GET /subscription-plans/:id (plan details)
- [ ] PATCH /subscription-plans/:id (Admin: update plan)
- [ ] DELETE /subscription-plans/:id (Admin: archive plan)

#### SubscriptionPlans Service
- [ ] listActivePlans()
- [ ] createPlan()
- [ ] getPlanById()
- [ ] updatePlan()
- [ ] archivePlan()

#### UserSubscriptions Controller
- [ ] GET /user-subscriptions/me (my subscriptions)
- [ ] POST /subscriptions (checkout/create)
- [ ] PATCH /user-subscriptions/:id/cancel

#### UserSubscriptions Service
- [ ] getUserSubscriptions()
- [ ] createSubscription()
- [ ] cancelSubscription()
- [ ] checkEntitlement()

#### Middleware
- [ ] checkSubscriptionLimit() - Quiz limit
- [ ] checkValidationRequestLimit()
- [ ] checkPriorityProcessing()

#### Background Jobs
- [ ] Expiration checker (daily cron)
- [ ] Renewal reminder (email 3 days before)
- [ ] Failed payment retry

#### Seed Data
- [ ] Create Standard plan (2000đ/month)
- [ ] Create Pro plan (5000đ/month)
- [ ] Migration script

#### Testing
- [ ] Unit tests: SubscriptionPlans service
- [ ] Unit tests: UserSubscriptions service
- [ ] Integration: Create subscription flow
- [ ] Integration: Cancel subscription flow
- [ ] Integration: Entitlement checks

---

## 📅 Week 3-4: Expert Workflow & Commission

### Email Infrastructure ✅ (Already Done - Skip)
- [x] SendGrid integration
- [x] EmailClient adapter
- [x] Verification template
- [x] Password reset template

### NEW: Validation Logic (Need Implementation)

#### Validation Request Endpoint
- [ ] Replace stub in questionSets.controller.js
- [ ] Add validation request logic
- [ ] Check subscription limits
- [ ] Prevent duplicate requests
- [ ] Create ValidationRequest record
- [ ] Publish event to queue

#### Expert Assignment Worker
- [ ] Replace NotImplemented in `review.assigned.js`
- [ ] Implement least-loaded strategy
- [ ] Find available experts
- [ ] Assign validation request
- [ ] Send assignment email to expert

#### Review Completion Worker
- [ ] Replace NotImplemented in `review.completed.js`
- [ ] Apply corrections to QuestionSet
- [ ] Update QuestionSet status
- [ ] Trigger commission calculation
- [ ] Send completion email to learner

#### Email Templates (SendGrid)
- [ ] Create "Validation Assigned" template
- [ ] Create "Validation Completed" template
- [ ] Create "Commission Earned" template
- [ ] Update `email.config.js` with template IDs

#### Commission System

##### CommissionRecords Controller
- [ ] GET /commission-records (Expert: my commissions)
- [ ] GET /admin/commission-records (Admin: all)
- [ ] PATCH /admin/commission-records/:id (mark Paid)

##### Commission Calculation
- [ ] Implement SRS formula 4.1.2
- [ ] Calculate NetPremiumRevenue_m
- [ ] Calculate PerAttemptUnit_m
- [ ] Apply Rate_Published vs Rate_Validated
- [ ] Handle time-based entitlement (T days)

##### Commission Service
- [ ] calculateCommission()
- [ ] createCommissionRecord()
- [ ] getExpertCommissions()
- [ ] markAsPaid()
- [ ] generateMonthlyReport()

#### Expert Dashboard
- [ ] GET /validation-requests?expertId=me&status=Assigned
- [ ] Expert statistics (pending/completed/revenue)
- [ ] Review queue management

#### Testing
- [ ] Unit tests: Expert assignment algorithm
- [ ] Unit tests: Commission calculation
- [ ] Integration: Full validation workflow
- [ ] Integration: Commission creation on review complete
- [ ] Email delivery verification

---

## 📅 Week 5: Multi-level Questions

### LLM Infrastructure ✅ (Already Done - Skip)
- [x] Google Gemini integration
- [x] LLMClient adapter
- [x] Question generation job

### NEW: Difficulty Logic (Need Enhancement)

#### Prompt Engineering
- [ ] Design prompts for Easy questions
- [ ] Design prompts for Medium questions
- [ ] Design prompts for Hard questions
- [ ] Add difficulty parameter to LLM call

#### Question Generation Job
- [ ] Update `questions.generate.js`
- [ ] Support difficulty parameter
- [ ] Generate mixed difficulty questions
- [ ] Validate question quality

#### QuestionSet Schema
- [ ] Add difficulty field to questions
- [ ] Update validation
- [ ] Migration script

#### Testing
- [ ] Generate Easy questions
- [ ] Generate Medium questions
- [ ] Generate Hard questions
- [ ] Verify difficulty distribution

---

## 📅 Week 6: Admin Features

### Admin Controllers
- [ ] GET /admin/users (list all users)
- [ ] PATCH /admin/users/:id (update user)
- [ ] DELETE /admin/users/:id (ban user)
- [ ] GET /admin/stats (system statistics)

### Content Moderation
- [ ] Flag inappropriate content
- [ ] Review flagged content
- [ ] Remove violations

### System Configuration
- [ ] Update system settings
- [ ] Feature flags
- [ ] Maintenance mode

### Testing
- [ ] Admin authentication
- [ ] User management flows
- [ ] Statistics accuracy

---

## 📅 Week 7-8: Testing & Deployment

### Unit Tests
- [ ] Controllers (target: 90% coverage)
- [ ] Services (target: 95% coverage)
- [ ] Middleware (target: 100% coverage)
- [ ] Workers (target: 90% coverage)

### Integration Tests
- [ ] Subscription flow (end-to-end)
- [ ] Validation workflow (end-to-end)
- [ ] Commission calculation (end-to-end)
- [ ] Payment webhook (end-to-end)

### Performance Tests
- [ ] Load testing (concurrent users)
- [ ] Queue performance (job throughput)
- [ ] Database query optimization
- [ ] API response times (<500ms p95)

### Security Tests
- [ ] Authentication bypass attempts
- [ ] Authorization checks
- [ ] Input validation
- [ ] SQL injection prevention
- [ ] XSS prevention

### Documentation
- [ ] API documentation updated
- [ ] README updated
- [ ] Environment variables documented
- [ ] Deployment guide created

### Deployment
- [ ] Staging deployment
- [ ] Smoke tests on staging
- [ ] Performance benchmarks
- [ ] Production deployment
- [ ] Monitoring setup

---

## ✅ Acceptance Criteria

### Technical
- [ ] All 501 NotImplemented replaced
- [ ] Test coverage ≥ 85%
- [ ] All stub modes → real mode
- [ ] Zero critical bugs
- [ ] Zero security vulnerabilities

### Business
- [ ] Users can subscribe (Standard/Pro)
- [ ] Payment processing 100% accurate
- [ ] Experts assigned within 5 mins
- [ ] Commission calculation 100% accurate
- [ ] Email notifications working

### Performance
- [ ] Uptime ≥ 99.5%
- [ ] Response time < 500ms (p95)
- [ ] Document processing < 2 mins
- [ ] Question generation < 30s
- [ ] Email delivery < 10s

### User Experience
- [ ] Subscription checkout smooth
- [ ] Validation request intuitive
- [ ] Expert dashboard functional
- [ ] Commission tracking clear
- [ ] Email notifications timely

---

## 📊 Progress Tracking

| Week | Phase | Planned | Completed | Status |
|------|-------|---------|-----------|--------|
| 0 | Setup | 15 | ___ | ⬜ |
| 1-2 | Subscription API | 25 | ___ | ⬜ |
| 3-4 | Expert Workflow | 30 | ___ | ⬜ |
| 5 | Multi-level Q | 8 | ___ | ⬜ |
| 6 | Admin Features | 10 | ___ | ⬜ |
| 7-8 | Testing | 20 | ___ | ⬜ |

**Total Tasks:** 108  
**Completed:** ___  
**Remaining:** ___  
**Progress:** ___%

---

## 🚨 Blockers & Issues

| Date | Issue | Impact | Status | Resolution |
|------|-------|--------|--------|------------|
| | | | | |
| | | | | |

---

## 📞 Sign-off

### Development Complete
- [ ] Backend Lead: _____________ Date: _______
- [ ] QA Lead: _____________ Date: _______

### Production Ready
- [ ] Tech Lead: _____________ Date: _______
- [ ] Product Manager: _____________ Date: _______

---

**Last Updated:** ___________  
**Next Review:** ___________
