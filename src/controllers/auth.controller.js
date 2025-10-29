const { randomUUID } = require("crypto");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const { env, email: emailCfg } = require("../config");
const logger = require("../utils/logger");
const OAuthClient = require("../adapters/oauthClient");
const UsersRepository = require("../repositories/users.repository");
const EmailClient = require("../adapters/emailClient");
const RefreshTokensRepository = require("../repositories/refreshTokens.repository");
const { verifyGoogleIdToken } = require("../utils/oidc");

const usersRepo = new UsersRepository();
const emailClient = new EmailClient(emailCfg);
const refreshRepo = new RefreshTokensRepository();

function buildRealTokens(user, { jti } = {}) {
  const payload = {
    sub: user.id,
    email: user.email,
    name: user.fullName || user.name || user.email,
    role: user.role || "Learner",
    status: user.status || "Active",
  };
  const accessToken = jwt.sign(payload, env.jwtSecret, {
    expiresIn: env.jwtExpiresIn,
  });
  const refreshClaims = { sub: user.id, type: "refresh" };
  if (jti) refreshClaims.jti = jti;
  const refreshToken = jwt.sign(refreshClaims, env.jwtRefreshSecret, {
    expiresIn: env.jwtRefreshExpiresIn,
  });
  return {
    accessToken,
    refreshToken,
    tokenType: "Bearer",
    expiresIn: 3600,
    user,
  };
}

async function issueTokens(_mode, user, { req } = {}) {
  // real: create refresh with jti and store it for rotation/revoke
  const jti = randomUUID();
  const body = buildRealTokens(user, { jti });
  try {
    const decoded = jwt.decode(body.refreshToken);
    const expSec =
      decoded && decoded.exp ? decoded.exp : Math.floor(Date.now() / 1000) + 7 * 24 * 3600;
    const expiresAt = new Date(expSec * 1000);
    await refreshRepo.createRecord({
      userId: user.id,
      jti,
      userAgent: req?.headers?.["user-agent"] || null,
      ip: req?.ip || null,
      expiresAt,
    });
  } catch {}
  return body;
}

function setRefreshCookie(res, refreshToken) {
  try {
    const opts = {
      httpOnly: true,
      sameSite: env.cookieSameSite || "Lax",
      secure: !!env.cookieSecure,
    };
    if (env.cookieDomain) opts.domain = env.cookieDomain;
    // Set expiry based on token exp if available
    const decoded = jwt.decode(refreshToken);
    if (decoded && decoded.exp) {
      opts.expires = new Date(decoded.exp * 1000);
    }
    res.cookie("rt", refreshToken, opts);
  } catch {}
}

