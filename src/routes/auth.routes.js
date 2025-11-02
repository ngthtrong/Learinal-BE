const express = require("express");
const controller = require("../controllers/auth.controller");
const rateLimit = require("../middleware/rateLimit");
const inputValidation = require("../middleware/inputValidation");
const Joi = require("joi");
const { env } = require("../config");
const { randomUUID } = require("crypto");

const router = express.Router();

// POST /auth/register - Local email/password registration
const registerSchema = Joi.object({
  body: Joi.object({
    fullName: Joi.string().trim().min(1).max(160).required(),
    email: Joi.string().email().required(),
    password: Joi.string().min(8).max(128).required(),
  }),
}).unknown(true);

router.post(
  "/register",
  rateLimit({ limit: 30 }),
  inputValidation(registerSchema),
  controller.register
);

// GET /auth/state - Issue OAuth state and set HttpOnly cookie for CSRF protection
router.get("/state", rateLimit({ limit: 120 }), (req, res) => {
  const manual = String(req.query.manual || "").toLowerCase();
  const base = randomUUID();
  const state = manual === "1" || manual === "true" ? `${base}|manual` : base;
  const cookieOpts = {
    httpOnly: true,
    sameSite: env.cookieSameSite || "Lax",
    secure: !!env.cookieSecure,
    // Explicit path ensures we can clear this cookie reliably after exchange
    path: "/api/v1/auth",
    maxAge: 5 * 60 * 1000, // 5 minutes
  };
  if (env.cookieDomain) cookieOpts.domain = env.cookieDomain;
  // Best-effort: clear any legacy root-path cookie to avoid duplicates
  try {
    res.clearCookie("oauth_state", {
      httpOnly: true,
      sameSite: env.cookieSameSite || "Lax",
      secure: !!env.cookieSecure,
      domain: env.cookieDomain || undefined,
      path: "/",
    });
  } catch {}
  res.cookie("oauth_state", state, cookieOpts);
  return res.status(200).json({ state, ttlMs: cookieOpts.maxAge });
});

// POST /auth/login - Local email/password login
const loginSchema = Joi.object({
  body: Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().min(8).max(128).required(),
  }),
}).unknown(true);

router.post("/login", rateLimit({ limit: 60 }), inputValidation(loginSchema), controller.login);

// POST /auth/forgot-password - Request password reset email
const forgotSchema = Joi.object({
  body: Joi.object({
    email: Joi.string().email().required(),
  }),
}).unknown(true);

router.post(
  "/forgot-password",
  rateLimit({ limit: 30 }),
  inputValidation(forgotSchema),
  controller.forgotPassword
);

// POST /auth/reset-password - Reset password with token
const resetSchema = Joi.object({
  body: Joi.object({
    token: Joi.string().required(),
    newPassword: Joi.string().min(8).max(128).required(),
  }),
}).unknown(true);

router.post(
  "/reset-password",
  rateLimit({ limit: 30 }),
  inputValidation(resetSchema),
  controller.resetPassword
);

// POST /auth/verify-email - Verify email with token
const verifySchema = Joi.object({
  body: Joi.object({
    token: Joi.string().required(),
  }),
}).unknown(true);

router.post(
  "/verify-email",
  rateLimit({ limit: 60 }),
  inputValidation(verifySchema),
  controller.verifyEmail
);

// GET /auth/verify-email?token=... - Convenience endpoint for email links
// This allows clicking a link directly without a frontend, useful in dev or simple setups.
router.get("/verify-email", rateLimit({ limit: 60 }), async (req, res, next) => {
  const token = req.query.token;
  if (!token) {
    return res.status(400).json({ code: "ValidationError", message: "Missing token" });
  }
  // Reuse the same controller by injecting token into body
  req.body = { token: String(token) };
  return controller.verifyEmail(req, res, next);
});

// POST /auth/resend-verification - Resend verification email
const resendSchema = Joi.object({
  body: Joi.object({
    email: Joi.string().email().required(),
  }),
}).unknown(true);

router.post(
  "/resend-verification",
  rateLimit({ limit: 30 }),
  inputValidation(resendSchema),
  controller.resendVerification
);

// POST /auth/exchange - Exchange OAuth code for JWT (stub/real)
const exchangeSchema = Joi.object({
  body: Joi.object({ code: Joi.string().optional() }),
}).unknown(true);

router.post(
  "/exchange",
  rateLimit({ limit: 60 }),
  inputValidation(exchangeSchema),
  controller.exchange
);

// POST /auth/refresh - Refresh access token (stub/real)
const refreshSchema = Joi.object({
  body: Joi.object({ refreshToken: Joi.string().optional() }),
}).unknown(true);

router.post(
  "/refresh",
  rateLimit({ limit: 60 }),
  inputValidation(refreshSchema),
  controller.refresh
);

// GET /auth/config - Public non-secret OAuth config for FE testing
router.get("/config", rateLimit({ limit: 120 }), (req, res) => {
  return res.status(200).json({
    clientId: env.googleClientId || "",
    redirectUri: env.googleRedirectUri || "",
    // Do NOT expose client secret
    provider: "google",
    authEndpoint: "https://accounts.google.com/o/oauth2/v2/auth",
    scope: "openid email profile",
    responseType: "code",
    pkceRequired: !!env.oauthRequirePkce,
  });
});

// POST /auth/logout - revoke current refresh token and clear cookie
router.post("/logout", rateLimit({ limit: 60 }), controller.logout);

module.exports = router;
