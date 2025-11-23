const AuthService = require("../../src/services/auth.service");
const UsersRepository = require("../../src/repositories/users.repository");
const oauthClient = require("../../src/adapters/oauthClient");
const jwt = require("jsonwebtoken");
const { connectTestDB, closeTestDB, clearTestDB } = require("../helpers/db");
const { createTestUser } = require("../helpers/factories");

jest.mock("../../src/adapters/oauthClient");

describe("AuthService", () => {
  let authService;
  let usersRepo;

  beforeAll(async () => {
    await connectTestDB();
  });

  afterAll(async () => {
    await closeTestDB();
  });

  beforeEach(async () => {
    await clearTestDB();
    usersRepo = new UsersRepository();
    authService = new AuthService(usersRepo);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("exchangeCodeForTokens", () => {
    it("should create new user and return tokens for first-time OAuth login", async () => {
      const mockOAuthProfile = {
        id: "google-123456",
        email: "newuser@example.com",
        name: "New User",
        picture: "https://example.com/avatar.jpg",
      };

      oauthClient.exchangeCodeForTokens.mockResolvedValue({
        access_token: "oauth-access-token",
      });
      oauthClient.getUserProfile.mockResolvedValue(mockOAuthProfile);

      const result = await authService.exchangeCodeForTokens("auth-code-123");

      expect(result).toHaveProperty("accessToken");
      expect(result).toHaveProperty("refreshToken");
      expect(result.user).toMatchObject({
        email: "newuser@example.com",
        displayName: "New User",
        role: "Learner",
        status: "PendingActivation",
      });

      // Verify user created in DB
      const user = await usersRepo.findByEmail("newuser@example.com");
      expect(user).toBeTruthy();
      expect(user.oauthProviderId).toBe("google-123456");
    });

    it("should return tokens for existing user", async () => {
      const existingUser = await createTestUser({
        email: "existing@example.com",
        oauthProviderId: "google-existing",
        status: "Active",
      });

      const mockOAuthProfile = {
        id: "google-existing",
        email: "existing@example.com",
        name: "Existing User",
        picture: "https://example.com/avatar.jpg",
      };

      oauthClient.exchangeCodeForTokens.mockResolvedValue({
        access_token: "oauth-access-token",
      });
      oauthClient.getUserProfile.mockResolvedValue(mockOAuthProfile);

      const result = await authService.exchangeCodeForTokens("auth-code-456");

      expect(result.user.id).toBe(existingUser._id.toString());
      expect(result.user.status).toBe("Active");
    });

    it("should throw error if OAuth exchange fails", async () => {
      oauthClient.exchangeCodeForTokens.mockRejectedValue(
        new Error("Invalid authorization code")
      );

      await expect(
        authService.exchangeCodeForTokens("invalid-code")
      ).rejects.toThrow("Invalid authorization code");
    });

    it("should generate valid JWT tokens", async () => {
      const mockOAuthProfile = {
        id: "google-test",
        email: "test@example.com",
        name: "Test User",
      };

      oauthClient.exchangeCodeForTokens.mockResolvedValue({
        access_token: "oauth-access-token",
      });
      oauthClient.getUserProfile.mockResolvedValue(mockOAuthProfile);

      const result = await authService.exchangeCodeForTokens("auth-code");

      // Verify access token
      const decodedAccess = jwt.verify(
        result.accessToken,
        process.env.JWT_SECRET
      );
      expect(decodedAccess).toHaveProperty("userId");
      expect(decodedAccess).toHaveProperty("role");
      expect(decodedAccess).toHaveProperty("email");

      // Verify refresh token
      const decodedRefresh = jwt.verify(
        result.refreshToken,
        process.env.JWT_REFRESH_SECRET
      );
      expect(decodedRefresh).toHaveProperty("userId");
      expect(decodedRefresh.type).toBe("refresh");
    });
  });

  describe("refreshAccessToken", () => {
    it("should generate new access token with valid refresh token", async () => {
      const user = await createTestUser({
        email: "refresh@example.com",
      });

      const refreshToken = jwt.sign(
        { userId: user._id.toString(), type: "refresh" },
        process.env.JWT_REFRESH_SECRET,
        { expiresIn: "7d" }
      );

      const result = await authService.refreshAccessToken(refreshToken);

      expect(result).toHaveProperty("accessToken");
      const decoded = jwt.verify(result.accessToken, process.env.JWT_SECRET);
      expect(decoded.userId).toBe(user._id.toString());
    });

    it("should throw error for invalid refresh token", async () => {
      await expect(
        authService.refreshAccessToken("invalid-token")
      ).rejects.toThrow();
    });

    it("should throw error for expired refresh token", async () => {
      const user = await createTestUser();

      const expiredToken = jwt.sign(
        { userId: user._id.toString(), type: "refresh" },
        process.env.JWT_REFRESH_SECRET,
        { expiresIn: "-1h" } // Already expired
      );

      await expect(
        authService.refreshAccessToken(expiredToken)
      ).rejects.toThrow();
    });

    it("should throw error if user not found", async () => {
      const nonExistentUserId = "507f1f77bcf86cd799439099";
      const refreshToken = jwt.sign(
        { userId: nonExistentUserId, type: "refresh" },
        process.env.JWT_REFRESH_SECRET,
        { expiresIn: "7d" }
      );

      await expect(
        authService.refreshAccessToken(refreshToken)
      ).rejects.toThrow();
    });
  });
});