module.exports = {
  // POST /auth/forgot-password
  forgotPassword: async (req, res, next) => {
    try {
      const { email } = req.body || {};
      const normalizedEmail = (email || "").toLowerCase().trim();

      const user = await usersRepo.findByEmail(normalizedEmail, {
        includeSensitive: false,
      });
      // Always respond 200 to prevent account enumeration
      if (user) {
        const jti = randomUUID();
        const token = jwt.sign(
          { sub: user.id, type: "password-reset", jti },
          env.passwordResetSecret,
          { expiresIn: env.passwordResetExpiresIn }
        );
        // Build reset URL using only the origin of APP_BASE_URL to avoid API path fragments
        // Example: if APP_BASE_URL = http://localhost:3001/api/v1/auth, origin = http://localhost:3001
        let linkBase = env.appBaseUrl;
        try {
          const u = new URL(env.appBaseUrl);
          linkBase = `${u.protocol}//${u.host}`;
        } catch {}
        const link = `${linkBase}/reset-password?token=${encodeURIComponent(token)}`;
        try {
          await emailClient.send(
            user.email,
            "Reset your password",
            emailCfg.resetTemplateId || null,
            { fullName: user.fullName || "there", link }
          );
        } catch {}
        // Store one-time token metadata for validation on reset
        try {
          const decoded = jwt.decode(token);
          const expSec =
            decoded && decoded.exp ? decoded.exp : Math.floor(Date.now() / 1000) + 3600;
          const expiresAt = new Date(expSec * 1000);
          const PasswordResetTokensRepository = require("../repositories/passwordResetTokens.repository");
          await PasswordResetTokensRepository.singleton().createRecord({
            userId: user.id,
            jti,
            expiresAt,
          });
        } catch {}
      }
      return res.status(200).json({
        message: "If the email exists, a reset link has been sent.",
      });
    } catch (err) {
      next(err);
    }
  },

  // POST /auth/reset-password
  resetPassword: async (req, res, next) => {
    try {
      const { token, newPassword } = req.body || {};
      let decoded;
      try {
        decoded = jwt.verify(token, env.passwordResetSecret);
      } catch {
        return res.status(400).json({
          code: "ValidationError",
          message: "Invalid or expired token",
        });
      }
      if (decoded.type !== "password-reset" || !decoded.sub || !decoded.jti) {
        return res.status(400).json({ code: "ValidationError", message: "Invalid token" });
      }
      const userId = decoded.sub;
      const jti = decoded.jti;
      // Validate one-time token usability
      try {
        const PasswordResetTokensRepository = require("../repositories/passwordResetTokens.repository");
        const repo = PasswordResetTokensRepository.singleton();
        const usable = await repo.isUsable(jti);
        if (!usable) {
          return res.status(400).json({
            code: "ValidationError",
            message: "Invalid or expired token",
          });
        }
        await repo.markUsed(jti);
      } catch {}
      const saltRounds = 12;
      const hashedPassword = await bcrypt.hash(newPassword, saltRounds);
      const updated = await usersRepo.updateUserById(userId, {
        hashedPassword,
      });
      if (!updated) {
        return res.status(404).json({ code: "NotFound", message: "User not found" });
      }
      return res.status(200).json({ message: "Password has been reset." });
    } catch (err) {
      next(err);
    }
  },

  // POST /auth/verify-email
  verifyEmail: async (req, res, next) => {
    try {
      const { token } = req.body || {};
      let decoded;
      try {
        decoded = jwt.verify(token, env.emailVerifySecret);
      } catch {
        return res.status(400).json({
          code: "ValidationError",
          message: "Invalid or expired token",
        });
      }
      if (decoded.type !== "email-verify" || !decoded.sub) {
        return res.status(400).json({ code: "ValidationError", message: "Invalid token" });
      }
      const userId = decoded.sub;
      // Activate account: set status to Active
      const updated = await usersRepo.updateUserById(userId, {
        status: "Active",
      });
      if (!updated) {
        return res.status(404).json({ code: "NotFound", message: "User not found" });
      }
      return res.status(200).json({ message: "Email verified." });
    } catch (err) {
      next(err);
    }
  },

  // POST /auth/resend-verification
  resendVerification: async (req, res, next) => {
    try {
      const { email } = req.body || {};
      const normalizedEmail = (email || "").toLowerCase().trim();
      const user = await usersRepo.findByEmail(normalizedEmail);
      // Always 200; only send when user exists and not Active
      if (user && user.status !== "Active") {
        const token = jwt.sign({ sub: user.id, type: "email-verify" }, env.emailVerifySecret, {
          expiresIn: env.emailVerifyExpiresIn,
        });
        const link = `${env.appBaseUrl}/verify-email?token=${encodeURIComponent(token)}`;
        try {
          await emailClient.send(
            user.email,
            "Verify your email",
            emailCfg.verifyTemplateId || null,
            { fullName: user.fullName || "there", link }
          );
        } catch (e) {
          if (env.nodeEnv !== "production") {
            const providerMsg = e?.response?.body || e?.message || e;
            logger.warn({ providerMsg }, "[email] resend verification send failed");
          }
        }
      }
      const body = {
        message: "If the email exists, a verification has been sent.",
      };
      return res.status(200).json(body);
    } catch (err) {
      next(err);
    }
  },
  // POST /auth/register (local credentials)
  register: async (req, res, next) => {
    try {
      const { fullName, email, password } = req.body || {};
      const normalizedEmail = (email || "").toLowerCase().trim();

      // Check duplicate email
      const taken = await usersRepo.isEmailTaken(normalizedEmail);
      if (taken) {
        return res.status(409).json({ code: "Conflict", message: "Email already in use" });
      }

      // Hash password
      const saltRounds = 12;
      const hashedPassword = await bcrypt.hash(password, saltRounds);

      // Create user: start as PendingActivation; user must verify to become Active
      const created = await usersRepo.createUser({
        fullName: fullName.trim(),
        email: normalizedEmail,
        hashedPassword,
        role: "Learner",
        status: "PendingActivation",
      });

      // Send verification email (best-effort)
      try {
        const token = jwt.sign({ sub: created.id, type: "email-verify" }, env.emailVerifySecret, {
          expiresIn: env.emailVerifyExpiresIn,
        });
        const link = `${env.appBaseUrl}/verify-email?token=${encodeURIComponent(token)}`;
        await emailClient.send(
          created.email,
          "Verify your email",
          emailCfg.verifyTemplateId || null,
          { fullName: created.fullName, link }
        );
      } catch (e) {
        // In non-production, surface a concise reason to the logs to aid setup
        if (env.nodeEnv !== "production") {
          const providerMsg = e?.response?.body || e?.message || e;
          logger.warn({ providerMsg }, "[email] verification send failed");
        }
      }

      // Cách 1: Không phát hành token tại thời điểm đăng ký.
      // Người dùng cần xác minh email (link đã được gửi) rồi đăng nhập để nhận token.
      return res.status(201).json({
        message: "Registration successful. Please verify your email, then login to continue.",
      });
    } catch (err) {
      // Map potential duplicate key to 409
      if (err && err.code === 11000) {
        return res.status(409).json({ code: "Conflict", message: "Email already in use" });
      }
      next(err);
    }
  },

  // POST /auth/login (local credentials)
  login: async (req, res, next) => {
    try {
      const { email, password } = req.body || {};
      const normalizedEmail = (email || "").toLowerCase().trim();

      // Get user with hashedPassword
      const userWithSensitive = await usersRepo.findByEmail(normalizedEmail, {
        includeSensitive: true,
      });
      if (!userWithSensitive || !userWithSensitive.hashedPassword) {
        return res.status(401).json({ code: "Unauthorized", message: "Invalid email or password" });
      }

      const ok = await bcrypt.compare(password, userWithSensitive.hashedPassword);
      if (!ok) {
        return res.status(401).json({ code: "Unauthorized", message: "Invalid email or password" });
      }

      // Enforce account status according to env policy
      // - Always block Deactivated
      // - If REQUIRE_EMAIL_VERIFIED_FOR_LOGIN=true, only allow Active
      if (userWithSensitive.status === "Deactivated") {
        return res.status(403).json({ code: "Forbidden", message: "Account is deactivated" });
      }
      const requireVerified = Boolean(env.requireEmailVerifiedForLogin);
      if (requireVerified && userWithSensitive.status !== "Active") {
        return res.status(403).json({ code: "Forbidden", message: "Email not verified" });
      }

      // Remove sensitive field from response
      const { hashedPassword: _omit, ...safeUser } = userWithSensitive;
      // Local auth must always issue REAL tokens (no stub)
      const tokens = await issueTokens("real", safeUser, { req });
      return res.status(200).json(tokens);
    } catch (err) {
      next(err);
    }
  },

  // POST /auth/exchange
  exchange: async (req, res, next) => {
    try {
      // Always-real: Exchange Google code for tokens and issue our JWTs
      const { code, state, codeVerifier } = req.body || {};
      if (!code) {
        return res.status(400).json({ code: "ValidationError", message: "Missing code in body" });
      }
      // Verify state if required
      if (env.oauthRequireState) {
        const cookieState = req.cookies?.oauth_state;
        if (!state || !cookieState || state !== cookieState) {
          return res.status(403).json({ code: "Forbidden", message: "Invalid OAuth state" });
        }
      }
      const client = new OAuthClient(env);
      const { tokens, profile } = await client.exchangeCode(code, { codeVerifier });

      // Verify id_token when present
      if (tokens?.id_token) {
        try {
          await verifyGoogleIdToken(tokens.id_token, env.googleClientId);
        } catch {
          return res.status(401).json({ code: "Unauthorized", message: "Invalid id_token" });
        }
      }
      const normalizedEmail = (profile.email || "").toLowerCase().trim();

      // Enforce email verification policy for OAuth if configured
      if (env.requireEmailVerifiedForLogin && profile.email && profile.email_verified !== true) {
        return res.status(403).json({ code: "Forbidden", message: "Email not verified" });
      }

      // Find or create user in Mongo: prefer provider identity, fallback to email
      const provider = "google";
      const providerSub = profile.sub;
      let user = null;
      if (providerSub) {
        user = await usersRepo.findByProviderSub(provider, providerSub);
      }
      if (!user && normalizedEmail) {
        user = await usersRepo.findByEmail(normalizedEmail);
      }
      if (!user) {
        // Production-hardening: only treat as verified when provider explicitly reports true
        // Default to PendingActivation if the claim is missing or false
        const isVerified = profile.email_verified === true;
        user = await usersRepo.createUser({
          fullName: profile.name || normalizedEmail,
          email: normalizedEmail,
          provider,
          providerSub: providerSub || null,
          providerEmail: normalizedEmail || null,
          role: "Learner",
          status: isVerified ? "Active" : "PendingActivation",
        });
      } else if (providerSub && !user.providerSub) {
        // Link provider identity if missing
        user = await usersRepo.updateUserById(user.id, {
          provider,
          providerSub,
          providerEmail: normalizedEmail || null,
        });
      }

      const body = await issueTokens("real", user, { req });
      // Set refresh token cookie for improved security
      setRefreshCookie(res, body.refreshToken);
      return res.status(200).json(body);
    } catch (err) {
      next(err);
    }
  },

  // POST /auth/refresh
  refresh: async (req, res, next) => {
    try {
      const bodyToken = req.body?.refreshToken;
      const cookieToken = req.cookies?.rt;
      const refreshToken = bodyToken || cookieToken;
      if (!refreshToken) {
        return res.status(400).json({ code: "ValidationError", message: "Missing refreshToken" });
      }
      let decoded;
      try {
        decoded = jwt.verify(refreshToken, env.jwtRefreshSecret);
      } catch {
        return res.status(401).json({ code: "Unauthorized", message: "Invalid refresh token" });
      }
      const sub = decoded.sub;
      const jti = decoded.jti;

      if (jti) {
        const valid = await refreshRepo.isValid(jti);
        if (!valid) {
          return res.status(401).json({
            code: "Unauthorized",
            message: "Refresh token expired or revoked",
          });
        }
        await refreshRepo.revokeByJti(jti);
        const user = await usersRepo.findByUserId(sub);
        const body = await issueTokens("real", user, { req });
        setRefreshCookie(res, body.refreshToken);
        return res.status(200).json(body);
      }

      // Legacy: if no jti (older JWT style), just issue new access token
      const payload = { sub, role: "Learner" };
      const accessToken = jwt.sign(payload, env.jwtSecret, {
        expiresIn: env.jwtExpiresIn,
      });
      return res.status(200).json({ accessToken, tokenType: "Bearer", expiresIn: 3600 });
    } catch (err) {
      next(err);
    }
  },
  // POST /auth/logout - revoke current refresh token (from cookie/body)
  logout: async (req, res, next) => {
    try {
      const bodyToken = req.body?.refreshToken;
      const cookieToken = req.cookies?.rt;
      const refreshToken = bodyToken || cookieToken;
      if (refreshToken) {
        try {
          const decoded = jwt.verify(refreshToken, env.jwtRefreshSecret);
          if (decoded?.jti) await refreshRepo.revokeByJti(decoded.jti);
        } catch {}
      }
      // Clear cookie
      try {
        res.clearCookie("rt", {
          httpOnly: true,
          sameSite: env.cookieSameSite || "Lax",
          secure: !!env.cookieSecure,
          domain: env.cookieDomain || undefined,
        });
      } catch {}
      return res.status(204).send();
    } catch (err) {
      next(err);
    }
  },
};
