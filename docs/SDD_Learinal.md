# Tài liệu Thiết kế Hệ thống (SDD) – Learinal

Phiên bản: 0.2 • Cập nhật: 2025-11-27

Tài liệu này được biên soạn dựa trên "SRS for Learinal.md" và mã nguồn thực tế của dự án. Tất cả sơ đồ nằm trong file PlantUML duy nhất: `docs/report/diagrams/learinal-diagrams.puml`.

Lưu ý: Phiên bản 0.2 hướng đến sản phẩm Web (không có mobile app native), tập trung vào các chức năng cốt lõi cho Người học, Chuyên gia và Quản trị viên như mô tả trong SRS.

---

## 3. Kiến trúc tổng thể

### 3.1 Ngữ cảnh của hệ thống

#### 3.1.1. Sơ đồ ngữ cảnh hệ thống

> **Hình 3.1**: Sơ đồ ngữ cảnh hệ thống Learinal (C4 Context Diagram)
> *Xem sơ đồ `@startuml context-diagram` trong file `docs/report/diagrams/learinal-diagrams.puml`*

- Mô tả tóm tắt:
  - Hệ thống Learinal phục vụ 3 nhóm người dùng: Người học (Learner), Chuyên gia (Expert) và Quản trị viên (Admin).
  - Các hệ thống ngoài: Google Gemini API (LLM), Email Service (SendGrid/SES), Object Storage (AWS S3), Identity Provider (Google OAuth 2.0), và Cổng Thanh toán (SePay).

#### 3.1.2. Phụ thuộc ngoài (External Dependencies)

| Tên | Mục đích | Loại giao diện | Có thể thay thế |
|------|----------|-----------------|------------------|
| Google Gemini API (@google/generative-ai 0.24.0) | Phân tích tài liệu, tạo tóm tắt, mục lục, sinh câu hỏi | REST/HTTPS, OAuth Key/Token | OpenAI, Claude, Vertex AI PaLM |
| Email Service (SendGrid/SES) | Gửi email hệ thống (xác thực, thông báo) | REST API hoặc SMTP/TLS | Mailgun, Postmark |
| Object Storage (AWS S3) | Lưu trữ tệp tài liệu và dữ liệu tạm | REST/HTTPS, SDK | GCS, Azure Blob |
| Identity Provider (Google OAuth 2.0) | Đăng nhập/SSO | OAuth 2.0 + OIDC | GitHub, Microsoft, Auth0 |
| Cổng Thanh toán (SePay) | Thanh toán gói dịch vụ | REST/HTTPS + Webhook | VNPay, MoMo, Stripe |
| Redis (ioredis 5.4.2) | Message Queue, Caching | TCP | RabbitMQ, AWS SQS |
| BullMQ (5.20.1) | Job Queue Processing | Redis-based | Agenda, Bee-Queue |

#### 3.1.3. Giả định và Ràng buộc thiết kế

- **Ràng buộc công nghệ:**
  - **Frontend:** Web App React 19.1.1, TailwindCSS 3.4.18, Vite 7.1.14
  - **Backend:** Node.js ≥18, Express 5.1.0, Mongoose 8.19.2
  - **Database:** MongoDB 6.20.0
  - **Message Queue:** Redis 4.6.14 + BullMQ 5.20.1
  - **Real-time:** Socket.io 4.8.1
  - **Authentication:** JWT (jose 5.9.6) + Google OAuth 2.0
  
- **Ràng buộc bảo mật:**
  - Toàn bộ API qua HTTPS
  - JWT access token + refresh token rotation
  - Password hashing với bcrypt
  - Helmet middleware cho security headers
  - Rate limiting với express-rate-limit
  
- **Ràng buộc triển khai:**
  - Docker containerization
  - CI/CD tối thiểu
  - Environment variables cho secrets
  
- **Ràng buộc giao diện:**
  - Responsive design (desktop + tablet + mobile)
  - Dark mode support
  
- **Ràng buộc khả dụng/Hiệu năng:**
  - Processing nặng (LLM) thực hiện bất đồng bộ qua job queue
  - Background Worker riêng biệt cho xử lý tác vụ nền
  
