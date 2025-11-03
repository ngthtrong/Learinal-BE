const { randomUUID, randomBytes } = require("crypto");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const { env, email: emailCfg } = require("../config");
const logger = require("../utils/logger");
const OAuthClient = require("../adapters/oauthClient");
const UsersRepository = require("../repositories/users.repository");
const EmailClient = require("../adapters/emailClient");
const { enqueueEmail } = require("../adapters/queue");
const RefreshTokensRepository = require("../repositories/refreshTokens.repository");
const { verifyGoogleIdToken } = require("../utils/oidc");

const usersRepo = new UsersRepository();
const emailClient = new EmailClient(emailCfg);
const refreshRepo = new RefreshTokensRepository();

function parseDurationMs(input) {
  if (!input) return 0;
  if (typeof input === "number") return input;
  const s = String(input).trim();
  const m = /^([0-9]+)\s*([smhd])?$/i.exec(s);
  if (!m) return Number(s) || 0;
  const val = Number(m[1]);
  const unit = (m[2] || "s").toLowerCase();
  const mult =
    unit === "s" ? 1000 : unit === "m" ? 60 * 1000 : unit === "h" ? 3600 * 1000 : 24 * 3600 * 1000;
  return val * mult;
}

function buildRealTokens(user, { jti } = {}) {
  const payload = {
    sub: user.id,
    email: user.email,
    name: user.fullName || user.name || user.email,
    role: user.role || "Learner",
    status: user.status || "Active",
  };
  const accessTokenOpts = {
    expiresIn: env.jwtExpiresIn,
    algorithm: env.jwtAlgorithm || "HS256",
  };
  if (env.jwtIssuer) accessTokenOpts.issuer = env.jwtIssuer;
  if (env.jwtAudience) accessTokenOpts.audience = env.jwtAudience;
  const accessToken = jwt.sign(payload, env.jwtSecret, accessTokenOpts);
  const refreshClaims = { sub: user.id, type: "refresh" };
  if (jti) refreshClaims.jti = jti;
  const refreshTokenOpts = {
    expiresIn: env.jwtRefreshExpiresIn,
    algorithm: env.jwtAlgorithm || "HS256",
  };
  if (env.jwtIssuer) refreshTokenOpts.issuer = env.jwtIssuer;
  if (env.jwtAudience) refreshTokenOpts.audience = env.jwtAudience;
  const refreshToken = jwt.sign(refreshClaims, env.jwtRefreshSecret, refreshTokenOpts);
  return {
    accessToken,
    refreshToken,
    tokenType: "Bearer",
    expiresIn: 3600,
    user,
  };
}

