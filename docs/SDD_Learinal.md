# Tài liệu Thiết kế Hệ thống (SDD) – Learinal

Phiên bản: 0.1 • Cập nhật: 2025-10-23

Tài liệu này được biên soạn dựa trên “SRS for Learinal.docx.md” và cấu trúc/định dạng tham chiếu từ file mẫu “SDD_Part1.docx.md”. Tất cả sơ đồ nằm trong một file PlantUML duy nhất: `docs/learinal-architecture.puml` (gồm 3 sơ đồ: Context, Container, Component).

Lưu ý: Phiên bản 0.1 hướng đến sản phẩm Web (không có mobile app native), tập trung vào các chức năng cốt lõi cho Người học, Chuyên gia và Quản trị viên như mô tả trong SRS.

---

## 3. Kiến trúc tổng thể

### 3.1 Ngữ cảnh của hệ thống

#### 3.1.1. Sơ đồ ngữ cảnh hệ thống

- Xem sơ đồ “Context” trong `docs/learinal-architecture.puml`.
- Mô tả tóm tắt:
  - Hệ thống Learinal phục vụ 3 nhóm người dùng: Người học (Learner), Chuyên gia (Expert) và Quản trị viên (Admin).
  - Các hệ thống ngoài: LLM Provider (Google Gemini API), Email Service (SendGrid/SES), Object Storage (S3/Cloudinary), Identity Provider (Google OAuth 2.0), và Cổng Thanh toán (Stripe – TBC theo phạm vi).

#### 3.1.2. Phụ thuộc ngoài (External Dependencies)

* [ ] TênMục đíchLoại giao diệnCó thể thay thếGoogle Gemini APIPhân tích tài liệu, tạo tóm tắt, mục lục, sinh câu hỏiREST/HTTPS, OAuth Key/TokenOpenAI, Claude, Vertex AI PaLMEmail Service (SendGrid/SES)Gửi email hệ thống (xác thực, thông báo)REST API hoặc SMTP/TLSMailgun, PostmarkObject Storage (S3/Cloudinary)Lưu trữ tệp tài liệu và dữ liệu tạmREST/HTTPS, SDKGCS, Azure BlobIdentity Provider (Google OAuth)Đăng nhập/SSOOAuth 2.0 + OIDCGitHub, Microsoft, Auth0Cổng Thanh toán (SePay)Thanh toán gói dịch vụ (nếu kích hoạt)REST/HTTPS + WebhookPayPal, MoMo, VNPay

#### 3.1.3. Giả định và Ràng buộc thiết kế

- Ràng buộc
  - Công nghệ: Web App React; Backend Node.js (Express); CSDL MongoDB.
  - Bảo mật: Toàn bộ API qua HTTPS; JWT/OAuth; dữ liệu nhạy cảm mã hóa-at-rest theo nhà cung cấp.
  - Triển khai: Cloud hosting (TBC cụ thể – SRS gợi ý Vercel/Render). CI/CD tối thiểu.
  - Giao diện: Hỗ trợ giao diện responsive (desktop + mobile).
  - Khả dụng/Hiệu năng: Processing nặng (LLM) thực hiện bất đồng bộ qua hàng đợi.
- Giả định
  - Quy mô ban đầu: lượng tải trung bình, thời gian phản hồi chấp nhận được cho các tác vụ đồng bộ (< 1–2s), tác vụ LLM không chặn luồng chính.
  - Độ tin cậy dịch vụ ngoài ≥ 99.5%.
  - Người dùng có kết nối Internet ổn định khi sử dụng.

### 3.2 Container Diagram

- Xem sơ đồ “Container” trong `docs/learinal-architecture.puml`.
- Các container chính và vai trò:
  1. Web Application (React)
     - Vai trò: Giao diện người dùng cho Learner/Expert/Admin.
     - Công nghệ: React, TailwindCSS. Giao tiếp với API qua HTTPS/JSON, hỗ trợ OAuth (PKCE) khi đăng nhập.
  2. API Backend (Node.js – Express)
     - Vai trò: Xử lý nghiệp vụ, bảo vệ tài nguyên, cung cấp REST API.
     - Kết nối: MongoDB; gọi LLM, Email, Object Storage, IdP; phát sự kiện lên hàng đợi.
  3. Background Worker (Node.js + Queue)
     - Vai trò: Xử lý bất đồng bộ: trích xuất văn bản, tóm tắt, sinh câu hỏi, gửi email hàng loạt.
     - Kích hoạt: Tiêu thụ sự kiện từ Message Queue.
  4. Database (MongoDB)
     - Vai trò: Lưu dữ liệu người dùng, tài liệu, bộ câu hỏi, bài làm, quy trình duyệt, đăng ký gói.
  5. Message Queue (Redis)
     - Vai trò: Kết dính các tác vụ nền (publish/subscribe sự kiện hệ thống).