- **Giả định:**
  - Quy mô ban đầu: lượng tải trung bình, thời gian phản hồi chấp nhận được cho các tác vụ đồng bộ (< 500ms), tác vụ LLM không chặn luồng chính
  - Độ tin cậy dịch vụ ngoài ≥ 99.5%
  - Người dùng có kết nối Internet ổn định khi sử dụng

### 3.2 Container Diagram

> **Hình 3.2**: Sơ đồ Container - Hệ thống Learinal (C4 Container Diagram)
> *Xem sơ đồ `@startuml container-diagram` trong file `docs/report/diagrams/learinal-diagrams.puml`*

- Các container chính và vai trò:
  1. **Web Application (React)**
     - Vai trò: Giao diện người dùng cho Learner/Expert/Admin.
     - Công nghệ: React 19.1.1, TailwindCSS 3.4.18, Vite 7.1.14, React Router 7.9.5, Axios 1.13.1, Chart.js 4.5.1.
     - Giao tiếp với API qua HTTPS/JSON, hỗ trợ OAuth (PKCE) khi đăng nhập.
     
  2. **API Backend (Node.js – Express)**
     - Vai trò: Xử lý nghiệp vụ, bảo vệ tài nguyên, cung cấp REST API.
     - Công nghệ: Node.js ≥18, Express 5.1.0, Mongoose 8.19.2, jose 5.9.6, Socket.io 4.8.1.
     - Kết nối: MongoDB; gọi LLM, Email, Object Storage, IdP; phát sự kiện lên hàng đợi.
     
  3. **Background Worker (Node.js + BullMQ)**
     - Vai trò: Xử lý bất đồng bộ: trích xuất văn bản, tóm tắt, sinh câu hỏi, gửi email hàng loạt.
     - Kích hoạt: Tiêu thụ sự kiện từ Redis Queue.
     
  4. **Database (MongoDB)**
     - Vai trò: Lưu dữ liệu người dùng, tài liệu, bộ câu hỏi, bài làm, quy trình duyệt, đăng ký gói.
     - Công nghệ: MongoDB 6.20.0 với Mongoose ODM.
     
  5. **Message Queue (Redis + BullMQ)**
     - Vai trò: Kết dính các tác vụ nền (publish/subscribe sự kiện hệ thống), caching.
     - Công nghệ: Redis 4.6.14, BullMQ 5.20.1.

---

## 4. Thiết kế chi tiết

### 4.1 Component Diagram

> **Hình 4.1**: Sơ đồ Component - API Backend (C4 Component Diagram)
> *Xem sơ đồ `@startuml component-diagram` trong file `docs/report/diagrams/learinal-diagrams.puml`*

- Các component chính trong API Backend:

| Component                | Vai trò                                   | Giao diện                | Phụ thuộc                  |
| ------------------------ | ------------------------------------------ | ------------------------- | ---------------------------- |
| AuthController/Service   | Xác thực/ủy quyền, phiên đăng nhập | REST endpoints, JWT/OAuth | IdP, UserRepo                |
| UserController/Service   | Quản lý hồ sơ và quyền               | REST endpoints            | UserRepo                     |
| DocumentController/Service | Upload/parse tài liệu, tiền xử lý     | REST endpoints + jobs     | Storage, DocRepo, LLMAdapter |
| SubjectController/Service | Quản lý môn học, ToC, summary         | REST endpoints            | SubjectRepo, LLMAdapter      |
| QuestionSetController/Service | Sinh câu hỏi, quản lý bộ câu hỏi    | REST endpoints + jobs     | LLMAdapter, QSetRepo         |
| QuizAttemptController/Service | Làm bài thi, tính điểm              | REST endpoints            | AttemptRepo, CommissionService |
| ValidationController/Service | Quy trình phân công/duyệt của Expert  | REST endpoints + events   | ValidationRepo, MQ           |
| CommissionController/Service | Tính hoa hồng Expert (Hybrid model)  | REST endpoints            | CommissionRepo, ConfigService |
| NotificationService      | Gửi thông báo/email                     | REST events + Socket.io   | Email, MQ                    |
| LLMAdapter               | Bọc gọi Google Gemini API                | Internal call             | Gemini API                   |
| StorageAdapter           | Upload/download file S3                    | Internal call             | AWS S3 SDK                   |
| QueueAdapter             | Job queue với BullMQ                      | Internal call             | Redis, BullMQ                |
| Repositories             | Truy xuất dữ liệu                       | Internal DAO              | MongoDB/Mongoose             |

