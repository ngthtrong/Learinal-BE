const jwt = require("jsonwebtoken");
const { randomUUID } = require("crypto");
const bcrypt = require("bcryptjs");
const logger = require("../utils/logger");

class AuthService {
  constructor({ 
    oauthClient, 
    usersRepository, 
    refreshTokensRepository, 
    config 
  } = {}) {
    this.oauthClient = oauthClient;
    this.usersRepo = usersRepository;
    this.refreshRepo = refreshTokensRepository;
    this.config = config || {};
    
    // JWT config
    this.jwtSecret = this.config.jwtSecret || process.env.JWT_SECRET || "dev-secret";
    this.jwtRefreshSecret = this.config.jwtRefreshSecret || process.env.JWT_REFRESH_SECRET || "dev-refresh-secret";
    this.jwtExpiresIn = this.config.jwtExpiresIn || process.env.JWT_EXPIRES_IN || "1h";
    this.jwtRefreshExpiresIn = this.config.jwtRefreshExpiresIn || process.env.JWT_REFRESH_EXPIRES_IN || "7d";
  }

  /**
   * Parse JWT expiry string to seconds
   */
  parseExpiryToSeconds(expiresIn) {
    if (typeof expiresIn === "number") return expiresIn;
    const match = expiresIn.match(/^(\d+)([smhd])$/);
    if (!match) return 3600; // default 1h
    const value = parseInt(match[1], 10);
    const unit = match[2];
    const multipliers = { s: 1, m: 60, h: 3600, d: 86400 };
    return value * (multipliers[unit] || 3600);
  }

  /**
   * Generate JWT access token
   */
  generateAccessToken(user) {
    const payload = {
      sub: user.id,
      email: user.email,
      name: user.fullName || user.name || user.email,
      role: user.role || "Learner",
      status: user.status || "Active",
    };
    
    const token = jwt.sign(payload, this.jwtSecret, {
      expiresIn: this.jwtExpiresIn,
    });
    
    return token;
  }

  /**
   * Generate JWT refresh token with JTI
   */
  generateRefreshToken(user, jti) {
    const payload = {
      sub: user.id,
      type: "refresh",
      jti: jti || randomUUID(),
    };
    
    const token = jwt.sign(payload, this.jwtRefreshSecret, {
      expiresIn: this.jwtRefreshExpiresIn,
    });
    
    return token;
  }

  /**
   * Verify and decode JWT access token
   */
  verifyAccessToken(token) {
    try {
      const decoded = jwt.verify(token, this.jwtSecret);
      return { valid: true, payload: decoded };
    } catch (err) {
      logger.warn({ err, token: token?.substring(0, 20) }, "Invalid access token");
      return { valid: false, error: err.message };
    }
  }

  /**
   * Verify and decode JWT refresh token
   */
  verifyRefreshToken(token) {
    try {
      const decoded = jwt.verify(token, this.jwtRefreshSecret);
      return { valid: true, payload: decoded };
    } catch (err) {
      logger.warn({ err, token: token?.substring(0, 20) }, "Invalid refresh token");
      return { valid: false, error: err.message };
    }
  }