async function issueTokens(_mode, user, { req, jti: forcedJti, familyId, parentJti } = {}) {
  // real: create refresh with jti and store it for rotation/revoke
  const jti = forcedJti || randomUUID();
  const body = buildRealTokens(user, { jti });
  try {
    let expiresAt;
    if (env.refreshOpaque) {
      const ms = parseDurationMs(env.jwtRefreshExpiresIn || "7d");
      expiresAt = new Date(Date.now() + (ms || 7 * 24 * 3600 * 1000));
    } else {
      const decoded = jwt.decode(body.refreshToken);
      const expSec =
        decoded && decoded.exp ? decoded.exp : Math.floor(Date.now() / 1000) + 7 * 24 * 3600;
      expiresAt = new Date(expSec * 1000);
    }
    // Enforce concurrent session limit if configured
    try {
      const max = parseInt(env.maxSessionsPerUser || 0, 10);
      if (max > 0) {
        const current = await refreshRepo.countActiveByUser(user.id);
        if (current >= max) {
          if (env.pruneOldestSessions) {
            const need = current - (max - 1);
            if (need > 0) {
              const oldest = await refreshRepo.findOldestActiveByUser(user.id, need);
              const ids = oldest.map((d) => d._id);
              if (ids.length) await refreshRepo.revokeByIds(ids);
            }
          } else {
            // Refuse to create a new session
            const err = new Error("Session limit reached");
            err.code = "SessionLimit";
            throw err;
          }
        }
      }
    } catch (e) {
      if (e?.code === "SessionLimit") throw e;
    }
    const deviceId = req?.headers?.["x-device-id"] || null;
    let tokenType = "jwt";
    let tokenHash = null;
    if (env.refreshOpaque) {
      const secret = randomBytes(32).toString("base64url");
      const opaque = `${jti}.${secret}`;
      tokenHash = await bcrypt.hash(secret, 12);
      tokenType = "opaque";
      body.refreshToken = opaque;
    }
    await refreshRepo.createRecord({
      userId: user.id,
      jti,
      userAgent: req?.headers?.["user-agent"] || null,
      ip: req?.ip || null,
      deviceId,
      expiresAt,
      familyId: familyId || jti,
      parentJti: parentJti || null,
      tokenType,
      tokenHash,
      familyIssuedAt: new Date(),
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
      // Limit cookie to API routes; adjust if your FE expects a different scope
      path: "/api/v1",
    };
    if (env.cookieDomain) opts.domain = env.cookieDomain;
    // Set expiry based on token exp if available
    const decoded = jwt.decode(refreshToken);
    if (decoded && decoded.exp) {
      opts.expires = new Date(decoded.exp * 1000);
    } else {
      const ms = parseDurationMs(env.jwtRefreshExpiresIn || "7d");
      if (ms > 0) opts.expires = new Date(Date.now() + ms);
    }
    res.cookie("rt", refreshToken, opts);
    // Best-effort: clear any legacy root-path cookie to avoid duplicates
    try {
      res.clearCookie("rt", {
        httpOnly: true,
        sameSite: env.cookieSameSite || "Lax",
        secure: !!env.cookieSecure,
        domain: env.cookieDomain || undefined,
        path: "/",
      });
    } catch {}
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
        // Build reset URL to frontend app; FE now owns the reset-password route
        const link = `${env.appBaseUrl}/reset-password?token=${encodeURIComponent(token)}`;
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
  // GET /auth/sessions - list active sessions of current user
  sessions: async (req, res, next) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ code: "Unauthorized", message: "Auth required" });
      const items = await refreshRepo.listActiveByUser(userId);
      const mapped = items.map((t) => ({
        id: String(t._id || t.id),
        familyId: t.familyId || t.jti,
        deviceId: t.deviceId || null,
        userAgent: t.userAgent || null,
        ip: t.ip || null,
        createdAt: t.createdAt,
        expiresAt: t.expiresAt,
        rotatedAt: t.rotatedAt || null,
        reusedAt: t.reusedAt || null,
      }));
      return res.status(200).json({ items: mapped });
    } catch (err) {
      next(err);
    }
  },
  // POST /auth/sessions/:id/revoke - revoke a specific session (refresh token)
  revokeSession: async (req, res, next) => {
    try {
      const userId = req.user?.id;
      const id = req.params?.id;
      if (!userId) return res.status(401).json({ code: "Unauthorized", message: "Auth required" });
      if (!id) return res.status(400).json({ code: "ValidationError", message: "Missing id" });
      // Ensure the token belongs to the current user
      const doc = await refreshRepo.findOne({ _id: id });
      if (!doc || String(doc.userId) !== String(userId)) {
        return res.status(404).json({ code: "NotFound", message: "Session not found" });
      }
      await refreshRepo.revokeById(id);
      return res.status(204).send();
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

        // Try to enqueue email; if queue not available, send directly
        try {
          await enqueueEmail({
            to: created.email,
            subject: "Verify your email - Learinal",
            templateId: emailCfg.verifyTemplateId,
            variables: { fullName: created.fullName, link },
          });
          logger.info({ email: created.email }, "Verification email queued");
        } catch (queueError) {
          // Fallback to direct send if queue is not available
          logger.warn({ error: queueError.message }, "Queue not available, sending email directly");
          await emailClient.send(
            created.email,
            "Verify your email - Learinal",
            null, // Temporarily disable template for testing
            { fullName: created.fullName, link }
          );
          logger.info({ email: created.email }, "Verification email sent directly");
        }
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
      // Ensure refresh token cookie is set for cookie-only refresh flow
      setRefreshCookie(res, tokens.refreshToken);
      // Do not expose refreshToken in response body (cookie-only)
      const { refreshToken: _omitRt1, ...loginResp } = tokens;
      return res.status(200).json(loginResp);
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
      // Do not expose refreshToken in response body (cookie-only)
      const { refreshToken: _omitRt2, ...exchangeResp } = body;
      // Clear one-time OAuth state cookie after successful exchange
      try {
        res.clearCookie("oauth_state", {
          httpOnly: true,
          sameSite: env.cookieSameSite || "Lax",
          secure: !!env.cookieSecure,
          domain: env.cookieDomain || undefined,
          path: "/api/v1/auth",
        });
        // Also clear any legacy root-path oauth_state cookie
        res.clearCookie("oauth_state", {
          httpOnly: true,
          sameSite: env.cookieSameSite || "Lax",
          secure: !!env.cookieSecure,
          domain: env.cookieDomain || undefined,
          path: "/",
        });
      } catch {}
      return res.status(200).json(exchangeResp);
    } catch (err) {
      next(err);
    }
  },

  // POST /auth/refresh
  refresh: async (req, res, next) => {
    try {
      // Enforce cookie-only refresh and require a custom header to mitigate CSRF form-post
      const requestedBy = req.get("x-requested-by");
      if (!requestedBy) {
        return res
          .status(403)
          .json({ code: "Forbidden", message: "Missing X-Requested-By header" });
      }
      const refreshToken = req.cookies?.rt;
      if (!refreshToken) {
        return res.status(400).json({ code: "ValidationError", message: "Missing refreshToken" });
      }
      if (env.refreshOpaque) {
        const parts = String(refreshToken).split(".");
        if (parts.length !== 2) {
          return res.status(401).json({ code: "Unauthorized", message: "Invalid refresh token" });
        }
        const jti = parts[0];
        const secret = parts[1];
        const rec = await refreshRepo.findByJti(jti);
        const now = Date.now();
        if (!rec || rec.tokenType !== "opaque" || !rec.tokenHash) {
          return res.status(401).json({ code: "Unauthorized", message: "Invalid refresh token" });
        }
        const user = await usersRepo.findByUserId(rec.userId);
        if (!user)
          return res.status(401).json({ code: "Unauthorized", message: "Invalid token owner" });
        const notRevoked = !rec.revokedAt;
        const notExpired = rec?.expiresAt && new Date(rec.expiresAt).getTime() > now;
        const okSecret = await bcrypt.compare(secret, rec.tokenHash);
        if (!notRevoked || !notExpired || !okSecret) {
          return res.status(401).json({ code: "Unauthorized", message: "Invalid refresh token" });
        }
        // Absolute lifetime
        try {
          const capMs = parseDurationMs(env.absoluteRefreshLifetime || "");
          const familyStart = rec.familyIssuedAt || rec.createdAt;
          if (capMs > 0 && familyStart && Date.now() - new Date(familyStart).getTime() > capMs) {
            await refreshRepo.revokeFamily(rec.userId, rec.familyId || rec.jti).catch(() => {});
            return res
              .status(401)
              .json({ code: "Unauthorized", message: "Session expired, please login again" });
          }
        } catch {}
        if (rec.rotatedAt) {
          try {
            await refreshRepo.markReused(jti);
            await refreshRepo.revokeFamily(rec.userId, rec.familyId || rec.jti);
          } catch {}
          return res.status(401).json({
            code: "Unauthorized",
            message: "Refresh token reuse detected. Please login again.",
          });
        }
        // Rotate atomically
        const newJti = randomUUID();
        const secret2 = randomBytes(32).toString("base64url");
        const tokenHash2 = await bcrypt.hash(secret2, 12);
        const ms = parseDurationMs(env.jwtRefreshExpiresIn || "7d");
        const expiresAt = new Date(Date.now() + (ms || 7 * 24 * 3600 * 1000));
        const deviceId = req?.headers?.["x-device-id"] || null;
        const familyId = rec.familyId || rec.jti;
        const famIssued = rec.familyIssuedAt || rec.createdAt || new Date();
        await refreshRepo.doRotationAtomic(jti, {
          userId: rec.userId,
          jti: newJti,
          userAgent: req?.headers?.["user-agent"] || null,
          ip: req?.ip || null,
          deviceId,
          expiresAt,
          familyId,
          parentJti: rec.jti,
          tokenType: "opaque",
          tokenHash: tokenHash2,
          familyIssuedAt: famIssued,
        });
        // Issue new access token using newJti
        const tokens = buildRealTokens(user, { jti: newJti });
        const newOpaque = `${newJti}.${secret2}`;
        tokens.refreshToken = newOpaque;
        setRefreshCookie(res, newOpaque);
        const { refreshToken: _omitRt, ...resp } = tokens;
        return res.status(200).json(resp);
      } else {
        let decoded;
        try {
          const verifyOpts = {
            algorithms: [env.jwtAlgorithm || "HS256"],
          };
          if (env.jwtIssuer) verifyOpts.issuer = env.jwtIssuer;
          if (env.jwtAudience) verifyOpts.audience = env.jwtAudience;
          decoded = jwt.verify(refreshToken, env.jwtRefreshSecret, verifyOpts);
        } catch {
          return res.status(401).json({ code: "Unauthorized", message: "Invalid refresh token" });
        }
        const sub = decoded.sub;
        const jti = decoded.jti;
        if (jti) {
          const rec = await refreshRepo.findByJti(jti);
          const now = Date.now();
          const belongsToUser = rec?.userId && String(rec.userId) === String(sub);
          const notRevoked = !rec?.revokedAt;
          const notExpired = rec?.expiresAt && new Date(rec.expiresAt).getTime() > now;
          if (!rec || !belongsToUser || !notRevoked || !notExpired) {
            return res.status(401).json({
              code: "Unauthorized",
              message: "Refresh token expired, revoked, or invalid",
            });
          }
          // Absolute lifetime
          try {
            const capMs = parseDurationMs(env.absoluteRefreshLifetime || "");
            const familyStart = rec.familyIssuedAt || rec.createdAt;
            if (capMs > 0 && familyStart && Date.now() - new Date(familyStart).getTime() > capMs) {
              await refreshRepo.revokeFamily(rec.userId, rec.familyId || rec.jti).catch(() => {});
              return res
                .status(401)
                .json({ code: "Unauthorized", message: "Session expired, please login again" });
            }
          } catch {}
          if (rec.rotatedAt) {
            try {
              await refreshRepo.markReused(jti);
              await refreshRepo.revokeFamily(rec.userId, rec.familyId || rec.jti);
            } catch {}
            return res.status(401).json({
              code: "Unauthorized",
              message: "Refresh token reuse detected. Please login again.",
            });
          }
          const user = await usersRepo.findByUserId(sub);
          const newJti = randomUUID();
          const tokens = buildRealTokens(user, { jti: newJti });
          const decodedNew = jwt.decode(tokens.refreshToken);
          const expSecNew = decodedNew?.exp || Math.floor(Date.now() / 1000) + 7 * 24 * 3600;
          const expiresAt = new Date(expSecNew * 1000);
          const deviceId = req?.headers?.["x-device-id"] || null;
          const familyId = rec.familyId || rec.jti;
          const famIssued = rec.familyIssuedAt || rec.createdAt || new Date();
          await refreshRepo.doRotationAtomic(jti, {
            userId: rec.userId,
            jti: newJti,
            userAgent: req?.headers?.["user-agent"] || null,
            ip: req?.ip || null,
            deviceId,
            expiresAt,
            familyId,
            parentJti: rec.jti,
            tokenType: "jwt",
            tokenHash: null,
            familyIssuedAt: famIssued,
          });
          setRefreshCookie(res, tokens.refreshToken);
          const { refreshToken: _omitRt3, ...refreshResp } = tokens;
          return res.status(200).json(refreshResp);
        }
        // Legacy no-jti
        const payload = { sub, role: "Learner" };
        const accessToken = jwt.sign(payload, env.jwtSecret, {
          expiresIn: env.jwtExpiresIn,
          algorithm: env.jwtAlgorithm || "HS256",
          ...(env.jwtIssuer ? { issuer: env.jwtIssuer } : {}),
          ...(env.jwtAudience ? { audience: env.jwtAudience } : {}),
        });
        return res.status(200).json({ accessToken, tokenType: "Bearer", expiresIn: 3600 });
      }
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
          path: "/api/v1",
        });
        // Also clear legacy root-path cookie if present
        res.clearCookie("rt", {
          httpOnly: true,
          sameSite: env.cookieSameSite || "Lax",
          secure: !!env.cookieSecure,
          domain: env.cookieDomain || undefined,
          path: "/",
        });
      } catch {}
      return res.status(204).send();
    } catch (err) {
      next(err);
    }
  },
};