- Sự kiện tiêu biểu: `document.uploaded`, `doc.processed`, `review.assigned`, `review.completed`, `quiz.attempted`.

### 4.2 Mô hình dữ liệu (Database Design)

- CSDL: MongoDB (NoSQL) – linh hoạt cho tài liệu, câu hỏi sinh bởi LLM, tốc độ phát triển nhanh.

> **Hình 4.2**: Entity Relationship Diagram (ERD) - Cơ sở dữ liệu Learinal
> *Xem sơ đồ `@startuml erd-diagram` trong file `docs/report/diagrams/learinal-diagrams.puml`*

- Bảng/Collection trọng yếu: **users**, **subjects**, **documents**, **questionSets** (+ embedded Questions), **quizAttempts** (+ embedded UserAnswers), **validationRequests**, **commissionRecords**, **subscriptionPlans**, **userSubscriptions**, **notifications**.
- Xem chi tiết schema tại `docs/mongodb-schema.md`.

### 4.3 Thiết kế lớp

Mục tiêu của phần này là làm rõ cấu trúc lớp và luồng xử lý nghiệp vụ chính, cho thấy cách các thành phần hợp tác để đáp ứng yêu cầu SRS (tự động hóa phân tích tài liệu, sinh câu hỏi, và quy trình kiểm duyệt bởi Chuyên gia).

- Trọng tâm module: Question Generation & Review (Sinh bộ câu hỏi và Yêu cầu kiểm duyệt) – là giá trị cốt lõi của Learinal phiên bản 0.1.
- Phân lớp theo trách nhiệm: Boundary (Controller), Application Services (Service), Repositories (truy xuất dữ liệu), Domain (Entity/Value), Adapters (LLM/Email/Queue/Storage).
- Áp dụng SOLID và các pattern:
  - Repository Pattern: tách logic nghiệp vụ khỏi truy xuất dữ liệu (MongoDB).
  - Adapter Pattern: bọc dịch vụ ngoài (Gemini, Email, Storage, Queue) để thuận tiện thay thế (OpenAI/Mailgun/Cloudinary/RabbitMQ).
  - Dependency Inversion Principle (DIP): Controller/Service phụ thuộc vào Interface (IQuestionSetRepository, ILLMClient, …), giúp dễ test/mocking và hoán đổi cài đặt.
  - Optional: Strategy cho tính điểm theo độ khó, Factory/Builder cho dựng câu hỏi/đề.

#### 4.3.1 Class Diagram

> **Hình 4.3**: Sơ đồ lớp - Core Services
> *Xem sơ đồ `@startuml class-diagram` trong file `docs/report/diagrams/learinal-diagrams.puml`*

> **Hình 4.4**: Kiến trúc phân tầng - Learinal Backend
> *Xem sơ đồ `@startuml architecture-layers` trong file `docs/report/diagrams/learinal-diagrams.puml`*