  /**
   * Exchange OAuth authorization code for access/refresh tokens
   * @param {Object} params
   * @param {string} params.code - OAuth authorization code
   * @param {string} params.redirectUri - OAuth redirect URI
   * @param {Object} params.metadata - Optional metadata (userAgent, ip)
   * @returns {Object} { accessToken, refreshToken, tokenType, expiresIn, user }
   */
  async exchangeCode({ code, redirectUri, metadata = {} } = {}) {
    if (!code) {
      throw new Error("Authorization code is required");
    }

    // Exchange code for Google tokens and profile
    const { tokens: _tokens, profile } = await this.oauthClient.exchangeCode(code, redirectUri);
    
    logger.info({ 
      sub: profile.sub, 
      email: profile.email 
    }, "OAuth exchange successful");

    // Find or create user
    let user = await this.usersRepo.findByEmail(profile.email);
    
    if (!user) {
      // Create new user from OAuth profile
      const newUser = {
        email: profile.email,
        fullName: profile.name || profile.email,
        role: "Learner",
        status: "Active", // Auto-activate OAuth users
        subscriptionStatus: "None",
      };
      
      user = await this.usersRepo.create(newUser);
      logger.info({ userId: user.id, email: user.email }, "New user created from OAuth");
    } else if (user.status === "PendingActivation") {
      // Auto-activate on OAuth login
      user = await this.usersRepo.updateById(user.id, { status: "Active" });
      logger.info({ userId: user.id }, "User activated via OAuth");
    }

    // Generate JWT tokens
    const jti = randomUUID();
    const accessToken = this.generateAccessToken(user);
    const refreshToken = this.generateRefreshToken(user, jti);

    // Store refresh token in DB
    const expiresInSec = this.parseExpiryToSeconds(this.jwtRefreshExpiresIn);
    const expiresAt = new Date(Date.now() + expiresInSec * 1000);
    
    await this.refreshRepo.create({
      userId: user.id,
      jti,
      userAgent: metadata.userAgent || null,
      ip: metadata.ip || null,
      expiresAt,
    });

    logger.info({ userId: user.id, jti }, "Refresh token stored");

    return {
      accessToken,
      refreshToken,
      tokenType: "Bearer",
      expiresIn: this.parseExpiryToSeconds(this.jwtExpiresIn),
      user,
    };
  }

  /**
   * Refresh access token using refresh token
   * @param {Object} params
   * @param {string} params.refreshToken - JWT refresh token
   * @param {Object} params.metadata - Optional metadata
   * @returns {Object} { accessToken, refreshToken, tokenType, expiresIn, user }
   */
  async refreshAccessToken({ refreshToken, metadata = {} } = {}) {
    if (!refreshToken) {
      throw new Error("Refresh token is required");
    }

    // Verify refresh token
    const verification = this.verifyRefreshToken(refreshToken);
    if (!verification.valid) {
      throw new Error(`Invalid refresh token: ${verification.error}`);
    }

    const { sub, jti } = verification.payload;

    // Check if refresh token exists and not revoked
    const storedToken = await this.refreshRepo.findByJti(jti);
    if (!storedToken) {
      throw new Error("Refresh token not found");
    }
    if (storedToken.revokedAt) {
      throw new Error("Refresh token has been revoked");
    }
    if (new Date() > new Date(storedToken.expiresAt)) {
      throw new Error("Refresh token has expired");
    }

    // Get user
    const user = await this.usersRepo.findById(sub);
    if (!user) {
      throw new Error("User not found");
    }
    if (user.status === "Deactivated") {
      throw new Error("User account is deactivated");
    }

    // Revoke old refresh token
    await this.refreshRepo.revokeByJti(jti);

    // Generate new tokens (token rotation)
    const newJti = randomUUID();
    const accessToken = this.generateAccessToken(user);
    const newRefreshToken = this.generateRefreshToken(user, newJti);

    // Store new refresh token
    const expiresInSec = this.parseExpiryToSeconds(this.jwtRefreshExpiresIn);
    const expiresAt = new Date(Date.now() + expiresInSec * 1000);
    
    await this.refreshRepo.create({
      userId: user.id,
      jti: newJti,
      userAgent: metadata.userAgent || null,
      ip: metadata.ip || null,
      expiresAt,
    });

    logger.info({ userId: user.id, oldJti: jti, newJti }, "Tokens refreshed");

    return {
      accessToken,
      refreshToken: newRefreshToken,
      tokenType: "Bearer",
      expiresIn: this.parseExpiryToSeconds(this.jwtExpiresIn),
      user,
    };
  }

  /**
   * Revoke refresh token
   */
  async revokeRefreshToken(jti) {
    await this.refreshRepo.revokeByJti(jti);
    logger.info({ jti }, "Refresh token revoked");
  }

  /**
   * Revoke all user's refresh tokens
   */
  async revokeAllUserTokens(userId) {
    await this.refreshRepo.revokeAllByUserId(userId);
    logger.info({ userId }, "All user tokens revoked");
  }

  /**
   * Hash password (for local auth - optional)
   */
  async hashPassword(password) {
    return bcrypt.hash(password, 10);
  }

  /**
   * Verify password (for local auth - optional)
   */
  async verifyPassword(password, hashedPassword) {
    return bcrypt.compare(password, hashedPassword);
  }
}

module.exports = AuthService;
