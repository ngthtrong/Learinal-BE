const express = require("express");
const Joi = require("joi");
const controller = require("../controllers/questionSets.controller");
const authenticateJWT = require("../middleware/authenticateJWT");
const { expensiveLimiter } = require("../config/rateLimits");
const inputValidation = require("../middleware/inputValidation");
const idempotencyKey = require("../middleware/idempotencyKey");
const { checkQuestionGenerationLimit, checkCanShare, checkValidationRequestLimit } = require("../middleware/checkEntitlement");
const { cacheResponse } = require("../middleware/cacheResponse");

const router = express.Router();

const genSchema = Joi.object({
  body: Joi.object({
    subjectId: Joi.string().required(),
    title: Joi.string().min(1).required(),
    numQuestions: Joi.number().integer().min(1).max(100).default(10),
    difficulty: Joi.string().valid("Biết", "Hiểu", "Vận dụng", "Vận dụng cao").default("Hiểu"),
  }),
}).unknown(true);

const createManualSchema = Joi.object({
  body: Joi.object({
    title: Joi.string().min(1).max(200).required(),
    description: Joi.string().max(1000).optional(),
    subjectId: Joi.string().optional(),
    questions: Joi.array()
      .items(
        Joi.object({
          questionText: Joi.string().required(),
          options: Joi.array().items(Joi.string()).min(2).max(6).required(),
          correctAnswerIndex: Joi.number().integer().min(0).required(),
          difficultyLevel: Joi.string().valid("Easy", "Medium", "Hard").optional(),
          explanation: Joi.string().optional(),
          topicTags: Joi.array().items(Joi.string()).optional(),
        })
      )
      .min(1)
      .max(100)
      .required(),
  }),
}).unknown(true);

const generateFromDocSchema = Joi.object({
  body: Joi.object({
    documentId: Joi.string().required(),
    title: Joi.string().min(1).max(200).required(),
    description: Joi.string().max(1000).optional(),
    numQuestions: Joi.number().integer().min(1).max(50).default(10),
    difficulty: Joi.string().valid("Easy", "Medium", "Hard").default("Medium"),
    questionType: Joi.string().valid("multiple-choice", "true-false").default("multiple-choice"),
  }),
}).unknown(true);

const quizAttemptsQuerySchema = Joi.object({
  params: Joi.object({ questionSetId: Joi.string().required() }),
  query: Joi.object({
    page: Joi.number().integer().min(1).optional(),
    pageSize: Joi.number().integer().min(1).max(100).optional(),
    isCompleted: Joi.boolean().optional(),
  }),
}).unknown(true);

// Cache GET requests (10 minutes TTL)
router.get("/", authenticateJWT, cacheResponse({ ttl: 600 }), controller.list);
router.post(
  "/create",
  authenticateJWT,
  inputValidation(createManualSchema),
  controller.createManual
);
router.post(
  "/generate-from-document",
  expensiveLimiter,
  authenticateJWT,
  checkQuestionGenerationLimit,
  idempotencyKey,
  inputValidation(generateFromDocSchema),
  controller.generateFromDocument
);
router.post(
  "/generate",
  expensiveLimiter,
  authenticateJWT,
  checkQuestionGenerationLimit,
  idempotencyKey,
  inputValidation(genSchema),
  controller.generate
);
router.get("/:id", authenticateJWT, cacheResponse({ ttl: 600 }), controller.get);
router.patch("/:id", authenticateJWT, controller.update);
router.delete("/:id", authenticateJWT, controller.remove);
router.post("/:id/share", authenticateJWT, checkCanShare, controller.share);
router.post("/:id/unshare", authenticateJWT, controller.unshare);
router.post("/:id/review", authenticateJWT, checkValidationRequestLimit, controller.requestReview);

// GET /question-sets/:questionSetId/quiz-attempts - Get all quiz attempts for a question set
router.get(
  "/:questionSetId/quiz-attempts",
  authenticateJWT,
  inputValidation(quizAttemptsQuerySchema),
  cacheResponse({ ttl: 300 }),
  require("../controllers/quizAttempts.controller").listByQuestionSet
);

module.exports = router;