- Các lớp chính theo module (tóm tắt trách nhiệm):
  - Controller (Boundary)
    - QuestionSetController: nhận request từ UI (tạo bộ đề, yêu cầu kiểm duyệt, lấy bộ đề), kiểm tra phiên đăng nhập qua AuthService, ủy quyền thao tác cho Service.
  - Application Services
    - AuthService (IAuthService): xác thực/ủy quyền dựa trên JWT/OAuth (IdP Google) – tuân thủ SRP (chỉ trách nhiệm authz/authn).
    - QuestionBankService (IQuestionBankService): sinh câu hỏi và tạo bộ đề; phối hợp LLMAdapter, DocumentRepository, QuestionSetRepository; xử lý mapping dữ liệu, chuẩn hóa độ khó, ràng buộc số lượng câu hỏi.
    - ReviewWorkflowService (IReviewWorkflowService): khởi tạo ValidationRequest, phát sự kiện `review.assigned` lên hàng đợi, gửi email thông báo tới Expert.
    - ContentService (IContentService): tóm tắt/mục lục (phụ trợ khi cần chất lượng ngữ cảnh cho prompt LLM).
  - Adapters
    - LLMAdapter (ILLMClient): đóng gói lời gọi Google Gemini API, quản lý prompt, parse kết quả, retries.
    - EmailAdapter (IEmailClient): gửi email qua SendGrid/SES.
    - StorageAdapter (IStorageClient): truy cập đối tượng tệp (S3/Cloudinary) khi cần.
    - MessageQueue (IEventBus): publish/subscribe các sự kiện (Redis Stream/RabbitMQ).
  - Repositories (MongoDB)
    - QuestionSetRepository (IQuestionSetRepository): lưu và truy vấn bộ đề.
    - DocumentRepository (IDocumentRepository): truy cập tài liệu đã tải lên.
    - ReviewRepository (IReviewRepository): lưu yêu cầu kiểm duyệt.
  - Domain
    - User, Document, Question, QuestionSet, ValidationRequest: phản ánh các thực thể trong ERD, giữ logic bất biến đơn giản (ví dụ: trạng thái hợp lệ của QuestionSet).

Lưu ý DIP: Tất cả “Service” phụ thuộc vào Interface thay vì cài đặt cụ thể của Adapter/Repository; có thể hoán đổi LLM (Gemini → OpenAI) mà không đổi service logic.

#### 4.3.2 Sequence Diagram

> **Hình 4.5**: Sequence Diagram - Sinh bộ đề từ tài liệu
> *Xem sơ đồ `@startuml sequence-generate-questions` trong file `docs/report/diagrams/learinal-diagrams.puml`*

> **Hình 4.6**: Sequence Diagram - Làm bài thi và tính điểm
> *Xem sơ đồ `@startuml sequence-quiz-attempt` trong file `docs/report/diagrams/learinal-diagrams.puml`*

> **Hình 4.7**: Sequence Diagram - Quy trình kiểm duyệt bộ đề
> *Xem sơ đồ `@startuml sequence-validation` trong file `docs/report/diagrams/learinal-diagrams.puml`*

- Kịch bản: Learner tạo bộ đề từ tài liệu và gửi yêu cầu kiểm duyệt.
  1) Learner gọi API tạo bộ đề với `documentId`, `topics[]`, `difficulty`, `numQuestions`.
  2) Controller xác thực token (AuthService), nạp Document; gọi QuestionBankService tạo bộ đề.
  3) QuestionBankService dựng prompt và gọi LLMAdapter sinh MCQs; lưu `QuestionSet` qua Repository và trả về `setId`.
  4) Learner yêu cầu kiểm duyệt: Controller gọi ReviewWorkflowService → tạo `ValidationRequest`, publish sự kiện `review.assigned` lên MQ và gửi email tới Expert.
  5) Expert Worker (độc lập) sẽ nhận sự kiện, cập nhật trạng thái và phản hồi về sau (ngoài phạm vi sơ đồ này).

Hợp đồng API mẫu – Create Question Set

- Input: `documentId`, `topics[]`, `difficulty`, `numQuestions`
- Output: `{ setId, status }`
- Lỗi: 400 (input không hợp lệ), 401/403 (chưa đăng nhập/không đủ quyền), 404 (documentId không tồn tại), 429 (rate limit), 502 (LLM upstream), 503 (queue full)

---

**Tham chiếu API chi tiết:**

- OpenAPI Specification: `Learinal-BE/docs/api/openapi-learinal-complete.yaml` (OpenAPI 3.1)
- API Paths theo module:
  - Authentication & Users: `openapi-paths-auth-users.yaml`
  - Subjects, Documents, Questions: `openapi-paths-subjects-docs-questions.yaml`
  - Quiz, Validation, Notifications: `openapi-paths-quiz-validation-notifications.yaml`
  - Admin, Payments: `openapi-paths-admin-payments-misc.yaml`
