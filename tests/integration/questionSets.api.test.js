const request = require("supertest");
const app = require("../../src/app");
const { connectTestDB, closeTestDB, clearTestDB } = require("../helpers/db");
const { createTestUser, createTestSubject } = require("../helpers/factories");
const { authHeader } = require("../helpers/auth");

describe("Question Sets API Integration Tests", () => {
  let user;
  let authHeaders;
  let subject;

  beforeAll(async () => {
    await connectTestDB();
  });

  afterAll(async () => {
    await closeTestDB();
  });

  beforeEach(async () => {
    await clearTestDB();
    user = await createTestUser({ email: "questionset-test@example.com" });
    authHeaders = authHeader({
      userId: user._id.toString(),
      role: user.role,
      email: user.email,
    });
    subject = await createTestSubject(user._id, { subjectName: "Test Subject" });
  });

  describe("POST /api/v1/question-sets/generate", () => {
    it("should enqueue question generation and return 202", async () => {
      // Mock LLM configuration
      process.env.LLM_MODE = "real";
      process.env.GEMINI_API_KEY = "test-key";

      const requestData = {
        subjectId: subject._id.toString(),
        title: "Sample Question Set",
        numQuestions: 10,
        difficulty: "Understand",
      };

      const response = await request(app)
        .post("/api/v1/question-sets/generate")
        .set(authHeaders)
        .send(requestData)
        .expect(202);

      expect(response.body).toHaveProperty("id");
      expect(response.body).toMatchObject({
        title: "Sample Question Set",
        status: "Pending",
        userId: user._id.toString(),
        subjectId: subject._id.toString(),
      });
      expect(response.body.message).toMatch(/generation started/i);
    });

    it("should validate numQuestions range", async () => {
      process.env.LLM_MODE = "real";
      process.env.GEMINI_API_KEY = "test-key";

      const response = await request(app)
        .post("/api/v1/question-sets/generate")
        .set(authHeaders)
        .send({
          subjectId: subject._id.toString(),
          title: "Test",
          numQuestions: 150, // Exceeds max
        })
        .expect(400);

      expect(response.body.code).toBe("ValidationError");
      expect(response.body.message).toMatch(/numQuestions/i);
    });

    it("should validate difficultyDistribution total", async () => {
      process.env.LLM_MODE = "real";
      process.env.GEMINI_API_KEY = "test-key";

      const response = await request(app)
        .post("/api/v1/question-sets/generate")
        .set(authHeaders)
        .send({
          subjectId: subject._id.toString(),
          title: "Test",
          difficultyDistribution: {
            Remember: 50,
            Understand: 60, // Total 110, exceeds max 100
          },
        })
        .expect(400);

      expect(response.body.code).toBe("ValidationError");
      expect(response.body.message).toMatch(/difficultyDistribution/i);
    });

    it("should return 503 if LLM not configured", async () => {
      process.env.LLM_MODE = "mock";
      delete process.env.GEMINI_API_KEY;

      const response = await request(app)
        .post("/api/v1/question-sets/generate")
        .set(authHeaders)
        .send({
          subjectId: subject._id.toString(),
          title: "Test",
          numQuestions: 10,
        })
        .expect(503);

      expect(response.body.code).toBe("ServiceUnavailable");
    });

    it("should return 400 if required fields missing", async () => {
      const response = await request(app)
        .post("/api/v1/question-sets/generate")
        .set(authHeaders)
        .send({
          numQuestions: 10,
        })
        .expect(400);

      expect(response.body.code).toBe("ValidationError");
      expect(response.body.message).toMatch(/subjectId.*title/i);
    });

    it("should return 401 if not authenticated", async () => {
      const response = await request(app)
        .post("/api/v1/question-sets/generate")
        .send({
          subjectId: subject._id.toString(),
          title: "Test",
        })
        .expect(401);

      expect(response.body.code).toBe("AuthenticationError");
    });
  });

  describe("GET /api/v1/question-sets", () => {
    it("should return user's question sets with pagination", async () => {
      const QuestionSet = require("../../src/models/questionSet.model");
      
      // Create test question sets
      await QuestionSet.create({
        userId: user._id,
        subjectId: subject._id,
        title: "Set 1",
        status: "Draft",
        isShared: false,
        questions: [],
      });
      await QuestionSet.create({
        userId: user._id,
        subjectId: subject._id,
        title: "Set 2",
        status: "Published",
        isShared: true,
        questions: [],
      });

      const response = await request(app)
        .get("/api/v1/question-sets")
        .set(authHeaders)
        .query({ page: 1, pageSize: 10 })
        .expect(200);

      expect(response.body.items).toHaveLength(2);
      expect(response.body.meta).toMatchObject({
        page: 1,
        pageSize: 10,
        total: 2,
      });
    });

    it("should not return other users' question sets", async () => {
      const QuestionSet = require("../../src/models/questionSet.model");
      const otherUser = await createTestUser({ email: "other@example.com" });

      await QuestionSet.create({
        userId: user._id,
        subjectId: subject._id,
        title: "My Set",
        status: "Draft",
        isShared: false,
        questions: [],
      });
      await QuestionSet.create({
        userId: otherUser._id,
        subjectId: subject._id,
        title: "Other Set",
        status: "Draft",
        isShared: false,
        questions: [],
      });

      const response = await request(app)
        .get("/api/v1/question-sets")
        .set(authHeaders)
        .expect(200);

      expect(response.body.items).toHaveLength(1);
      expect(response.body.items[0].title).toBe("My Set");
    });
  });

  describe("GET /api/v1/question-sets/:id", () => {
    it("should return question set by id", async () => {
      const QuestionSet = require("../../src/models/questionSet.model");
      const questionSet = await QuestionSet.create({
        userId: user._id,
        subjectId: subject._id,
        title: "Test Set",
        status: "Draft",
        isShared: false,
        questions: [
          {
            questionId: "q1",
            questionText: "What is 2+2?",
            options: ["3", "4", "5", "6"],
            correctAnswerIndex: 1,
            difficultyLevel: "Remember",
          },
        ],
      });

      const response = await request(app)
        .get(`/api/v1/question-sets/${questionSet._id}`)
        .set(authHeaders)
        .expect(200);

      expect(response.body).toMatchObject({
        id: questionSet._id.toString(),
        title: "Test Set",
        status: "Draft",
      });
      expect(response.body.questions).toHaveLength(1);
    });

    it("should return 404 if question set not found", async () => {
      const response = await request(app)
        .get("/api/v1/question-sets/507f1f77bcf86cd799439011")
        .set(authHeaders)
        .expect(404);

      expect(response.body.code).toBe("NotFound");
    });

    it("should return 404 if accessing other user's question set", async () => {
      const QuestionSet = require("../../src/models/questionSet.model");
      const otherUser = await createTestUser({ email: "other@example.com" });
      const questionSet = await QuestionSet.create({
        userId: otherUser._id,
        subjectId: subject._id,
        title: "Other Set",
        status: "Draft",
        isShared: false,
        questions: [],
      });

      const response = await request(app)
        .get(`/api/v1/question-sets/${questionSet._id}`)
        .set(authHeaders)
        .expect(404);

      expect(response.body.code).toBe("NotFound");
    });
  });

  describe("PATCH /api/v1/question-sets/:id", () => {
    it("should update question set", async () => {
      const QuestionSet = require("../../src/models/questionSet.model");
      const questionSet = await QuestionSet.create({
        userId: user._id,
        subjectId: subject._id,
        title: "Original Title",
        status: "Draft",
        isShared: false,
        questions: [],
      });

      const response = await request(app)
        .patch(`/api/v1/question-sets/${questionSet._id}`)
        .set(authHeaders)
        .send({
          title: "Updated Title",
          status: "Published",
        })
        .expect(200);

      expect(response.body).toMatchObject({
        id: questionSet._id.toString(),
        title: "Updated Title",
        status: "Published",
      });
    });

    it("should return 404 if updating other user's question set", async () => {
      const QuestionSet = require("../../src/models/questionSet.model");
      const otherUser = await createTestUser({ email: "other@example.com" });
      const questionSet = await QuestionSet.create({
        userId: otherUser._id,
        subjectId: subject._id,
        title: "Other Set",
        status: "Draft",
        isShared: false,
        questions: [],
      });

      const response = await request(app)
        .patch(`/api/v1/question-sets/${questionSet._id}`)
        .set(authHeaders)
        .send({ title: "Hacked" })
        .expect(404);

      expect(response.body.code).toBe("NotFound");
    });
  });
});
