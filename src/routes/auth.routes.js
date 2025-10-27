const express = require("express");
const controller = require("../controllers/auth.controller");
const rateLimit = require("../middleware/rateLimit");
const inputValidation = require("../middleware/inputValidation");
const Joi = require("joi");

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

// POST /auth/login - Local email/password login
const loginSchema = Joi.object({
  body: Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().min(8).max(128).required(),
  }),
}).unknown(true);

router.post(
  "/login",
  rateLimit({ limit: 60 }),
  inputValidation(loginSchema),
  controller.login
);

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
router.get(
  "/verify-email",
  rateLimit({ limit: 60 }),
  async (req, res, next) => {
    const token = req.query.token;
    if (!token) {
      return res
        .status(400)
        .json({ code: "ValidationError", message: "Missing token" });
    }
    // Reuse the same controller by injecting token into body
    req.body = { token: String(token) };
    return controller.verifyEmail(req, res, next);
  }
);

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

module.exports = router;
