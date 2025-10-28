const express = require('express');
const Joi = require('joi');
const controller = require('../controllers/validationRequests.controller');
const authenticateJWT = require('../middleware/authenticateJWT');
const authorizeRole = require('../middleware/authorizeRole');
const rateLimit = require('../middleware/rateLimit');
const inputValidation = require('../middleware/inputValidation');

const router = express.Router();

// Validation schemas
const createRequestSchema = Joi.object({
  body: Joi.object({
    setId: Joi.string().required(),
  }),
}).unknown(true);

const assignExpertSchema = Joi.object({
  params: Joi.object({
    id: Joi.string().required(),
  }),
  body: Joi.object({
    expertId: Joi.string().required(),
  }),
}).unknown(true);

const completeReviewSchema = Joi.object({
  params: Joi.object({
    id: Joi.string().required(),
  }),
  body: Joi.object({
    approved: Joi.boolean().required(),
    feedback: Joi.string().max(1000).optional(),
  }),
}).unknown(true);

const getRequestSchema = Joi.object({
  params: Joi.object({
    id: Joi.string().required(),
  }),
}).unknown(true);

const listRequestsSchema = Joi.object({
  query: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    pageSize: Joi.number().integer().min(1).max(100).default(20),
    status: Joi.string().valid('PendingAssignment', 'Assigned', 'Completed').optional(),
  }),
}).unknown(true);

/**
 * Validation Requests Routes
 * Base: /api/v1/validation-requests
 */

// POST /api/v1/validation-requests - Create validation request (Learner/Expert)
router.post(
  '/',
  rateLimit({ limit: 30 }),
  authenticateJWT,
  inputValidation(createRequestSchema),
  controller.createRequest
);

// POST /api/v1/validation-requests/:id/assign - Assign expert (Admin only)
router.post(
  '/:id/assign',
  rateLimit({ limit: 30 }),
  authenticateJWT,
  authorizeRole('Admin'),
  inputValidation(assignExpertSchema),
  controller.assignExpert
);

// POST /api/v1/validation-requests/:id/complete - Complete review (Expert only)
router.post(
  '/:id/complete',
  rateLimit({ limit: 30 }),
  authenticateJWT,
  authorizeRole('Expert'),
  inputValidation(completeReviewSchema),
  controller.completeReview
);

// GET /api/v1/validation-requests/:id - Get validation request details
router.get(
  '/:id',
  rateLimit({ limit: 60 }),
  authenticateJWT,
  inputValidation(getRequestSchema),
  controller.getRequest
);

// GET /api/v1/validation-requests - List validation requests (role-based filtering)
router.get(
  '/',
  rateLimit({ limit: 60 }),
  authenticateJWT,
  inputValidation(listRequestsSchema),
  controller.listRequests
);

module.exports = router;
