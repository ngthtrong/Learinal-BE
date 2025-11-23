const request = require("supertest");
const app = require("../../src/app");
const { connectTestDB, closeTestDB, clearTestDB } = require("../helpers/db");
const { createTestUser } = require("../helpers/factories");
const { generateTestToken, generateTestRefreshToken } = require("../helpers/auth");
const oauthClient = require("../../src/adapters/oauthClient");

jest.mock("../../src/adapters/oauthClient");

describe("Auth API Integration Tests", () => {
  beforeAll(async () => {
    await connectTestDB();
  });

  afterAll(async () => {
    await closeTestDB();
  });

  beforeEach(async () => {
    await clearTestDB();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("POST /api/v1/auth/exchange", () => {
    it("should return 200 with tokens for valid OAuth code", async () => {
      const mockOAuthProfile = {
        id: "google-123",
        email: "oauth@example.com",
        name: "OAuth User",
        picture: "https://example.com/pic.jpg",
      };

      oauthClient.exchangeCodeForTokens.mockResolvedValue({
        access_token: "oauth-access-token",
      });
      oauthClient.getUserProfile.mockResolvedValue(mockOAuthProfile);

      const response = await request(app)
        .post("/api/v1/auth/exchange")
        .send({ code: "valid-oauth-code" })
        .expect(200);

      expect(response.body).toHaveProperty("accessToken");
      expect(response.body).toHaveProperty("refreshToken");
      expect(response.body.user).toMatchObject({
        email: "oauth@example.com",
        displayName: "OAuth User",
        role: "Learner",
      });
    });

    it("should return 400 if code is missing", async () => {
      const response = await request(app)
        .post("/api/v1/auth/exchange")
        .send({})
        .expect(400);

      expect(response.body).toHaveProperty("code");
      expect(response.body.message).toMatch(/code.*required/i);
    });

    it("should return 401 if OAuth exchange fails", async () => {
      oauthClient.exchangeCodeForTokens.mockRejectedValue(
        new Error("Invalid authorization code")
      );

      const response = await request(app)
        .post("/api/v1/auth/exchange")
        .send({ code: "invalid-code" })
        .expect(401);

      expect(response.body.code).toBe("AuthenticationError");
    });

    it("should activate existing user with PendingActivation status", async () => {
      const existingUser = await createTestUser({
        email: "pending@example.com",
        oauthProviderId: "google-pending",
        status: "PendingActivation",
      });

      const mockOAuthProfile = {
        id: "google-pending",
        email: "pending@example.com",
        name: "Pending User",
      };

      oauthClient.exchangeCodeForTokens.mockResolvedValue({
        access_token: "oauth-access-token",
      });
      oauthClient.getUserProfile.mockResolvedValue(mockOAuthProfile);

      const response = await request(app)
        .post("/api/v1/auth/exchange")
        .send({ code: "auth-code" })
        .expect(200);

      expect(response.body.user.id).toBe(existingUser._id.toString());
      expect(response.body.user.status).toBe("Active");
    });
  });

  describe("POST /api/v1/auth/refresh", () => {
    it("should return 200 with new access token for valid refresh token", async () => {
      const user = await createTestUser({ email: "refresh@example.com" });
      const refreshToken = generateTestRefreshToken({
        userId: user._id.toString(),
      });

      const response = await request(app)
        .post("/api/v1/auth/refresh")
        .send({ refreshToken })
        .expect(200);

      expect(response.body).toHaveProperty("accessToken");
      expect(response.body.accessToken).toBeTruthy();
    });

    it("should return 400 if refreshToken is missing", async () => {
      const response = await request(app)
        .post("/api/v1/auth/refresh")
        .send({})
        .expect(400);

      expect(response.body).toHaveProperty("code");
      expect(response.body.message).toMatch(/refreshToken.*required/i);
    });

    it("should return 401 for invalid refresh token", async () => {
      const response = await request(app)
        .post("/api/v1/auth/refresh")
        .send({ refreshToken: "invalid-token" })
        .expect(401);

      expect(response.body.code).toBe("AuthenticationError");
    });

    it("should return 401 for expired refresh token", async () => {
      const user = await createTestUser();
      const jwt = require("jsonwebtoken");
      const expiredToken = jwt.sign(
        { userId: user._id.toString(), type: "refresh" },
        process.env.JWT_REFRESH_SECRET,
        { expiresIn: "-1h" }
      );

      const response = await request(app)
        .post("/api/v1/auth/refresh")
        .send({ refreshToken: expiredToken })
        .expect(401);

      expect(response.body.code).toBe("AuthenticationError");
    });
  });

  describe("GET /api/v1/users/me (Protected Route)", () => {
    it("should return 200 with user data for authenticated request", async () => {
      const user = await createTestUser({
        email: "me@example.com",
        displayName: "Current User",
      });
      const token = generateTestToken({
        userId: user._id.toString(),
        role: user.role,
        email: user.email,
      });

      const response = await request(app)
        .get("/api/v1/users/me")
        .set("Authorization", `Bearer ${token}`)
        .expect(200);

      expect(response.body).toMatchObject({
        id: user._id.toString(),
        email: "me@example.com",
        displayName: "Current User",
      });
    });

    it("should return 401 if no token provided", async () => {
      const response = await request(app)
        .get("/api/v1/users/me")
        .expect(401);

      expect(response.body.code).toBe("AuthenticationError");
    });

    it("should return 401 for invalid token", async () => {
      const response = await request(app)
        .get("/api/v1/users/me")
        .set("Authorization", "Bearer invalid-token")
        .expect(401);

      expect(response.body.code).toBe("AuthenticationError");
    });
  });
});