---

## 4. Thiết kế chi tiết

### 4.1 Component Diagram

- Xem sơ đồ “Component” trong `docs/learinal-architecture.puml`.
- Các component chính trong API Backend:

| Component                | Vai trò                                   | Giao diện                | Phụ thuộc                  |
| ------------------------ | ------------------------------------------ | ------------------------- | ---------------------------- |
| AuthService              | Xác thực/ủy quyền, phiên đăng nhập | REST endpoints, JWT/OAuth | IdP, UserRepo                |
| UserService              | Quản lý hồ sơ và quyền               | REST endpoints            | UserRepo                     |
| DocumentIngestionService | Upload/parse tài liệu, tiền xử lý     | REST endpoints + jobs     | Storage, DocRepo, LLMAdapter |
| ContentService           | Tạo ToC/Tóm tắt                         | REST endpoints + jobs     | LLMAdapter, DocRepo          |
| QuestionBankService      | Sinh câu hỏi, quản lý bộ câu hỏi    | REST endpoints + jobs     | LLMAdapter, QSetRepo         |
| ReviewWorkflowService    | Quy trình phân công/duyệt của Expert  | REST endpoints + events   | ReviewRepo, MQ               |
| NotificationService      | Gửi thông báo/email                     | REST events               | Email, MQ                    |
| LLMAdapter               | Bọc gọi Google Gemini API                | Internal call             | Gemini API                   |
| PaymentAdapter (TBC)     | Xử lý thanh toán gói                   | REST endpoints + webhook  | Stripe                       |
| Repositories             | Truy xuất dữ liệu                       | Internal DAO              | MongoDB                      |

- Sự kiện tiêu biểu: `document.uploaded`, `doc.processed`, `review.assigned`, `review.completed`, `quiz.attempted`.

### 4.2 Mô hình dữ liệu (Database Design)

- CSDL: MongoDB (NoSQL) – linh hoạt cho tài liệu, câu hỏi sinh bởi LLM, tốc độ phát triển nhanh.
- ERD: xem `ERD.puml` (đã có trong workspace) và tài liệu `docs/mongodb-schema.md`.
- Bảng/Collection trọng yếu: Users, Documents, Subjects, QuestionSets (+ embedded Questions), QuizAttempts (+ embedded UserAnswers), ValidationRequests, CommissionRecords, SubscriptionPlans, UserSubscriptions, Notifications.

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

- Sơ đồ lớp: xem `docs/learinal-class.puml`.
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

- Sơ đồ tuần tự: xem `docs/learinal-sequence.puml`.
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

Tham chiếu API chi tiết

- OpenAPI: `docs/api/learinal-openapi.yaml` (OpenAPI 3.1 – đầy đủ endpoint/schemas).
- Hướng dẫn backend: `docs/api/README.md` (quy ước, hạn mức, tích hợp dịch vụ ngoài).

---

## 5. Bảo mật & tuân thủ (tóm tắt)

- OAuth 2.0/OIDC cho đăng nhập; JWT access token + refresh token an toàn.
- Phân quyền theo vai trò (Learner/Expert/Admin) ở tầng API.
- TLS mọi nơi; quản lý secrets qua biến môi trường/secret manager.
- Ràng buộc quyền truy cập tài liệu/bộ đề theo owner và trạng thái duyệt/xuất bản.

## 6. Khả năng vận hành

- Logging có tương quan yêu cầu (request-id, user-id); metric cơ bản (latency, rate, error, saturation).
- Queue để tách tải LLM; retry có backoff; dead-letter queue cho lỗi không phục hồi.
- CI/CD: build, test, lint; triển khai môi trường staging trước production.

---

## Phụ lục

- Sơ đồ: `docs/learinal-architecture.puml` (3 biểu đồ: Context, Container, Component).
- ERD: `ERD.puml`.
- Mô tả schema: `docs/mongodb-schema.md`.
