const express = require('express');
const Joi = require('joi');
const controller = require('../controllers/quizAttempts.controller');
const authenticateJWT = require('../middleware/authenticateJWT');
const rateLimit = require('../middleware/rateLimit');
const inputValidation = require('../middleware/inputValidation');

const router = express.Router();

// Validation schemas
const startAttemptSchema = Joi.object({
  body: Joi.object({
    setId: Joi.string().required(),
  }),
}).unknown(true);

const submitAttemptSchema = Joi.object({
  params: Joi.object({
    id: Joi.string().required(),
  }),
  body: Joi.object({
    answers: Joi.array()
      .items(
        Joi.object({
          questionId: Joi.string().required(),
          selectedOptionIndex: Joi.number().integer().min(0).max(3).required(),
        })
      )
      .min(1)
      .required(),
  }),
}).unknown(true);

const getAttemptSchema = Joi.object({
  params: Joi.object({
    id: Joi.string().required(),
  }),
}).unknown(true);

const listAttemptsSchema = Joi.object({
  query: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    pageSize: Joi.number().integer().min(1).max(100).default(20),
    sort: Joi.string().valid('endTime', '-endTime', 'startTime', '-startTime', 'score', '-score').default('-endTime'),
    setId: Joi.string().optional(),
  }),
}).unknown(true);

/**
 * Quiz Attempts Routes
 * Base: /api/v1/quiz-attempts
 */

// POST /api/v1/quiz-attempts/start - Start new quiz attempt
router.post(
  '/start',
  rateLimit({ limit: 30 }),
  authenticateJWT,
  inputValidation(startAttemptSchema),
  controller.startAttempt
);

// POST /api/v1/quiz-attempts/:id/submit - Submit quiz answers
router.post(
  '/:id/submit',
  rateLimit({ limit: 30 }),
  authenticateJWT,
  inputValidation(submitAttemptSchema),
  controller.submitAttempt
);

// GET /api/v1/quiz-attempts/:id - Get quiz attempt details
router.get(
  '/:id',
  rateLimit({ limit: 60 }),
  authenticateJWT,
  inputValidation(getAttemptSchema),
  controller.getAttempt
);

// GET /api/v1/quiz-attempts - List user's quiz attempts
router.get(
  '/',
  rateLimit({ limit: 60 }),
  authenticateJWT,
  inputValidation(listAttemptsSchema),
  controller.listAttempts
);

module.exports = router;

