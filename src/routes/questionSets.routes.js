const express = require('express');
const Joi = require('joi');
const controller = require('../controllers/questionSets.controller');
const authenticateJWT = require('../middleware/authenticateJWT');
const rateLimit = require('../middleware/rateLimit');
const { expensiveLimiter } = require('../config/rateLimits');
const inputValidation = require('../middleware/inputValidation');
const idempotencyKey = require('../middleware/idempotencyKey');
const { checkQuestionGenerationLimit } = require('../middleware/checkEntitlement');
const { cacheResponse } = require('../middleware/cacheResponse');

const router = express.Router();

const genSchema = Joi.object({
	body: Joi.object({
		subjectId: Joi.string().required(),
		title: Joi.string().min(1).required(),
		numQuestions: Joi.number().integer().min(1).max(100).default(10),
		difficulty: Joi.string().valid('Biết', 'Hiểu', 'Vận dụng', 'Vận dụng cao').default('Hiểu'),
	}),
}).unknown(true);

// Cache GET requests (10 minutes TTL)
router.get('/', authenticateJWT, cacheResponse({ ttl: 600 }), controller.list);
router.post('/generate', expensiveLimiter, authenticateJWT, checkQuestionGenerationLimit, idempotencyKey, inputValidation(genSchema), controller.generate);
router.get('/:id', authenticateJWT, cacheResponse({ ttl: 600 }), controller.get);
router.patch('/:id', authenticateJWT, controller.update);
router.post('/:id/share', authenticateJWT, controller.share);
router.post('/:id/review', authenticateJWT, controller.requestReview);

module.exports = router;