- Hướng dẫn backend: `Learinal-BE/docs/api/README-API-DOCS.md`
- Postman Collection: `Learinal-BE/Learinal-Complete.postman_collection.json`

---

## 5. Bảo mật & tuân thủ (Security & Compliance)

### 5.1 Authentication & Authorization
- **OAuth 2.0/OIDC** cho đăng nhập qua Google
- **JWT** với access token (15 phút) + refresh token (7 ngày)
- Refresh token rotation để phát hiện token bị đánh cắp
- Password hashing với **bcrypt** (cost factor 10)

### 5.2 Authorization
- Phân quyền theo vai trò (RBAC): Learner, Expert, Admin
- Middleware `requireAuth` và `requireRole` ở tầng API
- Resource-based access control cho tài liệu/bộ đề

### 5.3 Security Headers & Protection
- **Helmet.js** cho HTTP security headers
- **CORS** cấu hình cho frontend domain
- **Rate limiting** với express-rate-limit
- Input validation với **Joi**
- TLS/HTTPS mọi nơi

### 5.4 Data Protection
- Ràng buộc quyền truy cập tài liệu/bộ đề theo owner và trạng thái duyệt/xuất bản
- Quản lý secrets qua biến môi trường
- File upload validation (type, size, extension)

## 6. Khả năng vận hành (Operations)

### 6.1 Logging & Monitoring
- Logging có tương quan yêu cầu (request-id, user-id)
- Metric cơ bản: latency, rate, error, saturation
- Error tracking với **Sentry** (optional)

### 6.2 Background Job Processing
- **BullMQ** cho job queue
- Retry có exponential backoff
- Dead-letter queue cho lỗi không phục hồi
- Job types: `generate-questions`, `generate-summary`, `generate-toc`, `send-email`

### 6.3 Real-time Communication
- **Socket.io** cho thông báo real-time
- Events: `notification:new`, `questionSet:ready`, `validation:updated`

### 6.4 CI/CD
- Build, test, lint automation
- Docker containerization
- Environment-based configuration

---

## Phụ lục

### A. Danh sách Sơ đồ trong `docs/report/diagrams/learinal-diagrams.puml`

| Sơ đồ | Tên | Mô tả |
|--------|------|----------|
| `context-diagram` | Sơ đồ ngữ cảnh hệ thống | C4 Context - actors & external systems |
| `container-diagram` | Sơ đồ Container | C4 Container - web app, API, worker, DB, queue |
| `component-diagram` | Sơ đồ Component | C4 Component - controllers, services, adapters |
| `usecase-learner` | Use Case Người học | Các chức năng dành cho Learner |
| `usecase-expert` | Use Case Chuyên gia | Các chức năng dành cho Expert |
| `usecase-admin` | Use Case Quản trị viên | Các chức năng dành cho Admin |
| `sequence-generate-questions` | Sinh bộ đề | Luồng tạo bộ đề từ tài liệu |
| `sequence-quiz-attempt` | Làm bài thi | Luồng làm bài và tính điểm |
| `sequence-validation` | Kiểm duyệt | Luồng yêu cầu và kiểm duyệt bộ đề |
| `erd-diagram` | ERD | Entity Relationship Diagram - database |
| `architecture-layers` | Kiến trúc phân tầng | Layered Architecture diagram |
| `class-diagram` | Sơ đồ lớp | Core Services class diagram |

### B. Tài liệu tham khảo

- **SRS**: `docs/SRS for Learinal.md`
- **Database Schema**: `docs/mongodb-schema.md`
- **Commission Model**: `docs/COMMISSION_HYBRID_MODEL.md`
- **API Documentation**: `Learinal-BE/docs/api/`
- **Postman Collection**: `Learinal-BE/Learinal-Complete.postman_collection.json`

### C. Cách render PlantUML

**Online:**
```
https://www.plantuml.com/plantuml/uml/
```

**VS Code Extension:**
```
Name: PlantUML
Publisher: jebbs
```

**Command Line:**
```bash
java -jar plantuml.jar docs/report/diagrams/learinal-diagrams.puml
```
