const request = require("supertest");
const app = require("../../src/app");
const { connectTestDB, closeTestDB, clearTestDB } = require("../helpers/db");
const { createTestUser, createTestSubject } = require("../helpers/factories");
const { authHeader } = require("../helpers/auth");

describe("Subjects API Integration Tests", () => {
  let user;
  let authHeaders;

  beforeAll(async () => {
    await connectTestDB();
  });

  afterAll(async () => {
    await closeTestDB();
  });

  beforeEach(async () => {
    await clearTestDB();
    user = await createTestUser({ email: "subject-test@example.com" });
    authHeaders = authHeader({
      userId: user._id.toString(),
      role: user.role,
      email: user.email,
    });
  });

  describe("POST /api/v1/subjects", () => {
    it("should create new subject with valid data", async () => {
      const subjectData = {
        subjectName: "Mathematics",
        description: "Advanced mathematics course",
      };

      const response = await request(app)
        .post("/api/v1/subjects")
        .set(authHeaders)
        .send(subjectData)
        .expect(201);

      expect(response.body).toMatchObject({
        subjectName: "Mathematics",
        description: "Advanced mathematics course",
      });
      expect(response.body).toHaveProperty("id");
      expect(response.body).toHaveProperty("createdAt");
    });

    it("should return 400 if subjectName is missing", async () => {
      const response = await request(app)
        .post("/api/v1/subjects")
        .set(authHeaders)
        .send({ description: "No name" })
        .expect(400);

      expect(response.body.code).toBe("ValidationError");
      expect(response.body.message).toMatch(/subjectName.*required/i);
    });

    it("should return 401 if not authenticated", async () => {
      const response = await request(app)
        .post("/api/v1/subjects")
        .send({ subjectName: "Test" })
        .expect(401);

      expect(response.body.code).toBe("AuthenticationError");
    });
  });

  describe("GET /api/v1/subjects", () => {
    it("should return user's subjects with pagination", async () => {
      // Create 3 subjects for user
      await createTestSubject(user._id, { subjectName: "Subject 1" });
      await createTestSubject(user._id, { subjectName: "Subject 2" });
      await createTestSubject(user._id, { subjectName: "Subject 3" });

      const response = await request(app)
        .get("/api/v1/subjects")
        .set(authHeaders)
        .query({ page: 1, pageSize: 2 })
        .expect(200);

      expect(response.body.items).toHaveLength(2);
      expect(response.body.meta).toMatchObject({
        page: 1,
        pageSize: 2,
        totalItems: 3,
        totalPages: 2,
      });
    });

    it("should not return other users' subjects", async () => {
      const otherUser = await createTestUser({ email: "other@example.com" });
      await createTestSubject(user._id, { subjectName: "My Subject" });
      await createTestSubject(otherUser._id, { subjectName: "Other Subject" });

      const response = await request(app).get("/api/v1/subjects").set(authHeaders).expect(200);

      expect(response.body.items).toHaveLength(1);
      expect(response.body.items[0].subjectName).toBe("My Subject");
    });

    it("should support sorting by createdAt descending", async () => {
      const subject1 = await createTestSubject(user._id, {
        subjectName: "First",
      });
      // Wait a bit to ensure different timestamps
      await new Promise((resolve) => setTimeout(resolve, 10));
      const subject2 = await createTestSubject(user._id, {
        subjectName: "Second",
      });

      const response = await request(app)
        .get("/api/v1/subjects")
        .set(authHeaders)
        .query({ sort: "-createdAt" })
        .expect(200);

      expect(response.body.items[0].id).toBe(subject2._id.toString());
      expect(response.body.items[1].id).toBe(subject1._id.toString());
    });
  });

  describe("GET /api/v1/subjects/:id", () => {
    it("should return subject details for owner", async () => {
      const subject = await createTestSubject(user._id, {
        subjectName: "Test Subject",
        description: "Test description",
      });

      const response = await request(app)
        .get(`/api/v1/subjects/${subject._id}`)
        .set(authHeaders)
        .expect(200);

      expect(response.body).toMatchObject({
        id: subject._id.toString(),
        subjectName: "Test Subject",
        description: "Test description",
      });
    });

    it("should return 404 if subject does not exist", async () => {
      const nonExistentId = "507f1f77bcf86cd799439099";

      const response = await request(app)
        .get(`/api/v1/subjects/${nonExistentId}`)
        .set(authHeaders)
        .expect(404);

      expect(response.body.code).toBe("NotFoundError");
    });

    it("should return 403 if user is not the owner", async () => {
      const otherUser = await createTestUser({ email: "other@example.com" });
      const subject = await createTestSubject(otherUser._id, {
        subjectName: "Other's Subject",
      });

      const response = await request(app)
        .get(`/api/v1/subjects/${subject._id}`)
        .set(authHeaders)
        .expect(403);

      expect(response.body.code).toBe("ForbiddenError");
    });
  });

  describe("PATCH /api/v1/subjects/:id", () => {
    it("should update subject for owner", async () => {
      const subject = await createTestSubject(user._id, {
        subjectName: "Original Name",
        description: "Original description",
      });

      const response = await request(app)
        .patch(`/api/v1/subjects/${subject._id}`)
        .set(authHeaders)
        .send({
          subjectName: "Updated Name",
          description: "Updated description",
        })
        .expect(200);

      expect(response.body).toMatchObject({
        id: subject._id.toString(),
        subjectName: "Updated Name",
        description: "Updated description",
      });
    });

    it("should return 403 if user is not the owner", async () => {
      const otherUser = await createTestUser({ email: "other@example.com" });
      const subject = await createTestSubject(otherUser._id);

      const response = await request(app)
        .patch(`/api/v1/subjects/${subject._id}`)
        .set(authHeaders)
        .send({ subjectName: "Hacked" })
        .expect(403);

      expect(response.body.code).toBe("ForbiddenError");
    });
  });

  describe("DELETE /api/v1/subjects/:id", () => {
    it("should delete subject for owner", async () => {
      const subject = await createTestSubject(user._id);

      await request(app).delete(`/api/v1/subjects/${subject._id}`).set(authHeaders).expect(204);

      // Verify subject is deleted
      const _response = await request(app)
        .get(`/api/v1/subjects/${subject._id}`)
        .set(authHeaders)
        .expect(404);
    });

    it("should delete subject and all related documents", async () => {
      const { Document } = require("../../src/models");
      const subject = await createTestSubject(user._id, { subjectName: "Test Subject" });

      // Create some documents for this subject
      const doc1 = await Document.create({
        subjectId: subject._id,
        ownerId: user._id,
        originalFileName: "test1.pdf",
        fileType: ".pdf",
        fileSize: 1,
        storagePath: "/tmp/test1.pdf",
        status: "Completed",
        uploadedAt: new Date(),
      });

      const doc2 = await Document.create({
        subjectId: subject._id,
        ownerId: user._id,
        originalFileName: "test2.pdf",
        fileType: ".pdf",
        fileSize: 1,
        storagePath: "/tmp/test2.pdf",
        status: "Completed",
        uploadedAt: new Date(),
      });

      // Delete subject
      await request(app).delete(`/api/v1/subjects/${subject._id}`).set(authHeaders).expect(204);

      // Verify documents are also deleted
      const remainingDocs = await Document.find({ subjectId: subject._id });
      expect(remainingDocs).toHaveLength(0);
    });

    it("should return 403 if user is not the owner", async () => {
      const otherUser = await createTestUser({ email: "other@example.com" });
      const subject = await createTestSubject(otherUser._id);

      const response = await request(app)
        .delete(`/api/v1/subjects/${subject._id}`)
        .set(authHeaders)
        .expect(403);

      expect(response.body.code).toBe("ForbiddenError");
    });
  });
});
